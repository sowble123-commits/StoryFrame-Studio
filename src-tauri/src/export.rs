use std::fs;
use serde_json::json;
use std::path::Path;

#[tauri::command]
pub fn export_fcpxml(clips: Vec<String>, output_path: String) -> Result<(), String> {
    let mut spine_content = String::new();

    for (i, clip) in clips.iter().enumerate() {
        spine_content.push_str(&format!(
            r#"                <asset-clip name="clip_{}" ref="r{}" offset="0s" duration="10s" format="r1" />
"#,
            i, i + 2
        ));
    }

    let mut resources = String::new();
    resources.push_str(r#"        <format id="r1" name="FFVideoFormat1080p30" frameDuration="100/3000s" width="1920" height="1080" />
"#);

    for (i, clip) in clips.iter().enumerate() {
        let clip_path = Path::new(clip).to_str().unwrap_or("");
        resources.push_str(&format!(
            r#"        <asset id="r{}" name="clip_{}" src="file://{}" />
"#,
            i + 2, i, clip_path
        ));
    }

    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
    <resources>
{}    </resources>
    <project name="StoryFrame Project">
        <sequence format="r1" duration="0s">
            <spine>
{}            </spine>
        </sequence>
    </project>
</fcpxml>"#,
        resources, spine_content
    );

    fs::write(&output_path, xml).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_capcut(clips: Vec<String>, output_path: String) -> Result<(), String> {
    // Basic CapCut draft_content.json structure
    let draft_content = json!({
        "materials": {
            "videos": clips.iter().map(|c| {
                json!({
                    "path": c,
                    "type": "video"
                })
            }).collect::<Vec<_>>()
        },
        "tracks": [
            {
                "type": "video",
                "segments": clips.iter().map(|c| {
                    json!({
                        "material_id": c
                    })
                }).collect::<Vec<_>>()
            }
        ]
    });

    let json_str = serde_json::to_string_pretty(&draft_content).map_err(|e| e.to_string())?;
    fs::write(&output_path, json_str).map_err(|e| e.to_string())?;
    Ok(())
}
