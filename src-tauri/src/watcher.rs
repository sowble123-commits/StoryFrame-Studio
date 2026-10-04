use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, TryRecvError};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const STATE_FILE: &str = "project_state.json";

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct FileChangeEvent {
    pub paths: Vec<PathBuf>,
    pub kind_description: String,
}

#[derive(Default)]
pub struct WatcherState {
    pub stop_tx: Mutex<Option<mpsc::Sender<()>>>,
}

fn stop_current(state: &WatcherState) -> Result<(), String> {
    let mut lock = state
        .stop_tx
        .lock()
        .map_err(|e| format!("Watcher lock poisoned: {e}"))?;
    if let Some(tx) = lock.take() {
        // 수신측이 이미 종료됐어도 무방
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub fn watch_project(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let watch_target = PathBuf::from(&path);
    if !watch_target.exists() {
        return Err("Path does not exist".to_string());
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (tx, rx) = mpsc::channel::<DebounceEventResult>();

    // 이전 감시자 중단 + 새 센더 등록 (poisoned 시 에러 전파)
    {
        let mut lock = state
            .stop_tx
            .lock()
            .map_err(|e| format!("Watcher lock poisoned: {e}"))?;
        if let Some(old) = lock.take() {
            let _ = old.send(());
        }
        *lock = Some(stop_tx);
    }

    std::thread::Builder::new()
        .name("project-watcher".into())
        .spawn(move || {
            // debouncer는 이 스레드가 소유 → 스레드 종료 시 Drop으로 watcher/내부 스레드 정리
            let mut debouncer = match new_debouncer(Duration::from_millis(500), None, tx) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("Failed to initialize debouncer: {e}");
                    return;
                }
            };

            if let Err(e) = debouncer.watcher().watch(&watch_target, RecursiveMode::Recursive) {
                eprintln!("Failed to watch directory: {e}");
                return;
            }
            println!("Started watching: {:?}", watch_target);

            loop {
                // 중단 신호: 신호 수신 또는 센더 소멸(앱 종료/교체) 모두 종료 조건
                match stop_rx.try_recv() {
                    Ok(()) | Err(TryRecvError::Disconnected) => break,
                    Err(TryRecvError::Empty) => {}
                }

                match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ok(events)) => {
                        let changed: Vec<PathBuf> = events
                            .into_iter()
                            .flat_map(|e| e.event.paths)
                            .filter(|p| p.ends_with(STATE_FILE))
                            .collect();

                        if !changed.is_empty() {
                            let payload = FileChangeEvent {
                                paths: changed,
                                kind_description: "StateChanged".to_string(),
                            };
                            if let Err(e) = app.emit("project-state-changed", payload) {
                                eprintln!("Failed to emit event: {e}");
                            }
                        }
                    }
                    Ok(Err(errors)) => {
                        for err in errors {
                            eprintln!("Watcher internal error: {err:?}");
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    // 채널 끊김: busy-loop 방지를 위해 반드시 종료
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            println!("Stopped watching: {:?}", watch_target);
        })
        .map_err(|e| format!("Failed to spawn watcher thread: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn unwatch_project(state: State<'_, WatcherState>) -> Result<(), String> {
    stop_current(&state)
}
