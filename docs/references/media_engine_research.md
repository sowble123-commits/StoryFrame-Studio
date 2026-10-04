# **Tauri 2.x 기반 FFmpeg 사이드카 통합 및 비동기 프로세스 제어 레퍼런스**

현대의 데스크톱 애플리케이션 개발 패러다임은 웹 기술의 유연성과 시스템 프로그래밍 언어의 고성능 연산 능력을 결합하는 방향으로 진화하고 있다. 이러한 흐름 속에서 Rust 기반의 Tauri 프레임워크는 Electron을 대체할 수 있는 강력한 대안으로 부상하였으며, 특히 Tauri 2.x 버전은 모바일 플랫폼 지원과 함께 완전히 재설계된 플러그인 아키텍처 및 권한(Capabilities) 시스템을 선보였다1. 미디어 변환, 비디오 스트리밍, 대규모 데이터 처리 등 시스템 자원을 집약적으로 사용하는 애플리케이션의 경우, JavaScript 런타임에 의존하는 대신 FFmpeg와 같은 검증된 C/C++ 기반 네이티브 바이너리를 활용하는 것이 필수적이다.  
본 보고서는 Tauri 2.x 환경에서 FFmpeg 바이너리를 '사이드카(Sidecar)'라는 아키텍처로 안전하게 번들링하는 방법부터, Rust의 표준 라이브러리인 std::process::Command를 활용한 비동기적 프로세스 제어, 그리고 표준 출력(Stdout) 스트림을 파싱하여 실시간 진행률(Progress)을 클라이언트로 전송하는 전 과정을 심도 있게 분석한다.

## **1\. Tauri 2.x 사이드카(Sidecar) 아키텍처 및 번들링 메커니즘**

외부 종속성이 강한 FFmpeg를 사용자의 로컬 시스템 환경(예: 환경 변수, 전역 설치 여부)에 의존하지 않고 애플리케이션 내부에 포함하여 배포하기 위해서는 Tauri의 사이드카 기능을 활용해야 한다. 사이드카 아키텍처는 최종 사용자가 Node.js, Python, FFmpeg 등을 별도로 설치하는 수고를 덜어주며, 애플리케이션이 항상 개발자가 의도한 정확한 버전의 바이너리를 사용하도록 보장한다1.

### **1.1. 타겟 트리플(Target Triple) 기반의 파일 맵핑 구조**

Tauri의 번들러는 배포 패키지를 생성할 때 tauri.conf.json 설정 파일 내의 externalBin 배열을 참조한다1. 이 과정에서 가장 핵심적인 원리는 **타겟 트리플(Target Triple) 접미사**의 강제화다. 컴파일 시점의 호스트 운영체제 및 CPU 아키텍처 환경에 맞춰 적절한 바이너리가 동적으로 선택될 수 있도록, 물리적 파일명에는 반드시 Rust 컴파일러의 타겟 트리플 명칭이 포함되어야 한다1.  
설정 파일인 tauri.conf.json에 경로를 명시할 때는 확장자나 타겟 접미사를 제외한 기본 식별자(Base Identifier)만을 기재한다. 하지만 실제 프로젝트의 디렉토리 구조 내부에는 타겟별로 분리된 여러 개의 물리적 바이너리가 존재해야 한다. 다음은 주요 운영체제 및 아키텍처에 따른 타겟 트리플 맵핑 규칙이다.

| 호스트 환경 (OS / 아키텍처) | externalBin 설정 값 | 요구되는 물리적 파일명 (src-tauri 내부) |
| :---- | :---- | :---- |
| **macOS (Apple Silicon)** | "bin/ffmpeg" | bin/ffmpeg-aarch64-apple-darwin |
| **macOS (Intel)** | "bin/ffmpeg" | bin/ffmpeg-x86\_64-apple-darwin |
| **Windows (64-bit)** | "bin/ffmpeg" | bin/ffmpeg-x86\_64-pc-windows-msvc.exe |
| **Linux (64-bit)** | "bin/ffmpeg" | bin/ffmpeg-x86\_64-unknown-linux-gnu |

위 표에 명시된 바와 같이, 개발자는 소스 트리의 src-tauri 디렉토리를 기준으로 bin/ffmpeg라는 공통 경로를 등록하지만, 런타임 및 빌드 시스템은 rustc \-Vv | grep host 명령어를 통해 산출된 타겟 정보를 바탕으로 정확한 파일을 추출한다3. 예를 들어, M1 Mac에서 빌드를 수행할 경우 번들러는 자동으로 bin/ffmpeg-aarch64-apple-darwin 파일을 찾아 패키징을 수행한다5.

### **1.2. 유닉스 환경에서의 실행 권한(Executable Permission) 부여**

사이드카 설정 시 개발자들이 가장 빈번하게 겪는 장애 요소는 유닉스 계열(macOS, Linux) 환경에서의 실행 권한 누락이다. Tauri 번들러가 파일을 복사하여 패키징하기 이전에, 파일 시스템 상의 물리적 바이너리는 반드시 실행 가능한 상태여야 한다. 따라서 소스 코드 저장소에 바이너리를 체크인하기 전에 터미널에서 chmod \+x bin/ffmpeg-\* 명령어를 실행하여 실행 권한을 부여해야 한다. 이를 누락할 경우 애플리케이션 런타임 시 자식 프로세스를 포크(Fork)하는 단계에서 "Permission Denied" 예외가 발생하며 프로세스 생성이 실패하게 된다5.

## **2\. Tauri 2.x의 권한(Capabilities) 모델과 보안 격리**

Tauri 2.x 버전은 과거 1.x 버전에서 사용되던 중앙 집중식 allowlist 방식을 전면 폐기하고, 개별 플러그인과 모듈 단위로 권한을 세밀하게 제어할 수 있는 'Capabilities' 시스템을 도입하였다1. 외부 바이너리를 실행하는 행위는 본질적으로 셸 스크립트 인젝션(Shell Injection) 및 임의 코드 실행(Arbitrary Code Execution)과 같은 심각한 보안 취약점의 통로가 될 수 있으므로, 최소 권한의 원칙(Principle of Least Privilege)을 엄격하게 적용해야 한다.

### **2.1. 셸(Shell) 플러그인과 사이드카 권한 할당**

사이드카 프로세스를 실행하기 위해서는 셸 플러그인(@tauri-apps/plugin-shell)에 대한 접근 권한 명세가 필요하다. Tauri 2.x에서는 src-tauri/capabilities/ 디렉토리 내에 JSON 형태의 권한 정의 파일을 구성하여, 허용할 바이너리와 허용 가능한 인자(Arguments)를 선언적으로 명시한다1.  
프론트엔드에서 JavaScript API인 Command.sidecar()를 통해 FFmpeg를 직접 호출하는 방식과, 백엔드인 Rust 런타임에서 std::process::Command를 통해 간접 호출하는 방식 모두 번들러가 사이드카 바이너리를 패키징 과정에 포함시키도록 하려면 해당 바이너리가 시스템 상에서 허용된 사이드카임을 명시해야 한다1.

### **2.2. 인자(Arguments) 검증 및 보안 설계**

권한 설정 시 프로세스에 전달될 인자를 정적으로 고정할지, 동적으로 허용할지에 따라 보안 등급이 결정된다. 동적인 인자 전달이 필요한 경우, 단순한 문자열 허용이 아닌 정규표현식(Regular Expression)을 이용한 검증기(Validator)를 적용하여 악의적인 시스템 명령어가 삽입되는 것을 차단해야 한다1.  
그러나 가장 강력한 보안 아키텍처는 **프로세스 호출 주체를 프론트엔드가 아닌 백엔드(Rust) 코어로 완전히 격리**시키는 것이다. 프론트엔드 환경에는 JavaScript 난독화를 우회하여 API를 조작할 위험이 상존하므로, 외부 바이너리에 대한 직접적인 접근 권한을 렌더러 프로세스에 부여하지 않고, Rust 환경 내부에서 모든 검증과 프로세스 실행을 통제하도록 설계하는 것이 엔터프라이즈급 애플리케이션의 모범 사례이다2.

## **3\. Rust 비동기 환경에서의 std::process::Command 제어 통찰**

Tauri의 백엔드 시스템은 기본적으로 비동기 런타임인 Tokio 엔진 위에서 동작한다2. 사용자의 요구사항에 명시된 Rust 표준 라이브러리의 std::process::Command 모듈은 본질적으로 동기적(Synchronous)이며 블로킹(Blocking) 방식으로 동작하는 API이다.

### **3.1. 블로킹 오버헤드와 스레드 분리(Thread Isolation)**

만약 Tauri의 비동기 메인 이벤트 루프나 \#\[tauri::command\]로 정의된 기본 컨텍스트 내부에서 std::process::Command::spawn()을 호출한 뒤, 생성된 프로세스의 파이프를 블로킹 방식으로 읽게 되면, Tauri 애플리케이션 전체의 이벤트 처리 루프가 정지하는 교착 상태(Deadlock) 또는 UI 정지(Freeze) 현상이 발생한다.  
이러한 아키텍처적 모순을 해결하면서 표준 라이브러리를 활용하기 위해서는, std::thread::spawn을 사용하여 운영체제 수준의 독립적인 스레드를 생성하고, 그 내부에서 서브프로세스를 스폰(Spawn)한 뒤 결과를 메인 런타임과 비동기적으로 통신하는 래퍼(Wrapper) 패턴을 구성해야 한다. Tokio의 spawn\_blocking을 활용할 수도 있으나, FFmpeg와 같이 수 분에서 수 시간까지 실행될 수 있는 장기 실행 프로세스(Long-running Process)의 경우 스레드 풀을 고갈시킬 위험이 있으므로 전용 OS 스레드를 할당하는 것이 더욱 안전하다.

### **3.2. 좀비 프로세스(Zombie Process) 억제 및 생명주기 관리**

외부 프로세스를 제어할 때 개발자가 가장 빈번하게 간과하는 영역은 자식 프로세스의 생명주기(Lifecycle) 관리이다. 메인 애플리케이션의 창이 닫히거나 사용자가 강제로 작업을 취소할 경우, 백그라운드에서 실행 중인 FFmpeg 프로세스는 자동으로 종료되지 않고 시스템 CPU와 메모리를 점유하는 '좀비 프로세스'로 전락하게 된다3.  
Rust의 std::process::Child 객체는 변수 스코프를 벗어나 드롭(Drop)되더라도 내부적으로 OS 레벨의 자식 프로세스에 SIGKILL 또는 SIGTERM을 보내지 않는다. 따라서 인코딩이 완료되거나 에러가 발생한 시점, 혹은 스레드가 종료되는 시점에 Child::wait()을 호출하여 프로세스 테이블에서 리소스를 회수하거나, 강제 종료가 필요한 경우 Child::kill() 메서드를 명시적으로 호출하는 안전장치(Safeguard) 로직이 반드시 포함되어야 한다6.

## **4\. FFmpeg 표준 출력(Stdout) 스트림 파싱 메커니즘**

FFmpeg 프로세스를 백그라운드에서 실행하고 그 진행 상황을 추적하기 위해서는 프로세스 간 통신(IPC)의 가장 기본 형태인 파이프(Pipe)를 설정해야 한다. std::process::Stdio::piped()를 사용하여 자식 프로세스의 stdout과 stderr의 파일 디스크립터(File Descriptor) 소유권을 부모 프로세스(Tauri 백엔드)로 가져온다.

### **4.1. 기계 판독형 진행률 데이터 추출 (-progress pipe:1)**

FFmpeg는 기본적으로 변환 진행 상황이나 디버그 로그를 표준 에러(stderr) 스트림으로 혼합하여 출력한다. 이는 인간이 읽기에는 적합하지만, 프로그램이 정규표현식으로 파싱하기에는 매우 불안정하다. 이를 해결하기 위해 FFmpeg 명령어 인자에 \-progress pipe:1을 추가하면, 기계가 쉽게 파싱할 수 있는 개행 분리형 키-값(Key-Value) 형태의 진행률 전용 스트림을 표준 출력(stdout)으로 분리하여 방출할 수 있다7.  
해당 옵션을 적용했을 때 FFmpeg가 방출하는 데이터 구조는 다음과 같다.

| 키(Key) | 예시 값 | 데이터 파싱 목적 및 활용도 |
| :---- | :---- | :---- |
| frame | 1250 | 현재까지 인코딩이 완료된 비디오 프레임 수치 |
| fps | 30.5 | 실시간 초당 인코딩 처리 속도 (UI 상의 성능 지표로 활용) |
| out\_time\_ms | 4166666 | 처리된 영상의 누적 재생 시간 (마이크로초 단위, 진행률 % 산출에 필수) |
| progress | continue / end | 현재 스트림의 지속 여부 및 프로세스 완료 상태 플래그 |

### **4.2. 스트림의 블로킹 리딩 및 유니코드 처리**

std::process::Child에서 추출한 stdout 핸들을 메모리 효율적으로 읽어내기 위해 std::io::BufReader로 래핑한다. 이후 lines() 이터레이터를 활용하면, FFmpeg가 데이터를 방출할 때마다 라인 단위로 블로킹하며 스트림을 소비할 수 있다. (이 작업은 전용 스레드에서 수행되므로 메인 UI 루프는 안전하게 보호된다).  
이 파싱 과정에서 고려해야 할 중요한 통찰은 버퍼 플러시(Buffer Flush)와 **유니코드 변환 처리**이다. FFmpeg의 출력 스트림은 가끔 유효하지 않은 UTF-8 바이트 시퀀스를 포함할 수 있으므로, 바이트 스트림을 파싱할 때 에러 발생 시 프로그램이 패닉(Panic)에 빠지지 않도록 filter\_map(|l| l.ok()) 패턴 등을 적용하여 오류를 부드럽게 무시(Graceful Degradation)하는 방어적 프로그래밍을 구축해야 한다1. 읽어들인 텍스트에서 등호(=) 기호를 기준으로 분리(Split)하여 out\_time\_ms 등의 값을 정수형으로 형변환한 뒤, 사전에 파악하고 있는 원본 영상의 총 길이(Total Duration)와 비교하여 실시간 백분율(Percentage)을 동적으로 산출한다.

## **5\. Tauri Emitter 기반 IPC(Inter-Process Communication) 구현**

산출된 진행률 데이터는 사용자에게 시각적 피드백을 제공하기 위해 Tauri의 내부 IPC 브리지를 거쳐 프론트엔드로 전달되어야 한다. Tauri 2.x에서는 Emitter 트레이트를 활용하여 Rust 코어에서 웹뷰(Webview) 컨텍스트로 이벤트를 방출(Emit)하는 일관된 API를 제공한다8.

### **5.1. Emitter 트레이트와 타겟팅 방식**

진행률 데이터는 프레임 수, FPS, 백분율 등의 다양한 메타데이터를 내포하므로, 단순한 스칼라 값이 아닌 복합 구조체(Struct) 형태로 정의되어야 한다. Rust의 serde::Serialize 트레이트를 구조체에 파생(Derive)시키면, Tauri 내부 메커니즘에 의해 해당 구조체가 JSON 형식으로 자동 직렬화(Serialization)되어 프론트엔드로 전송된다11.  
Tauri 2.x의 Emitter 트레이트는 다양한 범위의 이벤트 방출 방식을 지원한다.

| 메서드 | 타겟 범위 | 활용 시나리오 |
| :---- | :---- | :---- |
| app.emit("event", data) | 시스템 내의 모든 윈도우 및 웹뷰 | 전역적인 진행률 브로드캐스트가 필요할 때8 |
| app.emit\_to(target, "event", data) | 지정된 특정 윈도우 또는 타겟 | 다중 창(Multi-window) 환경에서 특정 작업 창에만 데이터를 전송할 때8 |
| app.emit\_filter("event", data, filter) | 필터 조건을 만족하는 타겟 그룹 | 특정 라벨 규칙을 가진 윈도우 그룹을 프로그래매틱하게 선택할 때8 |

별도로 생성된 작업 스레드 내부에서 이벤트를 방출하기 위해서는, Tauri 애플리케이션의 전역 컨텍스트를 담고 있는 AppHandle 객체의 복제본(Clone)을 생성하여 클로저 내부로 소유권을 이동(move)시켜야 한다9. 이는 Rust의 엄격한 메모리 안전성 규칙 하에서 스레드 간 컨텍스트를 공유하는 가장 표준적인 방법이다.

### **5.2. 이벤트 스로틀링(Throttling) 및 React 19 동시성 최적화**

이론적으로 FFmpeg가 초당 60프레임 속도로 인코딩을 진행할 경우, stdout 스트림 역시 초당 수십 번 이상의 변경 데이터를 뿜어낸다. 이를 추출되는 족족 즉각적으로 IPC 채널을 통해 emit하게 되면 프론트엔드의 JavaScript 브리지에 엄청난 트래픽 병목이 발생한다. 더불어 프론트엔드 프레임워크(React 등)는 쏟아지는 이벤트마다 상태(State)를 변경하고 DOM을 리렌더링하려 시도하므로 전체 UI가 멈추는 프레임 드롭(Frame Drop)이 유발된다13.  
따라서 백엔드 Rust 로직에서 이전 이벤트 방출 시점과의 시간(Timestamp) 차이를 계산하여, 최소 100ms 간격으로만 이벤트를 방출하도록 스로틀링(Throttling) 로직을 적용하는 것이 시스템 성능 튜닝의 핵심 모범 사례다15.  
여기에 더해, 프론트엔드 환경이 React 19을 사용 중이라면 useTransition 훅을 활용한 '동시성 렌더링(Concurrent Rendering)' 기술을 적용하여 IPC 수신 성능을 극대화할 수 있다. startTransition 내부에서 진행률 상태를 업데이트하면, React는 해당 업데이트를 긴급하지 않은 백그라운드 렌더링 작업으로 분류(Time-slicing)하여, 대량의 상태 변경 요청이 쏟아지더라도 메인 스레드를 블로킹하지 않고 UI 응답성을 완벽하게 유지한다14. 이처럼 백엔드의 스로틀링과 프론트엔드의 동시성 렌더링이 결합될 때 비로소 엔터프라이즈급의 부드러운 상태 표시가 가능해진다.

## **6\. Tauri 2.x 기반 FFmpeg 사이드카 및 IPC 종합 구현 레퍼런스**

지금까지 논의된 모든 아키텍처적 모범 사례(사이드카 설정, 스레드 격리, 좀비 프로세스 제어, 스트림 파싱, IPC 브로드캐스트)를 완벽하게 반영한 프러덕션 수준의 종합 레퍼런스 코드이다.

### **6.1. Tauri 환경 설정 및 사이드카 등록 (tauri.conf.json)**

사이드카 바이너리를 패키징하기 위해 bundle 설정 내에 externalBin을 명시한다. 해당 설정이 존재해야만 Tauri 번들러가 빌드 과정에서 타겟 트리플이 일치하는 FFmpeg 실행 파일을 탐색하여 패키지 내부에 이식한다.

JSON  
{  
  "productName": "VideoTranscoder",  
  "version": "1.0.0",  
  "identifier": "com.example.transcoder",  
  "build": {  
    "beforeDevCommand": "npm run dev",  
    "beforeBuildCommand": "npm run build",  
    "devUrl": "http\://localhost:1420",  
    "frontendDist": "../dist"  
  },  
  "app": {  
    "windows": \[  
      {  
        "title": "VideoTranscoder",  
        "width": 800,  
        "height": 600  
      }  
    \],  
    "security": {  
      "csp": null  
    }  
  },  
  "bundle": {  
    "active": true,  
    "targets": "all",  
    "icon": \[  
      "icons/32x32.png",  
      "icons/128x128.png",  
      "icons/128x128@2x.png",  
      "icons/icon.icns",  
      "icons/icon.ico"  
    \],  
    "externalBin": \[  
      "bin/ffmpeg"  
    \]  
  }  
}

### **6.2. 권한 및 보안 격리 모델 설정 (src-tauri/capabilities/default.json)**

Tauri 2.x의 Capabilities 시스템에 맞추어 shell:allow-execute 권한을 통해 ffmpeg 사이드카의 실행을 허가한다. 비록 프론트엔드에서 Command.sidecar() API를 직접 호출하지 않고 Rust 백엔드를 통해 실행하더라도, 번들러 및 보안 정책 상 런타임에 바이너리 접근을 보장받으려면 이와 같은 명시적 권한 선언이 필수적이다.

JSON  
{  
  "\$schema": "../gen/schemas/desktop-schema.json",  
  "identifier": "default",  
  "description": "Capability configuration for FFmpeg sidecar execution",  
  "windows": \[  
    "main"  
  \],  
  "permissions": \[  
    "core:default",  
    {  
      "identifier": "shell:allow-execute",  
      "allow": \[  
        {  
          "name": "bin/ffmpeg",  
          "cmd": "ffmpeg",  
          "args": true,  
          "sidecar": true  
        }  
      \]  
    }  
  \]  
}

### **6.3. Rust 백엔드 프로세스 제어 및 파싱 로직 (src-tauri/src/lib.rs)**

std::process::Command를 활용한 프로세스 호출 로직을 구현하되, 비동기 시스템의 메인 스레드 블로킹을 우회하기 위해 OS 스레드를 스폰하여 실행한다. FFmpeg 출력의 파싱과 IPC 이벤트 전송을 모두 담당하며, 리소스 낭비를 막기 위한 스로틀링(Throttling) 기법이 적용되어 있다.

Rust  
use serde::Serialize;  
use std::io::{BufRead, BufReader};  
use std::process::{Command, Stdio};  
use std::thread;  
use std::time::{Duration, Instant};  
use tauri::{AppHandle, Emitter, Manager};

// 프론트엔드로 전송할 진행률 페이로드 데이터 직렬화 구조체  
\#\[derive(Clone, Serialize)\]  
\#\[serde(rename\_all \= "camelCase")\]  
struct ProgressPayload {  
    pub frame: u64,  
    pub fps: f64,  
    pub time\_ms: u64,  
    pub percentage: f64,  
}

\#\[tauri::command\]  
async fn start\_ffmpeg\_process(  
    app: AppHandle,   
    input\_path: String,   
    output\_path: String,   
    total\_duration\_ms: f64  
) \-\> Result\<(), String\> {  
      
    // 1\. 사이드카의 실행 가능한 물리적 절대 경로를 해석  
    // Tauri 환경 내에서 번들링된 바이너리의 실제 위치를 동적으로 추적한다.  
    let sidecar\_path \= app.path()  
        .resolve("bin/ffmpeg", tauri::path::BaseDirectory::Resource)  
        .map\_err(|e| format\!("사이드카 경로 해석 실패: {}", e))?;

    // 2\. 메인 UI 스레드 및 Tokio 런타임 블로킹을 방지하기 위한 OS 스레드 할당  
    thread::spawn(move || {  
        // std::process::Command를 통한 동기적 프로세스 스폰  
        let mut child \= match Command::new(\&sidecar\_path)  
            .arg("-i")  
            .arg(\&input\_path)  
            // 진행률 파싱을 위해 기계 판독형 출력을 stdout으로 강제 전환  
            .arg("-progress")  
            .arg("pipe:1")  
            .arg("-c:v")  
            .arg("libx264") // 예시용 코덱  
            .arg("-preset")  
            .arg("fast")  
            .arg("-y") // 기존 파일 덮어쓰기 무조건 허용  
            .arg(\&output\_path)  
            // OS 파이프라인 형성 (자식 프로세스의 입출력을 부모로 리다이렉션)  
            .stdout(Stdio::piped())  
            .stderr(Stdio::piped()) // 로그와 진행률 스트림을 분리하기 위함  
            .spawn()   
        {  
            Ok(c) \=\> c,  
            Err(e) \=\> {  
                let \_ \= app.emit("ffmpeg-error", e.to\_string());  
                return;  
            }  
        };

        // 3\. 자식 프로세스의 표준 출력(Stdout) 소유권 이전 및 버퍼 래핑  
        if let Some(stdout) \= child.stdout.take() {  
            let reader \= BufReader::new(stdout);  
              
            let mut current\_frame \= 0;  
            let mut current\_fps \= 0.0;  
            let mut current\_time\_ms \= 0;  
              
            // IPC 전송 스로틀링을 위한 타임스탬프 기록  
            let mut last\_emit\_time \= Instant::now();  
            let throttle\_interval \= Duration::from\_millis(100); // 100ms 간격 제한

            // 4\. 버퍼 라인 단위 블로킹 리딩 및 UTF-8 손실 변환 허용  
            for line in reader.lines().filter\_map(|l| l.ok()) {  
                let parts: Vec\<&str\> \= line.split('=').collect();  
                if parts.len() \== 2 {  
                    let key \= parts\[0\].trim();  
                    let value \= parts\[1\].trim();

                    match key {  
                        "frame" \=\> {  
                            current\_frame \= value.parse().unwrap\_or(current\_frame);  
                        }  
                        "fps" \=\> {  
                            current\_fps \= value.parse().unwrap\_or(current\_fps);  
                        }  
                        "out\_time\_ms" \=\> {  
                            // FFmpeg는 시간 단위로 마이크로초(microseconds)를 반환하므로 밀리초로 변환  
                            let micro\_secs: u64 \= value.parse().unwrap\_or(0);  
                            current\_time\_ms \= micro\_secs / 1000;  
                              
                            // 백분율 진행률 연산  
                            let percentage \= if total\_duration\_ms \> 0.0 {  
                                ((current\_time\_ms as f64) / total\_duration\_ms) \* 100.0  
                            } else {  
                                0.0  
                            };

                            // 성능 최적화: 잦은 IPC 통신으로 인한 프레임 드롭 방지 (스로틀링 적용)  
                            if last\_emit\_time.elapsed() \>= throttle\_interval {  
                                let payload \= ProgressPayload {  
                                    frame: current\_frame,  
                                    fps: current\_fps,  
                                    time\_ms: current\_time\_ms,  
                                    percentage: percentage.min(100.0), // 100% 초과 방지  
                                };  
                                  
                                // 직렬화된 데이터를 "ffmpeg-progress" 식별자로 전체 브로드캐스트  
                                let \_ \= app.emit("ffmpeg-progress", payload);  
                                last\_emit\_time \= Instant::now();  
                            }  
                        }  
                        "progress" if value \== "end" \=\> {  
                            // 인코딩 정상 종료 신호 전송  
                            let \_ \= app.emit("ffmpeg-done", "인코딩이 성공적으로 완료되었습니다.".to\_string());  
                        }  
                        \_ \=\> {}  
                    }  
                }  
            }  
        }

        // 5\. 좀비 프로세스 생성 억제: 자식 프로세스의 완전한 리소스 회수 대기  
        let \_ \= child.wait();  
    });

    Ok(())  
}

\#\[cfg\_attr(mobile, tauri::mobile\_entry\_point)\]  
pub fn run() {  
    tauri::Builder::default()  
        .plugin(tauri\_plugin\_shell::init())  
        .invoke\_handler(tauri::generate\_handler\!\[start\_ffmpeg\_process\])  
        .run(tauri::generate\_context\!())  
        .expect("Tauri 애플리케이션 실행 중 치명적 오류 발생");  
}

### **6.4. 프론트엔드 React 클라이언트 통신 최적화 (App.tsx)**

클라이언트 환경에서는 Tauri의 JavaScript API를 통해 백엔드의 이벤트를 수신한다. IPC 통신으로부터 대량의 상태 변경 요청이 인입될 때 UI 프리징을 억제하기 위해 React 19의 useTransition을 접목한 모범 사례이다11.

TypeScript  
import React, { useState, useEffect, useTransition } from 'react';  
import { invoke } from '@tauri-apps/api/core';  
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// Rust 백엔드 구조체에 대응되는 TypeScript 인터페이스 정의  
interface ProgressPayload {  
  frame: number;  
  fps: number;  
  timeMs: number;  
  percentage: number;  
}

export default function Transcoder() {  
  const \[progress, setProgress\] \= useState\<number\>(0);  
  const \[fps, setFps\] \= useState\<number\>(0);  
  const \[isEncoding, setIsEncoding\] \= useState\<boolean\>(false);  
    
  // React 19 동시성 렌더링 훅 적용: 무거운 렌더링을 백그라운드로 밀어내어 UI 응답성 향상  
  const \[isPending, startTransition\] \= useTransition();

  useEffect(() \=\> {  
    let unlistenProgress: UnlistenFn;  
    let unlistenDone: UnlistenFn;

    const setupListeners \= async () \=\> {  
      // 1\. 진행률 이벤트 채널 구독  
      unlistenProgress \= await listen\<ProgressPayload\>('ffmpeg-progress', (event) \=\> {  
        // 상태 업데이트를 startTransition으로 감싸 프레임 드롭(Frame Drop) 방지  
        startTransition(() \=\> {  
          setProgress(event.payload.percentage);  
          setFps(event.payload.fps);  
        });  
      });

      // 2\. 프로세스 완료 이벤트 채널 구독  
      unlistenDone \= await listen\<string\>('ffmpeg-done', (event) \=\> {  
        startTransition(() \=\> {  
          setIsEncoding(false);  
          setProgress(100);  
        });  
        console.log("FFmpeg 백엔드 응답:", event.payload);  
      });  
    };

    setupListeners();

    // 메모리 누수(Memory Leak) 방지를 위한 클린업(Cleanup) 함수 실행  
    return () \=\> {  
      if (unlistenProgress) unlistenProgress();  
      if (unlistenDone) unlistenDone();  
    };  
  }, \[\]);

  const handleStartEncoding \= async () \=\> {  
    setIsEncoding(true);  
    setProgress(0);  
      
    try {  
      // 테스트 영상의 총 길이(예: 60초 \= 60,000 밀리초)를 알고 있다고 가정  
      const mockTotalDuration \= 60000; 

      // Rust 백엔드의 \#\[tauri::command\] 호출  
      await invoke('start\_ffmpeg\_process', {  
        inputPath: '/path/to/input.mp4',  
        outputPath: '/path/to/output.mp4',  
        totalDurationMs: mockTotalDuration  
      });  
    } catch (error) {  
      console.error("FFmpeg 프로세스 초기화 실패:", error);  
      setIsEncoding(false);  
    }  
  };

  return (  
    \<div className="p-8 max-w-2xl mx-auto font-sans"\>  
      \<h1 className="text-3xl font-extrabold mb-6 text-gray-800"\>Tauri 2.x FFmpeg 파이프라인\</h1\>  
        
      \<button   
        onClick={handleStartEncoding}  
        disabled={isEncoding}  
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md disabled:bg-gray-400 transition-colors"  
      \>  
        {isEncoding ? '백그라운드 인코딩 진행 중...' : '트랜스코딩 시작'}  
      \</button\>

      {isEncoding && (  
        \<div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100"\>  
          \<div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden"\>  
            \<div   
              className="bg-indigo-600 h-5 rounded-full transition-all duration-200 ease-out"   
              style={{ width: \`\${progress.toFixed(2)}%\` }}  
            /\>  
          \</div\>  
          \<div className="mt-4 text-sm font-medium text-gray-700 flex justify-between"\>  
            \<span\>처리 달성률: \<span className="text-indigo-600"\>{progress.toFixed(2)}%\</span\>\</span\>  
            \<span\>인코딩 속도: \<span className="text-indigo-600"\>{fps.toFixed(1)} FPS\</span\>\</span\>  
          \</div\>  
        \</div\>  
      )}  
    \</div\>  
  );  
}

## **결론**

Tauri 2.x 프레임워크와 FFmpeg 사이드카의 결합은 고도로 최적화된 미디어 데스크톱 애플리케이션을 구축하기 위한 가장 완벽한 현대적 접근 방식이다. 본 보고서의 설계 분석에 따르면, tauri.conf.json의 타겟 트리플 기반 번들링 구조를 올바르게 구성하고, 새롭게 정립된 Capabilities 시스템을 통하여 런타임 권한을 강력하게 통제하는 것이 배포 무결성과 보안 아키텍처의 핵심 요소로 작용한다.  
Rust의 표준 라이브러리인 std::process::Command를 활용할 때 수반되는 동기적 런타임 블로킹 이슈는, OS 스레드 분리 패턴을 통해 완벽하게 우회할 수 있다. 나아가 FFmpeg의 표준 출력 파이프를 통해 텍스트 스트림을 추출하고 이를 Tauri의 향상된 Emitter 패턴과 결합하면, C++ 네이티브 프로세스의 작업 현황을 프론트엔드로 끊김 없이 스트리밍할 수 있다. 이 과정에서 필연적으로 발생하는 막대한 IPC 오버헤드는 백엔드의 시간 기반 스로틀링(Throttling) 기법과 프론트엔드의 React 19 동시성(Concurrent) 렌더링 기술을 교차 적용함으로써 상쇄된다. 개발 및 아키텍처 설계 과정에서 자식 프로세스의 명확한 생명주기 관리(좀비 프로세스 방지)와 메모리 안전성에 지속적인 노력을 기울인다면, 가벼우면서도 막강한 성능을 발휘하는 크로스 플랫폼 애플리케이션을 성공적으로 구현해낼 수 있을 것이다.

#### **참고 자료**

> 1. Embedding External Binaries \- Tauri, [https\://v2.tauri.app/develop/sidecar/](https://v2.tauri.app/develop/sidecar/)  
> 2. Tauri v2 Tutorial 2026: Build a Rust Desktop App Step by Step | Rustify, [https\://rustify.rs/articles/rust-tauri-v2-desktop-app-tutorial-2026](https://rustify.rs/articles/rust-tauri-v2-desktop-app-tutorial-2026)  
> 3. Sidecar \- The Tauri Documentation WIP, [https\://jonaskruckenberg.github.io/tauri-docs-wip/examples/sidecar.html](https://jonaskruckenberg.github.io/tauri-docs-wip/examples/sidecar.html)  
> 4. 외부 바이너리 포함하기 \- Tauri v1, [https\://v1.tauri.app/ko/v1/guides/building/sidecar/](https://v1.tauri.app/ko/v1/guides/building/sidecar/)  
> 5. Tauri Sidecar \- FFMPEG : r/tauri \- Reddit, [https\://www\.reddit.com/r/tauri/comments/1ftu1y7/tauri\_sidecar\_ffmpeg/](https://www.reddit.com/r/tauri/comments/1ftu1y7/tauri_sidecar_ffmpeg/)  
> 6. Tauri sidecar's capabilities and support \- Reddit, [https\://www\.reddit.com/r/tauri/comments/1in82rl/tauri\_sidecars\_capabilities\_and\_support/](https://www.reddit.com/r/tauri/comments/1in82rl/tauri_sidecars_capabilities_and_support/)  
> 7. tauri-plugin-ffmpeg \- crates.io: Rust Package Registry, [https\://crates.io/crates/tauri-plugin-ffmpeg](https://crates.io/crates/tauri-plugin-ffmpeg)  
> 8. Emitter in tauri \- Rust \- Docs.rs, [https\://docs.rs/tauri/latest/tauri/trait.Emitter.html](https://docs.rs/tauri/latest/tauri/trait.Emitter.html)  
> 9. Calling Rust from the Frontend \- Tauri, [https\://v2.tauri.app/develop/calling-rust/](https://v2.tauri.app/develop/calling-rust/)  
> 10. AppHandle in tauri \- Rust \- Docs.rs, [https\://docs.rs/tauri/latest/tauri/struct.AppHandle.html](https://docs.rs/tauri/latest/tauri/struct.AppHandle.html)  
> 11. Calling the Frontend from Rust | Tauri, [https\://v2.tauri.app/develop/calling-frontend/](https://v2.tauri.app/develop/calling-frontend/)  
> 12. Emit change to frontend from rust?\! · tauri-apps · Discussion \#7558, [https\://github.com/orgs/tauri-apps/discussions/7558](https://github.com/orgs/tauri-apps/discussions/7558)  
> 13. framer-motion | Skills Marketplace \- LobeHub, [https\://lobehub.com/skills/mindrally-skills-framer-motion](https://lobehub.com/skills/mindrally-skills-framer-motion)  
> 14. React 18+ Performance: Suspense, Transitions, RSC Patterns, [https\://www\.pragma-code.de/en/blog-react-18-performance](https://www.pragma-code.de/en/blog-react-18-performance)  
> 15. Handling events in Tauri \- Tauri Tutorials, [https\://tauritutorials.com/blog/tauri-events-basics](https://tauritutorials.com/blog/tauri-events-basics)  
> 16. Concurrent React: useTransition and useDeferredValue \- Laxaar, [https\://laxaar.com/blog/concurrent-react-usetransition-usedeferredvalue-1749470004700](https://laxaar.com/blog/concurrent-react-usetransition-usedeferredvalue-1749470004700)