use std::collections::VecDeque;
use std::sync::LazyLock;

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
    let h: f64 = c[1].parse().ok()?;
    let m: f64 = c[2].parse().ok()?;
    let s: f64 = c[3].parse().ok()?;
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
        let _ = std::fs::remove_file(&tmp);
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    let bytes = std::fs::read(&tmp).map_err(|e| format!("Failed to read PCM: {}", e));
    let _ = std::fs::remove_file(&tmp);
    let bytes = bytes?;

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

#[derive(serde::Deserialize)]
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
    total_duration: Option<f64>, // 프론트: totalDuration (생략 시 ffprobe 합산)
) -> Result<String, String> {
    use std::io::Write;

    if clips.is_empty() {
        return Err("No clips to export".to_string());
    }

    // 전체 길이 확보
    let total = match total_duration {
        Some(d) if d > 0.0 => d,
        _ => {
            let mut sum = 0.0;
            for c in &clips {
                let dur = probe_duration(&app, &c.path).await.unwrap_or(0.0);
                let in_pt = c.in_point.unwrap_or(0.0);
                let out_pt = c.out_point.unwrap_or(dur);
                sum += (out_pt - in_pt).max(0.0);
            }
            sum
        }
    };

    // 동시 실행 충돌 방지를 위해 고유 파일명 사용
    let list_path = std::env::temp_dir().join(format!("sf_concat_{}.txt", Uuid::new_v4()));
    {
        let mut f = std::fs::File::create(&list_path)
            .map_err(|e| format!("Failed to create list file: {}", e))?;
        for clip in &clips {
            let escaped = clip.path.replace('\'', "'\\''");
            writeln!(f, "file '{}'", escaped)
                .map_err(|e| format!("Failed to write list file: {}", e))?;
            
            if let Some(in_pt) = clip.in_point {
                writeln!(f, "inpoint {:.3}", in_pt)
                    .map_err(|e| format!("Failed to write inpoint: {}", e))?;
            }
            if let Some(out_pt) = clip.out_point {
                writeln!(f, "outpoint {:.3}", out_pt)
                    .map_err(|e| format!("Failed to write outpoint: {}", e))?;
            }
        }
    }

    let spawn = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", &list_path.to_string_lossy(),
            "-c", "copy",
            output_path.as_str(),
        ])
        .spawn();

    let (mut rx, _child) = match spawn {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&list_path);
            return Err(format!("Failed to spawn ffmpeg: {}", e));
        }
    };

    let _ = app.emit("render-progress", 0.0_f64);

    let mut tail: VecDeque<String> = VecDeque::with_capacity(20); // 에러 메시지용 stderr 마지막 줄들
    let mut push_tail = |s: String| {
        if tail.len() == 20 {
            tail.pop_front();
        }
        tail.push_back(s);
    };
    let mut last_pct = -1.0_f64;
    let mut success = false;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                if let Some(cur) = parse_progress_secs(&line) {
                    if total > 0.0 {
                        // 완료 전에는 99%로 제한, 100%는 정상 종료 후에만 전송
                        let pct = ((cur / total) * 100.0).clamp(0.0, 99.0);
                        let pct = (pct * 10.0).round() / 10.0;
                        if pct - last_pct >= 0.5 {
                            last_pct = pct;
                            let _ = app.emit("render-progress", pct);
                        }
                    }
                } else if !line.trim().is_empty() {
                    push_tail(line.trim().to_string());
                }
            }
            CommandEvent::Error(e) => push_tail(e),
            CommandEvent::Terminated(p) => {
                success = p.code == Some(0);
                break;
            }
            _ => {}
        }
    }

    let _ = std::fs::remove_file(&list_path);

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
    use std::path::Path;

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

    // Extract thumbnail using sidecar (at 00:00:00)
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
        // Fallback: 오디오 파일 등 썸네일 추출 불가 시 에러 반환 대신 빈 문자열 할당
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
    use std::path::Path;

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

    let timestamp_str = format!("{:.3}", timestamp);

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
