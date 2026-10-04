# StoryFrame Studio Next (v2.0)

StoryFrame Studio는 Tauri와 React 기반으로 제작된 데스크톱 애플리케이션으로, 로컬 파일 시스템 제어와 FFmpeg 비디오 렌더링 파이프라인을 갖춘 AI 워크플로우 전용 편집 도구입니다.

## 🚀 기술 스택
- **Core**: Tauri 2.x (Rust)
- **Frontend**: React 19, TypeScript 5.x, Zustand
- **Styling**: Tailwind CSS 4, shadcn/ui, Framer Motion
- **Media Engine**: FFmpeg (Sidecar)

## 📁 주요 폴더 구조
```
StoryFrame-Studio/
├── src-tauri/          # Rust 백엔드 및 Tauri 커맨드, FFmpeg 워크플로우
│   ├── src/            # watcher.rs, ffmpeg.rs, export.rs 등
│   └── tauri.conf.json # Tauri 빌드 및 패키징 설정
├── src/                # React 프론트엔드 코드
│   ├── components/     # UI 컴포넌트 (공통, 도메인 분리)
│   ├── hooks/          # 커스텀 훅 (useExternalSync 등)
│   ├── lib/            # 유틸리티 및 Framer Motion 모션 프리셋
│   ├── store/          # Zustand 스토어 분리 (UI State, Project State)
│   ├── types/          # TypeScript 타입 정의
│   └── views/          # AppShell 및 각 뷰 레이아웃
├── docs/               # 기획서, 워크플로우, 연구 문서 (PLAN.md, PRD.md)
└── package.json
```

## 🛠️ 설치 및 실행 방법
**의존성 설치:**
```bash
pnpm install
```

**개발 모드 실행:**
```bash
pnpm tauri dev
```

**프로덕션 빌드 (Windows MSI, macOS DMG):**
```bash
pnpm tauri build
```

## ⌨️ 단축키 목록
- `Space`: 재생 / 일시정지
- `I` / `O`: In 포인트 / Out 포인트 지정
- `J` / `K` / `L`: 역재생 / 정지 / 재생 (셔틀 제어)
- `1`~`9`: 타임라인 배율(Zoom) 조절
- `[` / `]`: 이전 / 다음 클립으로 이동
- `Ctrl + S`: 강제 저장 (기본적으로 500ms 단위로 자동 저장됨)
- `Ctrl + E`: 내보내기 다이얼로그 (FFmpeg, FCPXML 지원)

## 📌 주요 기능
- 백그라운드 AI 에이전트와 양방향 `project_state.json` 실시간 동기화
- HTML5 Canvas 기반 오디오 파형 렌더링 및 비트 스냅
- 모션 프리셋, 접근성(ARIA) 및 성능 최적화 적용
- FFmpeg 무손실 concat 조립 및 Final Cut Pro XML 추출 지원

---
© 2026 StoryFrame Studio Next. All Rights Reserved.
