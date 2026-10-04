use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use serde_json::{json, Value};

#[tauri::command]
pub async fn check_ffmpeg(app: AppHandle) -> Result<String, String> {
    let output = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .arg("-version")
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;
        
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().next().unwrap_or("Unknown version").to_string())
}

#[tauri::command]
pub async fn generate_waveform(app: AppHandle, audio_path: String) -> Result<Value, String> {
    // Basic implementation: attempt to run ffprobe or ffmpeg to check the file.
    // In a real scenario, this would use a complex ffmpeg command to parse audiowaveform or astats.
    // For now, we simulate extraction by confirming the file exists and returning a dummy json.
    
    let output = app.shell().sidecar("ffprobe")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(vec!["-i", &audio_path, "-show_format", "-v", "quiet", "-of", "json"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;
        
    if !output.status.success() {
        return Err("Failed to read audio file with ffprobe".to_string());
    }

    // Dummy peak data for Phase 4 UI visualization
    let peaks: Vec<f32> = (0..100).map(|i| (i as f32 / 100.0).sin().abs()).collect();
    
    Ok(json!({
        "peaks": peaks,
        "length": peaks.len()
    }))
}

#[tauri::command]
pub async fn generate_thumbnail(app: AppHandle, video_path: String, output_path: String, time: Option<f64>) -> Result<String, String> {
    let time_str = time.unwrap_or(0.0).to_string();
    
    let output = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(vec![
            "-y", 
            "-i", &video_path,
            "-ss", &time_str,
            "-vframes", "1",
            "-q:v", "2",
            &output_path
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    
    Ok(output_path)
}

#[tauri::command]
pub async fn extract_last_frame(app: AppHandle, video_path: String, output_path: String) -> Result<String, String> {
    // To get the last frame, we can use sseof or just use -vframes 1 from a specific point.
    // For simplicity in this rough cut, we'll run a command that grabs the last frame.
    // A common trick is `-sseof -3 -i ... -update 1 -q:v 2` but since it's an API, 
    // we use a generic filter.
    
    let output = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(vec![
            "-y", 
            "-sseof", "-0.1",
            "-i", &video_path,
            "-vframes", "1",
            "-update", "1",
            &output_path
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;
        
    if !output.status.success() {
        // Fallback: If sseof fails (some formats), try extracting at 0s
        let fallback = app.shell().sidecar("ffmpeg")
            .unwrap()
            .args(vec![
                "-y", 
                "-i", &video_path,
                "-vframes", "1",
                &output_path
            ])
            .output()
            .await;
            
        if let Ok(res) = fallback {
            if !res.status.success() {
                return Err(String::from_utf8_lossy(&res.stderr).into_owned());
            }
        } else {
            return Err("Failed to extract frame".to_string());
        }
    }
    
    Ok(output_path)
}

#[tauri::command]
pub async fn assemble_roughcut(app: AppHandle, clips: Vec<String>, output_path: String) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::process::Stdio;

    let temp_dir = std::env::temp_dir();
    let list_file_path = temp_dir.join("concat_list.txt");
    
    let mut file = std::fs::File::create(&list_file_path).map_err(|e| format!("Failed to create list file: {}", e))?;
    for clip in &clips {
        let escaped_path = clip.replace('\'', "'\\''");
        writeln!(file, "file '{}'", escaped_path).map_err(|e| format!("Failed to write to list file: {}", e))?;
    }

    let (mut rx, child) = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args(vec![
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file_path.to_str().unwrap(),
            "-c", "copy",
            &output_path
        ])
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    app.emit("render-progress", 0.0).unwrap_or(());
    
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let l = String::from_utf8_lossy(&line);
                if l.contains("time=") || l.contains("frame=") {
                    app.emit("render-progress", 50.0).unwrap_or(());
                }
            }
            _ => {}
        }
    }
    
    // Once the channel is closed, the process should be finishing or finished.
    // We don't have to wait on `child` typically if the channel is done, but we can.
    app.emit("render-progress", 100.0).unwrap_or(());
    Ok(output_path)
}
