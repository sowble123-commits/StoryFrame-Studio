# StoryFrame-Studio Phase 4 리팩토링 및 고도화 요청 (Claude 4.6 Sonnet 전용)

안녕하세요 Claude! 현재 `StoryFrame-Studio` 데스크톱 앱(Tauri + React + Rust)의 **Phase 4 (FFmpeg 통합 및 내보내기 파이프라인)** 기초 기능 구현(Make it work)이 방금 완료되었습니다.
현재 기능이 동작은 하지만 프로덕션 레벨로 사용하기엔 부족한 하드코딩과 엣지 케이스 처리 미흡 등의 문제점들이 존재합니다.

아래 작성된 현재 코드 구조와 개선 목표를 바탕으로, **아키텍처 관점에서의 리팩토링 및 세부 로직 고도화 코드**를 작성해 주세요.

## 1. 현재 구현된 파일 구조 및 현황
- `src-tauri/src/ffmpeg.rs`: FFmpeg/ffprobe 커맨드를 `tauri::process::Command` 사이드카로 실행하는 기본 래퍼 구현 완료.
  - `generate_waveform`: 현재 `ffprobe` 실행만 하고, 파형(peak) 데이터는 더미(dummy) 배열을 반환하도록 하드코딩 되어 있습니다.
  - `assemble_roughcut`: `copy` 코덱으로 병합은 잘 작동하나, 진행률(Progress) 파싱 로직이 매우 단순합니다 (문자열 매칭 시 50%로 고정).
- `src-tauri/src/export.rs`: 외부 편집기 연동용 내보내기 로직.
  - `export_fcpxml`: XML 구조 뼈대는 완성했으나, `duration="10s"`, `offset="0s"` 등이 하드코딩 되어 있어 실제 클립 길이를 반영하지 못합니다. Rational Time 변환 로직이 빠져있습니다.
  - `export_capcut`: JSON 구조 뼈대는 완성했으나, UUID 발급 및 트랙 세그먼트의 정확한 인/아웃(In/Out) 매핑이 누락되어 있습니다.
- `src/components/ExportDialog.tsx`: 3가지 옵션을 선택하여 Tauri 커맨드를 호출하는 기본 UI. 동작은 잘 되나 디자인 디테일 및 에러 핸들링이 더 필요합니다.

## 2. 집중 개선 목표 (Refactoring Goals)

**Target 1. 진행률 파싱 정교화 (`assemble_roughcut`)**
- FFmpeg의 `stderr`를 읽어오는 `rx.recv().await` 루프에서 `time=00:00:05.12` 와 같은 텍스트를 정규식으로 파싱하세요.
- 전체 재생 시간(Total Duration)을 인자로 받아, 현재 처리된 시간과 비교하여 **0~100% 진행률을 정확하게 계산하고 실시간 Emit** 하도록 수정해 주세요.

**Target 2. FCPXML 1.11 규격 고도화 (`export_fcpxml`)**
- 각 클립의 실제 길이를 받아, 누적 `offset`을 계산하도록 로직을 변경해 주세요.
- 초 단위를 FCPXML이 요구하는 Rational Time 형식(예: `100/3000s`)으로 변환하는 헬퍼 함수를 추가해 주세요.
- XML 생성 시 문자열 접합(Concatenation) 방식보다는 안전하고 깔끔한 String format 구조로 개선해 주세요.

**Target 3. 오디오 파형 실제 추출 로직 (`generate_waveform`)**
- 더미 데이터 대신 실제 오디오 파일의 값을 추출하여 배열로 반환할 수 있도록 FFmpeg 오디오 필터(`astats`, `showvolume` 등)를 파싱하는 로직을 제안해 주세요.

**Target 4. ExportDialog.tsx 에러 바운더리 및 UI 폴리싱**
- 사용자 친화적인 Toast 알림(`shadcn/ui`) 연동, 내보내기 실패 시 명확한 에러 메시지(stderr 출력값) 렌더링.
- FFmpeg 렌더링 진행바(Progress Bar)에 부드러운 애니메이션 처리 추가.

## 3. 출력 형식
- 설명은 핵심만 짚고, 즉시 복사-붙여넣기 할 수 있는 완성된 전체 코드를 제공해 주세요.
- 수정해야 할 파일명과 경로를 코드 블록 상단에 명확히 표기해 주세요.
