mod commands;
mod ffmpeg;
mod export;
mod watcher;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(watcher::WatcherState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::create_project,
            commands::open_project,
            commands::save_project_state,
            commands::list_recent_projects,
            ffmpeg::generate_waveform,
            ffmpeg::assemble_roughcut,
            export::export_fcpxml,
            export::export_capcut,
            watcher::watch_project,
            watcher::unwatch_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
