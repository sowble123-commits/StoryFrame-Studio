use std::collections::VecDeque;
use std::sync::LazyLock;
use std::path::Path;

use regex::Regex;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

static TIME_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)").unwrap());

/// "time=00:00:05.12" -> 5.12 (한 청크에 여러 개면 마지막 값 사용)
fn parse_progress_secs(line: &str) -> Option<f64> {
    let c = TIME_RE.captures_iter(line).last()?;
    let h: f64 = c.get(1)?.as_str().parse().ok()?;
    let m: f64 = c.get(2)?.as_str().parse().ok()?;
    let s: f64 = c.get(3)?.as_str().parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// ffprobe로 미디어 길이(초) 조회
pub async fn probe_duration(app: &AppHandle, path: &str) -> Result<f64, String> {
    let out = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|e| format!("Invalid duration for '{}': {}", path, e))
}

#[tauri::command]
pub async fn generate_waveform(
    app: AppHandle,
    audio_path: String,
    buckets: Option<usize>,
) -> Result<Value, String> {
    const SAMPLE_RATE: u32 = 8000;
    let buckets = buckets.unwrap_or(200).clamp(10, 4000);
    let tmp = std::env::temp_dir().join(format!("sf_wave_{}.raw", Uuid::new_v4()));

    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y", "-v", "error",
            "-i", audio_path.as_str(),
            "-vn", "-ac", "1", "-ar", &SAMPLE_RATE.to_string(),
            "-f", "s16le",
            &tmp.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !out.status.success() {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    let bytes_res = tokio::fs::read(&tmp).await.map_err(|e| format!("Failed to read PCM: {}", e));
    let _ = tokio::fs::remove_file(&tmp).await;
    let bytes = bytes_res?;

    let samples: Vec<i16> = bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect();
    if samples.is_empty() {
        return Err("No audio samples decoded".to_string());
    }

    let bucket_size = samples.len().div_ceil(buckets).max(1);
    let peaks: Vec<f32> = samples
        .chunks(bucket_size)
        .map(|c| {
            let max = c.iter().map(|s| (*s as i32).unsigned_abs()).max().unwrap_or(0);
            (max as f32 / 32768.0).min(1.0)
        })
        .collect();

    Ok(json!({
        "peaks": peaks,
        "length": peaks.len(),
        "duration": samples.len() as f64 / SAMPLE_RATE as f64
    }))
}

#[derive(serde::Deserialize, Clone)]
pub struct ClipConfig {
    pub path: String,
    #[serde(rename = "inPoint")]
    pub in_point: Option<f64>,
    #[serde(rename = "outPoint")]
    pub out_point: Option<f64>,
}

#[tauri::command]
pub async fn assemble_roughcut(
    app: AppHandle,
    clips: Vec<ClipConfig>,
    output_path: String,
    total_duration: Option<f64>,
) -> Result<String, String> {
    if clips.is_empty() {
        return Err("No clips to export".to_string());
    }

    // 전체 길이 확보 (Tokio Spawn 병렬 처리로 성능 개선)
    let total = match total_duration {
        Some(d) if d > 0.0 => d,
        _ => {
            let mut tasks = Vec::with_capacity(clips.len());
            for c in &clips {
                let app_c = app.clone();
                let path_c = c.path.clone();
                let in_pt = c.in_point.unwrap_or(0.0);
                let out_pt = c.out_point;
                tasks.push(tokio::spawn(async move {
                    let dur = probe_duration(&app_c, &path_c).await.unwrap_or(0.0);
                    let actual_out = out_pt.unwrap_or(dur);
                    (actual_out - in_pt).max(0.0)
                }));
            }
            let mut sum = 0.0;
            for t in tasks {
                if let Ok(d) = t.await {
                    sum += d;
                }
            }
            sum
        }
    };

    let list_path = std::env::temp_dir().join(format!("sf_concat_{}.txt", Uuid::new_v4()));
    
    // 비동기 파일 작성 및 단일 문자열 버퍼 구성
    let mut content = String::with_capacity(clips.len() * 128);
    for clip in &clips {
        let escaped = clip.path.replace('\'', "'\\''");
        content.push_str(&format!("file '{}'\n", escaped));
        
        if let Some(in_pt) = clip.in_point {
            content.push_str(&format!("inpoint {:.3}\n", in_pt));
        }
        if let Some(out_pt) = clip.out_point {
            content.push_str(&format!("outpoint {:.3}\n", out_pt));
        }
    }
    
    if let Err(e) = tokio::fs::write(&list_path, content).await {
        return Err(format!("Failed to write list file: {}", e));
    }

    let spawn_res = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))
        .and_then(|cmd| {
            cmd.args([
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", &list_path.to_string_lossy(),
                "-c", "copy",
                output_path.as_str(),
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))
        });

    let (mut rx, _child) = match spawn_res {
        Ok(v) => v,
        Err(e) => {
            let _ = tokio::fs::remove_file(&list_path).await;
            return Err(e);
        }
    };

    let _ = app.emit("render-progress", 0.0_f64);

    let mut tail: VecDeque<String> = VecDeque::with_capacity(20);
    let mut last_pct = -1.0_f64;
    let mut success = false;
    let mut buffer = Vec::new(); // Stderr 파편화를 막는 바이트 버퍼

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                buffer.extend_from_slice(&bytes);
                // 진행률은 '\r'로 덮어쓰기 출력, 에러는 '\n'
                while let Some(pos) = buffer.iter().position(|&b| b == b'\r' || b == b'\n') {
                    if pos > 0 {
                        let line_bytes = &buffer[..pos];
                        let line = String::from_utf8_lossy(line_bytes);
                        
                        if let Some(cur) = parse_progress_secs(&line) {
                            if total > 0.0 {
                                let pct = ((cur / total) * 100.0).clamp(0.0, 99.0);
                                let pct = (pct * 10.0).round() / 10.0;
                                if pct - last_pct >= 0.5 {
                                    last_pct = pct;
                                    let _ = app.emit("render-progress", pct);
                                }
                            }
                        } else {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                if tail.len() == 20 {
                                    tail.pop_front();
                                }
                                tail.push_back(trimmed.to_string());
                            }
                        }
                    }
                    // 분리한 라인 및 딜리미터 제거
                    buffer.drain(..=pos);
                }
            }
            CommandEvent::Error(e) => {
                if tail.len() == 20 {
                    tail.pop_front();
                }
                tail.push_back(e);
            }
            CommandEvent::Terminated(p) => {
                success = p.code == Some(0);
                break;
            }
            _ => {}
        }
    }

    let _ = tokio::fs::remove_file(&list_path).await;

    if !success {
        return Err(tail.into_iter().collect::<Vec<_>>().join("\n"));
    }
    let _ = app.emit("render-progress", 100.0_f64);
    Ok(output_path)
}

#[tauri::command]
pub async fn import_media(
    app: AppHandle,
    source_path: String,
    project_path: String,
) -> Result<Value, String> {
    let src_path = Path::new(&source_path);
    let proj_path = Path::new(&project_path);

    if !tokio::fs::try_exists(&src_path).await.unwrap_or(false) {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    let assets_dir = proj_path.join("assets");

    tokio::fs::create_dir_all(&assets_dir)
        .await
        .map_err(|e| format!("Failed to create assets directory: {}", e))?;

    let file_name = src_path.file_name().ok_or("Invalid source path")?;
    let dest_media_path = assets_dir.join(file_name);

    tokio::fs::copy(&src_path, &dest_media_path)
        .await
        .map_err(|e| format!("Failed to copy media file: {}", e))?;

    let file_stem = src_path.file_stem().unwrap_or_default().to_string_lossy();
    let thumb_name = format!("{}_thumb.jpg", file_stem);
    let dest_thumb_path = assets_dir.join(&thumb_name);

    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y",
            "-i",
            &dest_media_path.to_string_lossy(),
            "-ss",
            "00:00:00",
            "-vframes",
            "1",
            "-q:v",
            "2",
            &dest_thumb_path.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg for thumbnail: {}", e))?;

    let mut final_thumb = format!("assets/{}", thumb_name);
    if !out.status.success() {
        eprintln!("Thumbnail extraction failed (might be audio only): {}", String::from_utf8_lossy(&out.stderr));
        final_thumb = String::new();
    }

    Ok(json!({
        "mediaPath": format!("assets/{}", file_name.to_string_lossy()),
        "thumbnailPath": final_thumb
    }))
}

#[tauri::command]
pub async fn extract_last_frame(
    app: AppHandle,
    video_path: String,
    timestamp: f64,
    project_path: String,
) -> Result<String, String> {
    let proj_path = Path::new(&project_path);
    let assets_dir = proj_path.join("assets");

    let full_video_path = if Path::new(&video_path).is_absolute() {
        Path::new(&video_path).to_path_buf()
    } else {
        proj_path.join(&video_path)
    };

    let stem = full_video_path.file_stem().unwrap_or_default().to_string_lossy();
    let thumb_name = format!("{}_lastframe_{}.jpg", stem, Uuid::new_v4().simple());
    let dest_thumb_path = assets_dir.join(&thumb_name);

    let timestamp_str = format!("{:.3}", timestamp.max(0.0));

    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y",
            "-ss",
            &timestamp_str,
            "-i",
            &full_video_path.to_string_lossy(),
            "-vframes",
            "1",
            "-q:v",
            "2",
            &dest_thumb_path.to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute ffmpeg for frame extraction: {}", e))?;

    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    Ok(format!("assets/{}", thumb_name))
}
