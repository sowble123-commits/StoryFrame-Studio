# **Tauri 2.x 및 Rust 기반 고성능 데스크톱 애플리케이션의 아키텍처 및 시스템 제어 레퍼런스**

현대의 크로스 플랫폼 데스크톱 애플리케이션 개발 패러다임은 극도의 성능 최적화와 더불어 시스템 자원에 대한 엄격한 보안 격리(Sandboxing)를 요구한다. 이러한 산업적 요구 사항에 발맞추어 등장한 Tauri 프레임워크는 무거운 크로미움(Chromium) 인스턴스를 내장하는 대신, 운영체제가 제공하는 네이티브 웹뷰(WebView) 엔진과 Rust 기반의 백엔드를 결합하여 바이너리 크기를 최소화하고 실행 속도를 극대화하였다1. 특히, Tauri 2.x 버전의 등장은 모바일 환경(iOS, Android)으로의 지원 확장뿐만 아니라, 애플리케이션의 윈도우 및 웹뷰 단위로 권한을 통제하는 역량(Capabilities) 기반의 보안 모델을 도입함으로써 시스템 아키텍처 설계에 중대한 전환점을 제시하였다2.  
본 레퍼런스 문서는 전문 소프트웨어 엔지니어 및 아키텍트를 대상으로, Tauri 2.x 최신 버전 환경에서의 프로젝트 초기화와 환경 구성, 완전히 재설계된 보안 모델의 명세, Rust 환경을 활용한 안전한 파일 시스템 제어, 그리고 notify 크레이트 생태계를 응용한 로컬 디렉토리 실시간 감지와 프론트엔드로의 이벤트 브로드캐스팅(Emit) 구현에 대한 모범 사례를 심층적으로 분석한다.

## **Tauri 2.x 프로젝트 구성 및 tauri.conf.json 심층 설계**

Tauri 프로젝트 아키텍처의 중심에는 애플리케이션의 식별 메타데이터, 컴파일 파이프라인, 플랫폼별 패키징 설정, 런타임 제어 객체, 그리고 보안 정책을 총괄하는 tauri.conf.json 파일이 존재한다. 2.x 버전에서는 이 구성 파일의 스키마가 더욱 세분화되었으며, 개발자의 가독성 및 유지보수성을 향상시키기 위해 기본 JSON 포맷 이외에도 주석 작성이 가능한 TOML 및 JSON5 포맷을 공식적으로 지원하도록 진화하였다4.

### **구성 파일 포맷의 진화와 다중 플랫폼 병합 전략**

기본적으로 Tauri CLI를 통해 프로젝트를 초기화하면 src-tauri 디렉토리 내에 tauri.conf.json 파일이 생성된다6. 만약 프로젝트의 설정이 복잡해져 주석을 통한 문서화가 필요하거나, 구조적 명확성을 위해 TOML을 선호하는 경우, 개발자는 Cargo.toml 파일의 tauri 및 tauri-build 의존성 선언부에 config-json5 또는 config-toml 피처(Feature) 플래그를 활성화하여 설정 파일 포맷을 변경할 수 있다4. 이 경우 파일명은 tauri.conf.json5 또는 Tauri.toml로 지정해야 Tauri 런타임이 이를 올바르게 인식한다5.  
더 나아가, Tauri 2.x는 크로스 플랫폼 애플리케이션 개발 시 각 운영체제(Windows, macOS, Linux, Android, iOS)마다 요구되는 고유한 설정(예: 아이콘 해상도, 설치 파일 형식, 시스템 권한 등)을 효과적으로 관리하기 위해 다중 플랫폼 병합 전략을 채택하였다4. 이는 메인 구성 파일과 플랫폼별 설정 파일(예: tauri.linux.conf.json, tauri.windows.conf.json 등)을 분리하여 작성한 뒤, 빌드 시점에 이를 동적으로 병합하는 방식이다4.  
이러한 병합 프로세스는 국제 표준인 JSON Merge Patch (RFC 7396\) 사양을 엄격하게 준수하여 수행된다. 해당 사양의 핵심 메커니즘은 객체(Object) 형태의 데이터는 키(Key) 단위로 깊은 병합(Deep Merge)을 수행하지만, 배열(Array) 형태의 데이터는 병합되지 않고 전체가 플랫폼별 설정으로 완전히 교체(Replace)된다는 점이다4. 예를 들어, 앱 내의 윈도우 설정을 담당하는 app.windows 배열이나 특정 리소스를 정의하는 배열에 플랫폼 전용 설정을 추가하고자 할 때, 베이스 설정 파일에 존재하는 배열 요소들을 플랫폼 파일에서 생략할 경우 기존 설정이 유지되는 것이 아니라 플랫폼 파일의 내용으로 완전히 덮어씌워지게 된다. 따라서 개발자는 배열 요소를 다룰 때 유지해야 할 기존 베이스 요소들을 플랫폼별 파일에도 모두 명시적으로 선언해야 하는 아키텍처적 주의를 기울여야 한다4.

### **tauri.conf.json 핵심 객체 구조 분석**

Tauri 2.x의 설정 스키마는 애플리케이션의 수명 주기와 빌드 시스템을 명확히 분리하기 위해 여러 최상위 객체로 구성된다. 다음 표는 주요 최상위 객체들의 역할과 이들이 애플리케이션 아키텍처에 미치는 영향을 상세히 분석한 것이다6.

| 최상위 키 (Key) | 구조적 역할 및 아키텍처적 의미 | 참조 및 연계 시스템 |
| :---- | :---- | :---- |
| identifier | **(필수)** 애플리케이션을 운영체제 레벨에서 식별하는 고유한 역도메인(Reverse Domain) 문자열(예: com.enterprise.app)이다. 영숫자와 하이픈, 마침표만 허용된다. | macOS의 Bundle ID, Windows 레지스트리 앱 경로, 웹뷰 데이터 및 캐시 저장소 경로 지정에 절대적인 기준이 됨6. |
| productName | 패키징된 바이너리 실행 파일의 이름이자, OS 메뉴, 시스템 트레이 등에 표시되는 공식 애플리케이션 명칭이다. | 컴파일 결과물 이름과 사용자가 인지하는 프로세스 명명에 관여함6. |
| version | SemVer(유의적 버전) 기반의 앱 버전 표기이다. 이를 생략할 경우 Cargo.toml의 버전을 상속받지만, 구성 파일에서 명시적으로 관리하는 것이 권장된다. | bundleVersion이나 versionCode 등 각 모바일 및 데스크톱 운영체제의 고유 버전 체계로 자동 맵핑됨7. |
| build | 프론트엔드 빌드 결과물의 위치(frontendDist), 로컬 개발 서버 URL(devUrl), 빌드 파이프라인 전후에 실행할 스크립트 훅(beforeDevCommand, beforeBuildCommand)을 관장한다. | Tauri CLI와 외부 프론트엔드 번들러(Vite, Webpack 등) 간의 통신과 실행 순서를 동기화함4. |
| app | 보안 정책(CSP, Capabilities), 시작 윈도우 인스턴스 배열(windows), 시스템 트레이 동작 설정 등 애플리케이션 런타임에 직접적으로 영향을 미치는 구성을 포함한다. | IPC 통신 제어 및 창(Window) 생성 시 초기 상태(크기, 테두리 유무, 투명도 등) 결정6. |
| bundle | 최종 사용자에게 배포될 설치 파일(Windows NSIS/WiX, macOS DMG, Linux AppImage 등)에 대한 생성 규격, 아이콘 에셋 경로, 앱 카테고리 등을 정의한다. | CI/CD 파이프라인에서의 배포물 패키징 전략과 직접적으로 연관됨6. |
| plugins | 스토어 플러그인, 데이터베이스 연결, 커스텀 프로토콜 등 시스템과 상호작용하는 서드파티 모듈들의 초기 런타임 구성을 정의한다. | 플러그인별로 고유한 설정 스키마를 주입하여 동적 확장을 지원함6. |

프론트엔드와 백엔드의 빌드 파이프라인을 매끄럽게 연결하기 위해 build.beforeDevCommand에 npm run dev와 같은 명령어를 명시하면, tauri dev 명령 실행 시 Tauri CLI가 백엔드 컴파일을 수행하기 전에 지정된 프론트엔드 개발 서버를 자동으로 기동한다4. 이러한 유기적인 통합은 개발 생산성을 비약적으로 향상시킨다.

JSON  
{  
  "productName": "EnterpriseSync",  
  "version": "2.0.0",  
  "identifier": "com.enterprise.sync",  
  "build": {  
    "beforeDevCommand": "npm run dev",  
    "beforeBuildCommand": "npm run build",  
    "devUrl": "http\://localhost:5173",  
    "frontendDist": "../dist"  
  },  
  "app": {  
    "windows": \[  
      {  
        "title": "Enterprise Sync Dashboard",  
        "width": 1280,  
        "height": 800,  
        "resizable": true,  
        "fullscreen": false,  
        "decorations": true  
      }  
    \],  
    "security": {  
      "csp": "default-src 'self'; script-src 'self'; connect-src 'self' ipc: tauri:",  
      "capabilities": \["main-capability"\]  
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
    \]  
  }  
}

## **완전히 재설계된 보안 패러다임: Capabilities와 Permissions**

과거 Tauri 1.x 버전의 보안 모델은 단일 구성 파일 내에 존재하는 allowlist 항목을 통해 모든 시스템 API의 접근 권한을 전역적(Global)으로 관리하는 방식이었다3. 이 방식은 애플리케이션의 규모가 커지고 창(Window)이나 웹뷰(WebView) 단위로 서로 다른 권한이 요구되는 복잡한 아키텍처에서는 심각한 한계를 노출했다. 모든 웹뷰가 동일한 전역 권한을 공유하게 되어, 특정 화면에서 발생한 프론트엔드 취약점이 시스템 전체를 위협할 수 있는 잠재적 보안 결함을 안고 있었기 때문이다.  
이러한 문제를 원천적으로 해결하기 위해 Tauri 2.0은 Capabilities와 Permissions라는 두 계층으로 완전히 분리된 혁신적인 보안 모델을 도입하였다2. 새로운 모델은 '최소 권한의 원칙(Principle of Least Privilege)'을 데스크톱 프레임워크 수준에서 강제하며, 개발자로 하여금 어떤 창이 어떤 명령어(IPC)와 시스템 자원(파일 경로, 네트워크 등)에 접근할 수 있는지 세밀하게 조율할 수 있도록 설계되었다.

### **Capabilities 디렉토리 구조와 default.json 명세 분석**

Capabilities는 특정 윈도우나 웹뷰에 부여할 명시적 권한(Permissions)들의 그룹을 정의하는 논리적 구성 단위이다2. Tauri 2.x에서는 모든 플러그인 명령어와 IPC 통신이 기본적으로 완전히 차단(Deny-by-default)되어 있으므로, 프론트엔드 환경에서 백엔드 로직이나 시스템 API를 호출하려면 반드시 해당 명령어에 대한 권한이 Capability에 명시되어야만 한다9. 이를 누락할 경우 런타임에서 "권한 거부(Permission denied)" 또는 "명령을 찾을 수 없음" 오류와 함께 IPC 접근이 침묵 속에 차단된다3.  
이러한 Capabilities는 tauri.conf.json 내부에 인라인으로 선언할 수도 있지만, 유지보수성과 보안 정책의 격리를 위해 src-tauri/capabilities/ 디렉토리에 개별 JSON 또는 TOML 파일로 분리하여 정의하는 것이 강력히 권장되는 모범 사례이다2. 생성된 파일들은 tauri.conf.json의 app.security.capabilities 배열에서 식별자(Identifier)를 통해 참조된다2.  
src-tauri/capabilities/default.json 파일의 내부 구조는 다음과 같은 핵심 메타데이터 필드들로 구성된다2:

* **\$schema**: IDE(통합 개발 환경)에서 자동 완성 기능과 문법 유효성 검사를 제공하기 위해 Tauri가 빌드 시점에 자동 생성하는 JSON 스키마 파일의 상대 경로이다. 이를 통해 오탈자나 잘못된 권한 부여를 컴파일 전에 방지할 수 있다2.  
* **identifier**: 이 Capability 세트를 고유하게 지칭하는 문자열(예: main-capability)이다. 다중 창 환경에서 보안 프로필을 구분하는 핵심 키로 작용한다2.  
* **description**: 해당 권한 그룹의 목적과 적용 범위를 문서화하는 사람이 읽을 수 있는 설명 필드이다2.  
* **windows**: 정의된 권한들이 적용될 윈도우의 '레이블(Label)' 목록을 배열로 지정한다. 이 값이 \["main"\]으로 설정되면, 오직 main 레이블을 가진 윈도우만이 해당 권한을 행사할 수 있으며 다른 창들은 접근이 원천 차단된다2.  
* **permissions**: 윈도우가 접근할 수 있는 개별 권한들의 식별자를 문자열 또는 객체 형태로 나열한다2.

### **파일 시스템 스코핑(Scoping)과 권한 세분화 전략**

권한 부여에 있어 가장 중요한 부분은 코어 기능과 플러그인 기능에 대한 명시적 허용이다. 프론트엔드에서 이벤트를 수신하거나 창을 여닫는 등 기본적인 통신을 수행하려면 반드시 core:default 권한 또는 core:event:default, core:window:default 등의 세부 권한이 포함되어야 한다2.  
더욱 고도화된 보안은 파일 시스템과 같은 민감한 자원에 접근할 때 나타난다. tauri-plugin-fs와 같은 파일 시스템 플러그인을 활성화할 때, 단순히 읽고 쓰기 권한을 주는 것을 넘어 스코프(Scope) 기능을 통해 접근 가능한 디렉토리를 제한해야 한다13. 이 방식은 해커가 프론트엔드의 취약점을 악용해 악의적인 자바스크립트를 주입하더라도, 시스템의 중요 파일(운영체제 커널 영역 등)에 접근할 수 없도록 완벽한 샌드박싱 환경을 구축한다2.  
다음은 메인 윈도우에 코어 이벤트 접근을 허용하고, 애플리케이션의 데이터 디렉토리와 문서 디렉토리에만 엄격히 제한된 파일 읽기 및 쓰기 권한을 부여하는 Capability 파일의 예시이다.

JSON  
{  
  "\$schema": "../gen/schemas/desktop-schema.json",  
  "identifier": "main-capability",  
  "description": "메인 윈도우에 대한 시스템 접근 권한 및 제한적 파일 제어 코어 API",  
  "windows": \[  
    "main"  
  \],  
  "permissions": \[  
    "core:default",  
    "core:event:default",  
    "core:window:default",  
    "fs:default",  
    "dialog:default",  
    {  
      "identifier": "fs:allow-read",  
      "allow": \[  
        { "path": "\$APPDATA/EnterpriseSync/\*\*" },  
        { "path": "\$DOCUMENT/\*\*" }  
      \]  
    },  
    {  
      "identifier": "fs:allow-write",  
      "allow": \[  
        { "path": "\$APPDATA/EnterpriseSync/\*\*" }  
      \]  
    }  
  \]  
}

위 구조에서 \$APPDATA와 \$DOCUMENT는 Tauri 런타임이 동적으로 해석하는 환경 변수 기반의 경로 해결사(Path Resolver) 역할을 수행하며, 운영체제에 상관없이 적절한 사용자 공간으로 경로를 치환한다13. 이러한 객체 지향적 권한 맵핑은 보안 감사를 매우 수월하게 만들어 준다.

### **개발 환경(HMR)을 위한 원격(Remote) URL 접근 권한 구성**

Tauri 2.x에서의 또 다른 강력한 기능은 특정 원격 도메인 또는 개발 서버 URL이 IPC 브릿지에 접근할 수 있도록 허용하는 remote 설정이다3. 개발 시 Vite, Webpack, 혹은 SvelteKit 등 외부 개발 서버를 이용한 핫 모듈 리플레이스먼트(HMR) 환경을 구축할 때, 프론트엔드는 http\://localhost:\*에서 구동된다3. 기본적으로 Tauri 2.x는 번들링된 tauri:// 또는 ipc:// 프로토콜 외부에서의 IPC 접근을 차단하기 때문에, 개발 환경을 원활하게 셋업하기 위해 원격 접근 권한을 명시적으로 개방해야 한다2.  
이를 위해 src-tauri/capabilities/ 폴더 내에 개발 용도의 remote-dev.json을 추가하여 구성할 수 있다.

JSON  
{  
  "\$schema": "../gen/schemas/remote-schema.json",  
  "identifier": "remote-dev-access",  
  "description": "로컬 개발 서버를 위한 IPC 브릿지 허용",  
  "windows": \["main"\],  
  "remote": {  
    "urls": \["http\://localhost:\*/\*\*"\]  
  },  
  "permissions": \[  
    "core:default",  
    "fs:default"  
  \]  
}

상용 배포 시에는 빌드 파이프라인의 플랫폼 조건 또는 CI(지속적 통합) 스크립트를 통해 해당 개발용 Capability를 제외함으로써, 외부 웹페이지(원격 도메인)로 내비게이션 시 발생할 수 있는 보안 취약점을 완전히 제거하는 것이 원칙이다2.

## **Rust 환경에서의 로컬 파일 시스템 제어와 데이터 무결성 확보**

Tauri 아키텍처에서 파일 시스템을 제어하는 방식은 크게 두 가지로 나뉜다. 첫째는 프론트엔드의 JavaScript/TypeScript 런타임에서 tauri-plugin-fs를 통해 IPC를 거쳐 파일을 제어하는 방식이며, 둘째는 백엔드인 Rust 환경 내에서 직접 네이티브 파일 I/O를 수행하고 그 결과를 프론트엔드에 전달하는 방식이다14.  
프론트엔드 기반의 파일 제어는 구현이 간편하지만, 대용량 파일 처리나 다수의 파일 동기화 작업에서는 프론트엔드 쓰레드와 IPC 채널에 병목 현상을 유발할 수 있다14. 따라서 복잡한 비즈니스 로직, 고성능 처리가 요구되는 무거운 I/O 작업, 혹은 시스템 백그라운드에서 주기적으로 수행되는 파일 조작은 Rust 백엔드 내에서 캡슐화(Encapsulation)하여 처리하는 것이 성능, 보안, 유연성 측면에서 압도적으로 우수한 최신 모범 사례이다14.

### **블로킹(std::fs)과 논블로킹(tokio::fs) 모델의 아키텍처적 선택**

Rust 생태계에서 로컬 파일을 제어하기 위한 API는 표준 라이브러리인 std::fs와 비동기 런타임 생태계의 중심인 tokio::fs로 구분된다. Tauri 프레임워크는 내부적으로 Tokio 비동기 런타임을 구동하고 있으므로, 개발자는 I/O 워크로드의 특성에 맞추어 적절한 API를 선택해야 한다14.

* **std::fs의 채택 기준:** 구성 설정 파일(JSON, TOML 등)을 애플리케이션 시작 단계(Setup 훅)에서 한 번 로드할 때나 파일 크기가 매우 작은 경우에 적합하다. 그러나 Tauri 커맨드 환경에서 동기 I/O를 무분별하게 수행할 경우 해당 커맨드를 처리하는 워커 스레드가 블로킹되어 IPC 큐가 지연되고 궁극적으로 UI 응답성이 저하될 수 있다.  
* **tokio::fs의 채택 기준:** 스트리밍 데이터의 기록, 대용량 로그 파일 생성, 네트워크 송수신과 결합된 비동기 파일 다운로드 등 처리 시간에 불확실성이 내포된 모든 I/O 작업에 필수적이다14. 비동기 커맨드(\#\[tauri::command\] async fn)와 결합하면, 파일 시스템 응답을 대기하는 동안 스레드가 다른 비동기 태스크를 처리할 수 있게 되어 리소스 활용도를 극대화한다15.

### **시스템 크래시를 대비한 원자적 쓰기(Atomic Write) 패턴 구현**

파일에 데이터를 기록하는 일련의 과정(파일 열기, 버퍼 덮어쓰기, 파일 닫기) 중에 운영체제 패닉, 애플리케이션 강제 종료, 혹은 전원 차단과 같은 치명적인 장애가 발생하면 원본 파일이 비어있는 상태(0 bytes)로 남아버리거나 데이터가 완전히 손상되는 치명적인 문제가 발생할 수 있다. 특히 데이터 동기화 앱이나 환경 설정 파일을 기록할 때 이러한 데이터 유실은 복구 불가능한 장애로 이어진다.  
Rust 백엔드 아키텍처에서는 이러한 위험을 근본적으로 차단하기 위해 원자적 쓰기(Atomic Write) 패턴을 구현하는 것이 최신 스탠다드로 자리 잡았다16. 원자적 쓰기는 파일 덮어쓰기 과정의 중간 상태(Intermediate State)를 노출하지 않음을 보장하는 기술이다16. 그 메커니즘은 다음과 같다:

> 1. 목적 파일과 동일한 디렉토리에 숨김 처리된 임시 파일(또는 .tmp 확장자)을 생성한다17.  
> 2. 해당 임시 파일에 모든 데이터를 기록하고, 운영체제의 파일 시스템 캐시를 물리 디스크로 강제 플러시(Flush)한다.  
> 3. 데이터가 완벽하게 기록됨을 확인한 후, 운영체제 커널이 제공하는 rename 시스템 호출을 사용하여 임시 파일을 원본 파일명으로 변경한다. (POSIX 호환 시스템 및 Windows의 특정 파일 시스템 환경에서 rename 연산은 원자적으로 수행되어 기존 파일을 안전하게 덮어씌운다.)

atomic-write-file과 같은 외부 크레이트를 사용할 수도 있으나16, 외부 의존성을 최소화하고 비동기 환경을 완벽하게 제어하기 위해 Tokio 기반의 헬퍼 함수를 직접 구현하는 것이 선호된다.

Rust  
use tokio::fs::{File, rename};  
use tokio::io::AsyncWriteExt;  
use std::path::Path;  
use std::io;

/// 원자적 파일 쓰기를 수행하는 Tokio 기반 비동기 함수  
pub async fn atomic\_write\_async(target\_path: impl AsRef\<Path\>, data: &\[u8\]) \-\> io::Result\<()\> {  
    let target \= target\_path.as\_ref();  
      
    // 타겟 파일과 동일한 디렉토리에 .tmp 확장자를 가진 임시 파일 경로를 생성  
    let tmp\_path \= target.with\_extension("tmp");

    // 1단계: 임시 파일 생성 및 데이터 쓰기  
    let mut tmp\_file \= File::create(\&tmp\_path).await?;  
    tmp\_file.write\_all(data).await?;  
      
    // OS 수준의 캐시를 디스크 물리 블록으로 강제로 동기화하여 전원 차단 시 데이터 유실 방지  
    tmp\_file.sync\_all().await?; 

    // 2단계: 임시 파일을 원본 파일 경로로 원자적(Atomically) 교체  
    // 만약 이 단계 이전에 프로그램이 크래시되더라도 원본 파일(target)은 전혀 손상되지 않음  
    match rename(\&tmp\_path, target).await {  
        Ok(\_) \=\> Ok(()),  
        Err(e) \=\> {  
            // 원자적 교체에 실패한 경우 쓰레기 파일(임시 파일) 삭제 시도  
            let \_ \= tokio::fs::remove\_file(\&tmp\_path).await;  
            Err(e)  
        }  
    }  
}

이와 같이 파일 시스템 제어 로직을 Rust 백엔드의 서비스 레이어(Service Layer) 내에 캡슐화하면, 프론트엔드 환경은 복잡한 트랜잭션 관리와 에러 복구를 고려할 필요 없이 단지 고수준의 명령어만 호출하게 되어 모듈의 응집도가 대폭 높아진다.

## **notify 크레이트 기반의 크로스 플랫폼 디렉토리 감지 메커니즘**

파일 동기화 매니저, 클라우드 스토리지 연동 클라이언트, 또는 로컬 문서 기반의 라이브 에디터를 개발할 때 핵심은 로컬 디렉토리 내의 파일 변경(생성, 수정, 삭제) 사항을 지연 없이 감지하여 애플리케이션의 상태를 업데이트하는 것이다. Rust 생태계에서는 이 역할을 크로스 플랫폼 파일 시스템 알림 라이브러리인 notify 크레이트가 담당한다18.

### **OS 종속적 파일 시스템 이벤트 백엔드의 한계와 추상화**

파일 시스템 모니터링은 운영체제 커널과 깊게 맞닿아 있는 영역으로, 각 OS마다 제공하는 API의 구조와 동작 방식이 완전히 다르다18. notify 크레이트는 이러한 플랫폼 종속성을 하나의 인터페이스로 매끄럽게 추상화한다. 운영체제별로 내부적으로 선택되는 최적의 백엔드는 다음과 같다18:

* **Linux / Android**: inotify를 기반으로 아이노드(inode) 변화를 추적한다.  
* **macOS / iOS**: FSEvents를 사용하여 시스템 차원의 파일 변경 스트림을 수신한다. (또는 조건에 따라 kqueue 사용)  
* **Windows**: ReadDirectoryChangesW 시스템 API를 호출하여 디렉토리 트리의 변경 내역을 관찰한다.  
* **Fallback**: 운영체제 레벨의 이벤트 알림 기능이 작동하지 않는 레거시 환경을 위해 주기적으로 디렉토리 해시를 비교하는 폴링(Polling) 백엔드를 제공한다.

개발자는 플랫폼의 복잡성을 직접 다룰 필요 없이 notify::recommended\_watcher 인터페이스를 호출하여 현재 구동 중인 OS에서 성능이 가장 뛰어난 왓쳐(Watcher) 구현체를 자동으로 할당받을 수 있다18.

### **원시 이벤트의 노이즈 문제와 notify-debouncer-full을 통한 디바운싱 전략**

기본 notify 크레이트는 OS에서 발생하는 원시(Raw) 이벤트를 가감 없이 그대로 전달한다. 문제는 사용자가 문서를 한 번 저장하거나 텍스트 편집기에서 파일을 수정할 때, 임시 파일이 생성되거나 파일 크기와 타임스탬프가 변경되는 등 매우 짧은 시간 내에 불필요한 다수의 수정(Modify) 이벤트가 연속으로 방출된다는 점이다22. 또한, 파일명이 변경될 때(Rename) 출발지(From) 이벤트와 목적지(To) 이벤트가 서로 다른 두 개의 이벤트로 분리되어 전달되기 때문에 상태를 일관성 있게 추적하기가 극히 어렵다22.  
이러한 원시 이벤트의 파편화 및 노이즈 문제를 해결하기 위해, notify 생태계 내에 존재하는 notify-debouncer-full 크레이트의 도입이 필수불가결하다23. 이 라이브러리는 다음과 같은 핵심 최적화를 수행하여 아키텍처의 안정성을 담보한다23:

| 주요 최적화 기능 | 메커니즘 및 혜택 |
| :---- | :---- |
| **디바운싱 (Debouncing)** | 개발자가 설정한 타임프레임(예: 500ms) 동안 동일한 파일에서 발생하는 여러 이벤트를 버퍼에 담아두었다가 단일 이벤트로 압축(Coalescing)하여 송출한다. 불필요한 리렌더링 및 디스크 스레싱을 막는다. |
| **리네임(Rename) 이벤트 융합** | 파일 시스템 ID를 추적하여(특히 macOS FSEvents, Windows 환경에서) 파편화된 리네임의 출발지와 목적지를 추론해 단일 Rename 이벤트 인스턴스로 바인딩한다23. |
| **중복 생성/수정 병합** | 생성(Create) 이벤트 직후에 발생하는 수정(Modify) 이벤트는 파일 쓰기가 진행 중인 과정이므로, 이를 병합하여 프론트엔드로 중복 보고하지 않는다23. |
| **디렉토리 삭제 처리 간소화** | 리눅스 inotify 환경에서 디렉토리 내부 파일들의 무수한 삭제 이벤트 대신 해당 디렉토리 삭제 이벤트 하나로 병합하여 시스템 부하를 줄인다23. |

이처럼 notify-debouncer-full은 노이즈로 가득한 원시 파일 시스템 이벤트를 논리적으로 잘 정돈된 비즈니스 수준의 인시던트(Incident)로 변환해 주는 필수적인 미들웨어 역할을 수행한다24.

### **다중 스레드 환경에서의 워커 스레드와 통신 채널(Channel) 설계**

성능 중심의 데스크톱 앱에서 파일 감지 시스템은 애플리케이션의 수명 주기와 병렬로 메인 쓰레드를 방해하지 않으면서 묵묵히 동작해야 한다. notify-debouncer-full을 초기화하고 실행하는 과정은 내부적으로 블로킹 특성을 띠거나 지속적인 관찰 루프를 형성하므로, 이를 메인 비동기 런타임(Tokio)에 직접 묶어두면 다른 IPC 호출의 처리가 지연되는 현상이 발생한다25.  
최적의 아키텍처는 감지 워커(Watcher Worker)를 std::thread::spawn을 이용해 완전히 별도의 OS 스레드로 격리하는 것이다25. 이때 워커 스레드에서 감지된 디바운싱 데이터를 Tauri의 비동기 환경이나 메인 컨텍스트로 릴레이하기 위해 생산자-소비자(Producer-Consumer) 패턴을 구현해야 한다. std::sync::mpsc::channel 혹은 tokio::sync::mpsc를 생성한 후, 채널의 송신자(Sender) 부분은 디바운서의 콜백으로 넘겨주고 수신자(Receiver) 부분은 워커 스레드 루프 내에서 데이터를 기다렸다가 Tauri 객체를 통해 프론트엔드로 전달하는 구조가 가장 권장되는 패턴이다18.

## **Tauri 2.x Emitter 트레이트를 활용한 실시간 이벤트 브로드캐스팅**

Rust 백엔드의 독립된 워커 스레드에서 수집되고 디바운싱 처리된 파일 변경 내역은 이제 프론트엔드 환경으로 실시간 푸시(Push)되어야 한다. 웹 기술에서는 통상 WebSocket 등을 연상하지만, Tauri 환경에서는 메모리를 직접 쉐어하는 네이티브 IPC 계층을 통한 독자적인 이벤트 시스템을 제공한다27.

### **Backend-to-Frontend 이벤트 송출 아키텍처**

Tauri 2.0 버전에서는 이벤트 발송 시스템이 인터페이스 지향적으로 개편되어 Emitter 트레이트(Trait)를 중심으로 동작한다28. 백엔드 내에서 프론트엔드로 이벤트를 쏘아 올리기 위해서는 이 Emitter 트레이트를 상속받은 인스턴스(가장 대표적으로 AppHandle 또는 특정 WebviewWindow)가 필요하다28.  
Rust 코드 단에서 tauri::Emitter를 현재 스코프로 use 선언하면, 해당 객체들은 아래와 같은 발송 메서드를 사용할 수 있게 된다28:

* **emit("event-name", payload)**: 앱에 존재하는 모든 창(웹뷰)에 등록된 리스너를 향해 글로벌하게 브로드캐스팅(Broadcasting)을 수행한다28. 전체 데이터를 리프레시해야 할 때 주로 쓰인다.  
* **emit\_to("window-label", "event-name", payload)**: 시스템 자원 절약 및 데이터 보안 격리를 위해 특정 창(예: 파일 뷰어 창)에만 데이터를 표적 발송한다28.  
* **emit\_filter**: 클로저(Closure)를 사용하여 다수의 윈도우 중 동적으로 조건(예: 특정 레이블을 가진 여러 창들)을 필터링해 발송 대상을 능동적으로 선택한다28.

이때 전달되는 페이로드(Payload) 객체는 내부적으로 JSON 포맷으로 직렬화되어 문자열 형태로 전달된다28. 따라서 백엔드의 Rust 구조체는 반드시 serde::Serialize 트레이트와 구조체를 복제할 수 있는 Clone 트레이트를 구현해야 한다28. 프론트엔드에서는 이러한 JSON 데이터를 네이티브 JavaScript 객체로 즉시 전달받게 된다28.

### **실전 구현 레퍼런스: 파일 변경 감지 및 React 프론트엔드 통합 코드**

본 섹션에서는 위에서 서술한 notify-debouncer-full의 스레드 격리 아키텍처와 Tauri 2.x의 Emitter 트레이트를 융합하여, 로컬 앱 데이터 폴더의 변경 내역을 수집하고 프론트엔드에서 이를 렌더링하는 실전 모범 사례 코드를 제시한다.  
**1\. Cargo 의존성 구성 (Cargo.toml)**  
먼저 파일 변경을 수집할 필수 크레이트들을 선언한다23.

Ini, TOML  
\[dependencies\]  
tauri \= { version \= "2.0.0", features \= \["config-json5"\] }  
serde \= { version \= "1.0", features \= \["derive"\] }  
serde\_json \= "1.0"  
notify \= "6.1"  
notify-debouncer-full \= "0.3"

**2\. Rust 백엔드 구현 (src-tauri/src/main.rs)**  
이 코드는 애플리케이션 수명주기 초기화 단계(setup 훅)에서 관찰자 스레드를 분리 생성하며, 프론트엔드가 요구하는 JSON 규격에 맞추어 camelCase로 필드를 변경하여 직렬화를 수행한다.

Rust  
\#\!\[cfg\_attr(  
    all(not(debug\_assertions), target\_os \= "windows"),  
    windows\_subsystem \= "windows"  
)\]

use std::path::PathBuf;  
use std::sync::mpsc;  
use std::time::Duration;

use notify\_debouncer\_full::{new\_debouncer, notify::RecursiveMode, DebounceEventResult};  
use serde::Serialize;  
use tauri::{AppHandle, Emitter, Manager};

/// 프론트엔드로 송출할 이벤트 페이로드 정의  
/// serde의 rename\_all 속성을 활용하여 Rust의 snake\_case 속성을 프론트엔드 표준인 camelCase로 변환한다.  
\#\[derive(Clone, Serialize, Debug)\]  
\#\[serde(rename\_all \= "camelCase")\]  
struct FileChangeEvent {  
    pub paths: Vec\<PathBuf\>,  
    pub kind\_description: String,  
}

/// 디바운싱 처리가 완료된 파일 시스템 이벤트를 백그라운드 스레드에서 감시하는 모듈  
fn spawn\_directory\_watcher(app\_handle: AppHandle, watch\_target: PathBuf) {  
    // 생산자(Watcher)와 소비자(Emitter)를 매개하는 MPSC 채널 생성  
    let (tx, rx) \= mpsc::channel::\<DebounceEventResult\>();

    // 메인 비동기 런타임을 블로킹하지 않기 위해 전용 워커 스레드 생성  
    std::thread::spawn(move || {  
        // 중복되는 OS 원시 이벤트를 1.5초 단위로 융합(Debounce)하는 인스턴스 생성  
        let mut debouncer \= new\_debouncer(Duration::from\_millis(1500), None, tx)  
            .expect("디바운서 시스템을 초기화하는 데 실패했습니다.");

        // 지정된 폴더 하위의 모든 변경 사항을 재귀적(Recursive) 모드로 추적 시작  
        debouncer  
            .watcher()  
            .watch(\&watch\_target, RecursiveMode::Recursive)  
            .expect("디렉토리 관찰 등록에 실패했습니다.");

        println\!("디렉토리 감시 시작됨: {:?}", watch\_target);

        // 채널을 통해 디바운싱이 완료된 이벤트 배치가 수신될 때까지 대기(블로킹 루프)  
        while let Ok(res) \= rx.recv() {  
            match res {  
                Ok(events) \=\> {  
                    for event in events {  
                        let payload \= FileChangeEvent {  
                            paths: event.paths,  
                            // 디버그 포맷팅을 통해 이벤트 타입(Create, Modify, Rename 등)을 문자열로 추출  
                            kind\_description: format\!("{:?}", event.kind),  
                        };

                        // AppHandle을 통해 Emitter 트레이트의 emit 기능을 사용하여 프론트엔드 전역으로 브로드캐스트  
                        if let Err(e) \= app\_handle.emit("fs-change", payload.clone()) {  
                            eprintln\!("이벤트 송출 중 IPC 통신 오류 발생: {}", e);  
                        }  
                    }  
                }  
                Err(errors) \=\> {  
                    for err in errors {  
                        eprintln\!("파일 변경 감지 시스템 내부 에러: {:?}", err);  
                    }  
                }  
            }  
        }  
        // 메인 스레드가 종료되어 채널이 끊어지면 자연스럽게 루프를 탈출하고 워커 스레드가 소멸됨.  
    });  
}

fn main() {  
    tauri::Builder::default()  
        .setup(|app| {  
            // 운영체제별로 지정된 애플리케이션 전용 로컬 데이터 디렉토리 경로 획득  
            let app\_data\_dir \= app.path().app\_data\_dir().expect("애플리케이션 데이터 디렉토리를 획득할 수 없습니다.");  
              
            // 디렉토리가 존재하지 않는 경우 자동 생성  
            if \!app\_data\_dir.exists() {  
                std::fs::create\_dir\_all(\&app\_data\_dir).expect("데이터 디렉토리 생성 실패");  
            }

            // 워커 스레드에 소유권을 이전하기 위해 AppHandle을 복제  
            let app\_handle \= app.handle().clone();  
              
            spawn\_directory\_watcher(app\_handle, app\_data\_dir);

            Ok(())  
        })  
        .run(tauri::generate\_context\!())  
        .expect("Tauri 애플리케이션 프로세스 실행 중 치명적 오류가 발생했습니다.");  
}

이 구현은 OS 자원을 효율적으로 관리하면서, 1.5초라는 타임프레임 동안 연속해서 발생한 불필요한 시스템 수정 이벤트를 하나로 압축하여 백엔드의 과부하와 IPC 큐 버퍼의 적체를 근본적으로 방지한다23.  
**3\. 프론트엔드 (React / TypeScript) 리스너 통합**  
Rust 백엔드에서 뿜어내는 fs-change 이벤트를 React 컴포넌트 내에서 안정적으로 소비(Consume)하기 위해서는 프론트엔드 API 패키지의 listen 함수를 사용한다28.  
설치 명령어:

Bash  
npm install @tauri-apps/api

TypeScript  
import React, { useEffect, useState } from 'react';  
import { listen } from '@tauri-apps/api/event';

// Rust 백엔드의 구조체와 동일한 형태를 지닌 TypeScript 인터페이스 (rename\_all="camelCase" 적용됨)  
interface FileChangeEvent {  
  paths: string\[\];  
  kindDescription: string;  
}

const RealTimeDirectoryMonitor: React.FC \= () \=\> {  
  const \[events, setEvents\] \= useState\<FileChangeEvent\[\]\>(\[\]);

  useEffect(() \=\> {  
    // 이벤트 구독 취소 함수를 저장할 변수 할당  
    let unlisten: (() \=\> void) | undefined;

    const initializeListener \= async () \=\> {  
      try {  
        // Tauri 2.0 API를 호출하여 IPC 브릿지에 리스너 등록  
        unlisten \= await listen\<FileChangeEvent\>('fs-change', (event) \=\> {  
          // 백엔드에서 전송된 JSON 페이로드는 event.payload 내부에 존재함  
          console.log('디바운싱된 시스템 이벤트 수신:', event.payload);  
            
          setEvents((prev) \=\> {  
            // 배열 크기를 최대 50개로 유지하여 프론트엔드 DOM 렌더링 성능 최적화  
            const updated \= \[event.payload, ...prev\];  
            return updated.slice(0, 50);  
          });  
        });  
      } catch (error) {  
        console.error('IPC 이벤트 리스너 등록 중 오류 발생:', error);  
      }  
    };

    initializeListener();

    // 정리(Cleanup) 함수: React 컴포넌트가 DOM에서 언마운트되거나 핫 모듈 리플레이스먼트(HMR) 발생 시 실행  
    return () \=\> {  
      if (unlisten) {  
        // 반드시 구독을 해지하여 SPA 환경에서 동일 이벤트가 중복으로 리스닝(메모리 누수)되는 것을 원천 차단  
        unlisten();  
      }  
    };  
  }, \[\]); // 의존성 배열을 비워 최초 마운트 시에만 구독 프로세스 실행

  return (  
    \<div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}\>  
      \<h2\>실시간 시스템 디렉토리 상태 모니터링\</h2\>  
      \<div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid \#ccc' }}\>  
        \<ul style={{ listStyleType: 'none', padding: '10px' }}\>  
          {events.length \=== 0 ? (  
            \<li\>시스템 변경 이벤트 대기 중...\</li\>  
          ) : (  
            events.map((evt, idx) \=\> (  
              \<li key={idx} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px dashed \#eee' }}\>  
                \<div\>\<strong\>트랜잭션 종류:\</strong\> {evt.kindDescription}\</div\>  
                \<div\>  
                  \<strong\>대상 경로:\</strong\>   
                  {evt.paths.map((p, i) \=\> \<div key={i} style={{ paddingLeft: '10px', color: '\#555' }}\>{p}\</div\>)}  
                \</div\>  
              \</li\>  
            ))  
          )}  
        \</ul\>  
      \</div\>  
    \</div\>  
  );  
};

export default RealTimeDirectoryMonitor;

프론트엔드 아키텍처 설계에서 가장 경계해야 할 함정은 다중 구독(Multi-subscription)으로 인한 메모리 누수이다. listen 함수는 호출 즉시 언리스닝 함수(Unlisten function)를 해결값으로 가지는 프로미스(Promise)를 반환한다28. 따라서 useEffect의 반환 단계(Cleanup function)에서 이 언리스닝 함수를 호출하도록 설계함으로써, 뷰가 교체되는 SPA(Single Page Application) 환경에서 리스너가 중첩되어 단일 파일 변경 시 프론트엔드 함수가 수십 번 반복 실행되는 끔찍한 성능 저하 현상을 미연에 방지할 수 있다28.

## **결론 및 아키텍처 설계 제언**

Tauri 2.x 프레임워크는 과거 웹 앱 래퍼(Wrapper)들의 고질적인 한계였던 비대한 리소스 점유와 허술한 보안 취약성을 극복하고, 네이티브 앱과 대등한 퍼포먼스와 극도의 샌드박싱 환경을 구축해냈다. 본 문서에서 검토한 기술적 모범 사례들을 종합하면 다음과 같은 아키텍처 설계 원칙을 도출할 수 있다.  
첫째, 모든 보안 설정의 기점은 tauri.conf.json과 Capabilities의 유기적인 분리에서 출발한다. 전역으로 허용된 권한을 폐기하고 특정 윈도우 레이블 단위로 \$APPDATA 등의 변수를 이용해 파일 시스템 스코프를 제한함으로써, 악의적인 스크립트 인젝션 공격이 시스템 전체를 장악하는 것을 물리적으로 불가능하게 만들어야 한다.  
둘째, 잦은 I/O와 데이터 무결성이 요구되는 민감한 파일 제어는 전적으로 Rust 백엔드 서비스 계층으로 캡슐화해야 한다. std::fs 대신 tokio::fs의 비동기 능력을 활용해 메인 쓰레드 블로킹을 막고, 임시 파일을 활용한 원자적 쓰기(Atomic Write) 패턴을 구현함으로써 전원 차단 시에도 데이터를 보호하는 결함 내성(Fault-tolerance)을 확보해야 한다.  
셋째, 로컬 시스템과 프론트엔드를 실시간으로 동기화하기 위해서는 OS 원시 이벤트의 노이즈를 완벽하게 필터링하는 notify-debouncer-full을 워커 스레드 내에 독립적으로 구성해야 한다. 그리고 이를 MPSC 채널을 통해 메인 런타임으로 전달한 뒤, Tauri의 고도화된 Emitter 트레이트를 거쳐 프론트엔드로 브로드캐스팅하는 생산자-소비자 아키텍처가 성능과 안정성을 모두 쟁취할 수 있는 유일한 모범 답안이다.  
이러한 선진화된 아키텍처 원칙들을 프로젝트 초기 단계부터 철저히 반영한다면, 개발자는 프론트엔드 생태계의 민첩성을 그대로 유지하면서도 운영체제 깊숙한 곳까지 안전하고 유연하게 제어하는 차세대 데스크톱 및 모바일 크로스 플랫폼 애플리케이션을 완성할 수 있을 것이다.

#### **참고 자료**

> 1. Tauri Architecture, [https\://v2.tauri.app/concept/architecture/](https://v2.tauri.app/concept/architecture/)  
> 2. Capabilities | Tauri, [https\://v2.tauri.app/security/capabilities/](https://v2.tauri.app/security/capabilities/)  
> 3. Permissions and Capabilities | zudo-tauri-wisdom, [https\://zudo-tauri-wisdom.takazudomodular.com/docs/frontend/capabilities](https://zudo-tauri-wisdom.takazudomodular.com/docs/frontend/capabilities)  
> 4. Configuration Files \- Tauri, [https\://v2.tauri.app/develop/configuration-files/](https://v2.tauri.app/develop/configuration-files/)  
> 5. Configuration | Tauri v1, [https\://tauri.app/v1/api/config](https://tauri.app/v1/api/config)  
> 6. Configuration \- Tauri, [https\://v2.tauri.app/reference/config/](https://v2.tauri.app/reference/config/)  
> 7. Config in tauri \- Rust \- Docs.rs, [https\://docs.rs/tauri/latest/tauri/struct.Config.html](https://docs.rs/tauri/latest/tauri/struct.Config.html)  
> 8. Tauri app shows white screen when I run the app \- Stack Overflow, [https\://stackoverflow.com/questions/72336875/tauri-app-shows-white-screen-when-i-run-the-app](https://stackoverflow.com/questions/72336875/tauri-app-shows-white-screen-when-i-run-the-app)  
> 9. Window Customization \- Tauri, [https\://v2.tauri.app/learn/window-customization/](https://v2.tauri.app/learn/window-customization/)  
> 10. Tauri 2.0 Project Setup for Production \- YouTube, [https\://www\.youtube.com/watch?v=goAXKqkJYcM](https://www.youtube.com/watch?v=goAXKqkJYcM)  
> 11. Permissions \- Tauri, [https\://v2.tauri.app/security/permissions/](https://v2.tauri.app/security/permissions/)  
> 12. \[feat\] per-webview allow-list of custom URI schemes \#13224 \- GitHub, [https\://github.com/tauri-apps/tauri/issues/13224](https://github.com/tauri-apps/tauri/issues/13224)  
> 13. tauri-v2 \- Skill \- Smithery, [https\://smithery.ai/skills/funnyhust/tauri-v2](https://smithery.ai/skills/funnyhust/tauri-v2)  
> 14. File System \- Tauri, [https\://v2.tauri.app/plugin/file-system/](https://v2.tauri.app/plugin/file-system/)  
> 15. Calling Rust from the Frontend \- Tauri, [https\://v2.tauri.app/develop/calling-rust/](https://v2.tauri.app/develop/calling-rust/)  
> 16. atomic\_write\_file \- Rust \- Docs.rs, [https\://docs.rs/atomic-write-file](https://docs.rs/atomic-write-file)  
> 17. Rust Cookbook (rust-lang-nursery/rust-cookbook) | Context7, [https\://context7.com/rust-lang-nursery/rust-cookbook](https://context7.com/rust-lang-nursery/rust-cookbook)  
> 18. notify \- crates.io: Rust Package Registry, [https\://crates.io/crates/notify/4.0.18](https://crates.io/crates/notify/4.0.18)  
> 19. notify-rs/notify: Cross-platform filesystem notification library for Rust., [https\://github.com/notify-rs/notify](https://github.com/notify-rs/notify)  
> 20. notify \- Rust \- Docs.rs, [https\://docs.rs/notify/](https://docs.rs/notify/)  
> 21. Real-time directory monitoring and virus scanning with Rust and, [https\://transloadit.com/devtips/real-time-virus-scanning-with-rust-clamav/](https://transloadit.com/devtips/real-time-virus-scanning-with-rust-clamav/)  
> 22. 【Rust】 notify でディレクトリの更新監視をしてみる \- Cloudii, [https\://cloudii.jp/news/blog/%E9%96%8B%E7%99%BA/rust-notify-practice/](https://cloudii.jp/news/blog/%E9%96%8B%E7%99%BA/rust-notify-practice/)  
> 23. notify-debouncer-full \- crates.io: Rust Package Registry, [https\://crates.io/crates/notify-debouncer-full](https://crates.io/crates/notify-debouncer-full)  
> 24. notify: Cross-Platform Filesystem Watching for Rust \- Open Apps Pro, [https\://openapps.pro/packages/notify-rs](https://openapps.pro/packages/notify-rs)  
> 25. Is there some way to make notify debounce watcher async?, [https\://stackoverflow.com/questions/76797906/is-there-some-way-to-make-notify-debounce-watcher-async](https://stackoverflow.com/questions/76797906/is-there-some-way-to-make-notify-debounce-watcher-async)  
> 26. Rust: Watch For File/Directory Changes | by Itsuki \- Level Up Coding, [https\://levelup.gitconnected.com/rust-watch-for-file-directory-changes-03174b819222](https://levelup.gitconnected.com/rust-watch-for-file-directory-changes-03174b819222)  
> 27. event \- Tauri, [https\://v2.tauri.app/reference/javascript/api/namespaceevent/](https://v2.tauri.app/reference/javascript/api/namespaceevent/)  
> 28. Calling the Frontend from Rust | Tauri, [https\://v2.tauri.app/develop/calling-frontend/](https://v2.tauri.app/develop/calling-frontend/)  
> 29. Emitter in tauri \- Rust \- Docs.rs, [https\://docs.rs/tauri/latest/tauri/trait.Emitter.html](https://docs.rs/tauri/latest/tauri/trait.Emitter.html)  
> 30. Optify — Rust config library // Lib.rs, [https\://lib.rs/crates/optify](https://lib.rs/crates/optify)