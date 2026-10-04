# FFmpeg Binaries Directory

Place the OS-specific FFmpeg and FFprobe binaries in this directory.

Required files per OS (for Tauri sidecar):
- **Windows**: `ffmpeg-x86_64-pc-windows-msvc.exe`, `ffprobe-x86_64-pc-windows-msvc.exe`
- **macOS**: `ffmpeg-x86_64-apple-darwin`, `ffmpeg-aarch64-apple-darwin`, etc.
- **Linux**: `ffmpeg-x86_64-unknown-linux-gnu`, etc.

Make sure the binaries correspond to the target triple of the build.
