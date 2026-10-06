use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct RecentProject {
    pub name: String,
    pub path: String,
    pub last_opened: u64,
}

fn get_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

fn update_recent_projects(app: &AppHandle, name: &str, project_path: &str) -> Result<(), String> {
    let config_dir = get_config_dir(app)?;
    let recent_path = config_dir.join("recent_projects.json");
    
    let mut recents: Vec<RecentProject> = if recent_path.exists() {
        let content = fs::read_to_string(&recent_path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Remove if already exists
    recents.retain(|p| p.path != project_path);
    
    // Add to top
    recents.insert(0, RecentProject {
        name: name.to_string(),
        path: project_path.to_string(),
        last_opened: now,
    });

    // Keep top 20
    if recents.len() > 20 {
        recents.truncate(20);
    }

    let json = serde_json::to_string_pretty(&recents).map_err(|e| e.to_string())?;
    fs::write(recent_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn create_project(app: AppHandle, name: String, path: String) -> Result<Value, String> {
    let project_dir = PathBuf::from(&path).join(&name);
    
    if project_dir.exists() {
        return Err("Project directory already exists".to_string());
    }

    fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    
    // Create assets folder
    fs::create_dir_all(project_dir.join("assets")).map_err(|e| e.to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let id = uuid::Uuid::new_v4().to_string();

    let initial_state = serde_json::json!({
        "id": id,
        "name": name,
        "createdAt": now,
        "updatedAt": now,
        "cuts": [],
        "assets": []
    });

    let state_path = project_dir.join("project_state.json");
    let state_str = serde_json::to_string_pretty(&initial_state).map_err(|e| e.to_string())?;
    fs::write(&state_path, state_str).map_err(|e| e.to_string())?;

    let proj_path_str = project_dir.to_string_lossy().to_string();
    update_recent_projects(&app, &name, &proj_path_str)?;

    // Return the state with the project path included or we can just let frontend know the path
    let mut response = initial_state.clone();
    response["projectPath"] = serde_json::json!(proj_path_str);
    
    Ok(response)
}

#[tauri::command]
pub async fn open_project(app: AppHandle, path: Option<String>) -> Result<Value, String> {
    let folder_path = match path {
        Some(p) => p,
        None => {
            let picked = app.dialog().file().blocking_pick_folder().map(|p| p.to_string());
            match picked {
                Some(p) => p,
                None => return Err("Cancelled".to_string()),
            }
        }
    };

    let state_path = PathBuf::from(&folder_path).join("project_state.json");
    if !state_path.exists() {
        return Err("Not a valid StoryFrame project (project_state.json not found)".to_string());
    }

    let state_str = fs::read_to_string(&state_path).map_err(|e| e.to_string())?;
    let mut state: Value = serde_json::from_str(&state_str).map_err(|e| e.to_string())?;
    
    let name = state["name"].as_str().unwrap_or("Untitled").to_string();
    update_recent_projects(&app, &name, &folder_path)?;

    state["projectPath"] = serde_json::json!(folder_path);

    Ok(state)
}

#[tauri::command]
pub fn save_project_state(path: String, state: Value) -> Result<(), String> {
    let state_path = PathBuf::from(&path).join("project_state.json");
    let state_str = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(state_path, state_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_recent_projects(app: AppHandle) -> Result<Vec<RecentProject>, String> {
    let config_dir = get_config_dir(&app)?;
    let recent_path = config_dir.join("recent_projects.json");
    
    if !recent_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
    let recents: Vec<RecentProject> = serde_json::from_str(&content).unwrap_or_else(|_| vec![]);
    Ok(recents)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, path: String) -> Result<(), String> {
    let project_dir = PathBuf::from(&path);
    if project_dir.exists() {
        fs::remove_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    
    // Remove from recent_projects.json
    let config_dir = get_config_dir(&app)?;
    let recent_path = config_dir.join("recent_projects.json");
    if recent_path.exists() {
        if let Ok(content) = fs::read_to_string(&recent_path) {
            if let Ok(mut recents) = serde_json::from_str::<Vec<RecentProject>>(&content) {
                recents.retain(|p| p.path != path);
                if let Ok(json) = serde_json::to_string_pretty(&recents) {
                    let _ = fs::write(recent_path, json);
                }
            }
        }
    }
    
    Ok(())
}



use little_exif::metadata::Metadata;
use little_exif::exif_tag::ExifTag;

#[tauri::command]
pub fn inject_metadata(file_path: String, prompt: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    // We try to read existing metadata, or create new if none exists
    let mut metadata = Metadata::new_from_path(path).unwrap_or(Metadata::new());
    
    metadata.set_tag(
        ExifTag::ImageDescription(prompt)
    );
    
    match metadata.write_to_file(path) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write metadata: {:?}", e))
    }
}
