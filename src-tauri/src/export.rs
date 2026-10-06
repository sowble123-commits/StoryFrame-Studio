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
    // NaN이나 Infinity에 의한 panic 방지 (Error Handling 강화)
    let safe_sec = if seconds.is_finite() && seconds >= 0.0 { seconds } else { 0.0 };
    let frames = (safe_sec * TIMEBASE as f64 / FRAME_TICKS as f64).round() as u64;
    format!("{}/{}s", frames * FRAME_TICKS, TIMEBASE)
}

/// 안전하고 메모리 효율적인 XML 이스케이프 (Single-pass)
fn xml_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len() + 10);
    for c in s.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(c),
        }
    }
    escaped
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

/// 모든 클립의 길이를 병렬로 조회하여 성능 극대화 (Tokio Spawn 패턴)
async fn probe_all(app: &AppHandle, clips: &[crate::ffmpeg::ClipConfig]) -> Result<Vec<(f64, f64)>, String> {
    let mut tasks = Vec::with_capacity(clips.len());
    for c in clips {
        let app_c = app.clone();
        let path_c = c.path.clone();
        let in_pt = c.in_point.unwrap_or(0.0);
        let out_pt = c.out_point;
        
        tasks.push(tokio::spawn(async move {
            let full_d = probe_duration(&app_c, &path_c)
                .await
                .map_err(|e| format!("'{}' 길이 확인 실패: {}", path_c, e))?;
            
            let cut_d = (out_pt.unwrap_or(full_d) - in_pt).max(0.0);
            Ok::<(f64, f64), String>((full_d, cut_d))
        }));
    }
    
    let mut results = Vec::with_capacity(clips.len());
    for t in tasks {
        let res = t.await.map_err(|e| format!("태스크 실행 오류: {}", e))??;
        results.push(res);
    }
    Ok(results)
}

#[tauri::command]
pub async fn export_fcpxml(
    app: AppHandle,
    clips: Vec<crate::ffmpeg::ClipConfig>,
    output_path: String,
) -> Result<(), String> {
    if clips.is_empty() {
        return Err("내보낼 클립이 없습니다.".to_string());
    }
    let durations = probe_all(&app, &clips).await?;

    let mut resources = vec![format!(
        r#"        <format id="r1" name="FFVideoFormat1080p30" frameDuration="{}" width="1920" height="1080"/>"#,
        to_rational(FRAME_TICKS as f64 / TIMEBASE as f64)
    )];
    let mut spine: Vec<String> = Vec::with_capacity(clips.len());
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
        offset += *cut_dur; 
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

    // 비동기 tokio::fs::write 활용 및 명확한 에러 핸들링
    tokio::fs::write(&output_path, xml)
        .await
        .map_err(|e| format!("FCPXML 파일 저장 실패 ({}): {}", output_path, e))
}

#[tauri::command]
pub async fn export_capcut(
    app: AppHandle,
    clips: Vec<crate::ffmpeg::ClipConfig>,
    output_path: String,
) -> Result<(), String> {
    if clips.is_empty() {
        return Err("내보낼 클립이 없습니다.".to_string());
    }
    let durations = probe_all(&app, &clips).await?;
    
    // NaN이나 Infinity에 의한 panic 방지 (Error Handling)
    let to_us = |s: f64| {
        let safe_s = if s.is_finite() && s >= 0.0 { s } else { 0.0 };
        (safe_s * 1_000_000.0).round() as u64
    }; 

    let mut materials = Vec::with_capacity(clips.len());
    let mut segments = Vec::with_capacity(clips.len());
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
            "source_timerange": { "start": start_us, "duration": dur_us },
            "target_timerange": { "start": cursor_us, "duration": dur_us },
            "speed": 1.0,
            "volume": 1.0,
            "visible": true
        }));
        
        cursor_us += dur_us;
    }

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

    let s = serde_json::to_string_pretty(&draft)
        .map_err(|e| format!("CapCut JSON 직렬화 실패: {}", e))?;
        
    tokio::fs::write(&output_path, s)
        .await
        .map_err(|e| format!("CapCut 파일 저장 실패 ({}): {}", output_path, e))
}
