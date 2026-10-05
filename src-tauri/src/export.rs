use std::fs;
use std::path::Path;

use serde_json::json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::ffmpeg::probe_duration;

// ── FCPXML 타임베이스: 30fps = frameDuration 100/3000s ──
const TIMEBASE: u64 = 3000;
const FRAME_TICKS: u64 = 100;

/// 초 -> FCPXML Rational Time. 프레임 경계로 반올림 (예: 3.3333s -> "10000/3000s")
fn to_rational(seconds: f64) -> String {
    let frames = (seconds.max(0.0) * TIMEBASE as f64 / FRAME_TICKS as f64).round() as u64;
    format!("{}/{}s", frames * FRAME_TICKS, TIMEBASE)
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// 로컬 경로 -> file:/// URL (Windows 역슬래시/공백/한글 퍼센트 인코딩)
fn path_to_file_url(p: &str) -> String {
    let norm = p.replace('\\', "/");
    let mut enc = String::with_capacity(norm.len());
    for b in norm.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' | b'/' | b':' => enc.push(b as char),
            _ => enc.push_str(&format!("%{:02X}", b)),
        }
    }
    if enc.starts_with('/') {
        format!("file://{}", enc) // unix: /a/b -> file:///a/b
    } else {
        format!("file:///{}", enc) // windows: C:/a -> file:///C:/a
    }
}

fn clip_name(path: &str, idx: usize) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("clip_{}", idx))
}

async fn probe_all(app: &AppHandle, clips: &[crate::ffmpeg::ClipConfig]) -> Result<Vec<(f64, f64)>, String> {
    let mut v = Vec::with_capacity(clips.len());
    for c in clips {
        let full_d = probe_duration(app, &c.path)
            .await
            .map_err(|e| format!("'{}' 길이 확인 실패: {}", c.path, e))?;
        
        let in_pt = c.in_point.unwrap_or(0.0);
        let out_pt = c.out_point.unwrap_or(full_d);
        let cut_d = (out_pt - in_pt).max(0.0);
        v.push((full_d, cut_d));
    }
    Ok(v)
}

#[tauri::command]
pub async fn export_fcpxml(
    app: AppHandle,
    clips: Vec<crate::ffmpeg::ClipConfig>,
    output_path: String,
) -> Result<(), String> {
    if clips.is_empty() {
        return Err("No clips to export".to_string());
    }
    let durations = probe_all(&app, &clips).await?;

    let mut resources = vec![format!(
        r#"        <format id="r1" name="FFVideoFormat1080p30" frameDuration="{}" width="1920" height="1080"/>"#,
        to_rational(FRAME_TICKS as f64 / TIMEBASE as f64)
    )];
    let mut spine: Vec<String> = Vec::new();
    let mut offset = 0.0_f64;

    for (i, (clip, (full_dur, cut_dur))) in clips.iter().zip(&durations).enumerate() {
        let id = format!("r{}", i + 2);
        let name = xml_escape(&clip_name(&clip.path, i));
        let full_dur_r = to_rational(*full_dur);
        let cut_dur_r = to_rational(*cut_dur);
        let start_r = to_rational(clip.in_point.unwrap_or(0.0));

        resources.push(format!(
            r#"        <asset id="{id}" name="{name}" start="0s" duration="{full_dur_r}" hasVideo="1" hasAudio="1" format="r1">
            <media-rep kind="original-media" src="{src}"/>
        </asset>"#,
            src = xml_escape(&path_to_file_url(&clip.path)),
        ));
        spine.push(format!(
            r#"                    <asset-clip ref="{id}" name="{name}" offset="{off}" start="{start_r}" duration="{cut_dur_r}" format="r1"/>"#,
            off = to_rational(offset),
        ));
        offset += *cut_dur; // 누적 offset
    }

    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
    <resources>
{resources}
    </resources>
    <library>
        <event name="StoryFrame">
            <project name="StoryFrame Project">
                <sequence format="r1" duration="{total}" tcStart="0s" tcFormat="NDF">
                    <spine>
{spine}
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>
"#,
        resources = resources.join("\n"),
        spine = spine.join("\n"),
        total = to_rational(offset),
    );

    fs::write(&output_path, xml).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_capcut(
    app: AppHandle,
    clips: Vec<crate::ffmpeg::ClipConfig>,
    output_path: String,
) -> Result<(), String> {
    if clips.is_empty() {
        return Err("No clips to export".to_string());
    }
    let durations = probe_all(&app, &clips).await?;
    let to_us = |s: f64| (s * 1_000_000.0).round() as u64; // CapCut은 마이크로초 단위

    let mut materials = Vec::new();
    let mut segments = Vec::new();
    let mut cursor_us: u64 = 0;

    for (clip, (full_dur, cut_dur)) in clips.iter().zip(&durations) {
        let material_id = Uuid::new_v4().to_string().to_uppercase();
        let dur_us = to_us(*cut_dur);
        let start_us = to_us(clip.in_point.unwrap_or(0.0));
        let full_dur_us = to_us(*full_dur);

        materials.push(json!({
            "id": material_id,
            "type": "video",
            "path": clip.path,
            "material_name": clip_name(&clip.path, materials.len()),
            "duration": full_dur_us
        }));
        segments.push(json!({
            "id": Uuid::new_v4().to_string().to_uppercase(),
            "material_id": material_id,
            "source_timerange": { "start": start_us, "duration": dur_us },  // In/Out (원본 구간)
            "target_timerange": { "start": cursor_us, "duration": dur_us }, // 타임라인 배치
            "speed": 1.0,
            "volume": 1.0,
            "visible": true
        }));
        cursor_us += dur_us;
    }

    // 주의: CapCut 초안 포맷은 비공식이며 버전별로 필드가 다릅니다 (최소 구조).
    let draft = json!({
        "id": Uuid::new_v4().to_string().to_uppercase(),
        "fps": 30.0,
        "duration": cursor_us,
        "materials": { "videos": materials },
        "tracks": [{
            "id": Uuid::new_v4().to_string().to_uppercase(),
            "type": "video",
            "segments": segments
        }]
    });

    let s = serde_json::to_string_pretty(&draft).map_err(|e| e.to_string())?;
    fs::write(&output_path, s).map_err(|e| e.to_string())
}
