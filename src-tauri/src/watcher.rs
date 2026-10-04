use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct FileChangeEvent {
    pub paths: Vec<PathBuf>,
    pub kind_description: String,
}

pub struct WatcherState {
    pub stop_tx: Mutex<Option<mpsc::Sender<()>>>,
}

#[tauri::command]
pub fn watch_project(app: AppHandle, state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    let watch_target = PathBuf::from(&path);
    if !watch_target.exists() {
        return Err("Path does not exist".to_string());
    }

    // Stop existing watcher if any
    if let Ok(mut lock) = state.stop_tx.lock() {
        if let Some(tx) = lock.take() {
            let _ = tx.send(());
        }
        
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        *lock = Some(stop_tx);

        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        
        // Spawn the watcher thread
        std::thread::spawn(move || {
            let mut debouncer = match new_debouncer(Duration::from_millis(500), None, tx) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("Failed to initialize debouncer: {}", e);
                    return;
                }
            };

            if let Err(e) = debouncer.watcher().watch(&watch_target, RecursiveMode::Recursive) {
                eprintln!("Failed to watch directory: {}", e);
                return;
            }
            
            println!("Started watching: {:?}", watch_target);

            loop {
                // Check if we need to stop
                if stop_rx.try_recv().is_ok() {
                    println!("Stopped watching: {:?}", watch_target);
                    break;
                }

                if let Ok(res) = rx.recv_timeout(Duration::from_millis(100)) {
                    match res {
                        Ok(events) => {
                            let mut state_changed = false;
                            for event in &events {
                                for path in &event.paths {
                                    if path.ends_with("project_state.json") {
                                        state_changed = true;
                                        break;
                                    }
                                }
                            }
                            
                            if state_changed {
                                let payload = FileChangeEvent {
                                    paths: events.into_iter().flat_map(|e| e.paths).collect(),
                                    kind_description: "StateChanged".to_string(),
                                };
                                
                                if let Err(e) = app.emit("project-state-changed", payload) {
                                    eprintln!("Failed to emit event: {}", e);
                                }
                            }
                        }
                        Err(errors) => {
                            for err in errors {
                                eprintln!("Watcher internal error: {:?}", err);
                            }
                        }
                    }
                }
            }
        });
    }

    Ok(())
}
