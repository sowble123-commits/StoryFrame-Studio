# **모던 웹 및 데스크톱 애플리케이션 아키텍처: React 19와 Tauri 2.0 기반 상태 관리 및 IPC 통신 최적화 레퍼런스**

## **1\. 서론 및 아키텍처 패러다임의 전환**

최신 소프트웨어 아키텍처 환경에서는 프론트엔드의 상태 관리 경량화와 데스크톱 애플리케이션의 네이티브 성능 극대화가 핵심 과제로 대두되고 있다. 과거 데스크톱 애플리케이션 시장을 주도하던 Electron 프레임워크는 Chromium 브라우저와 Node.js 런타임을 전체 패키징하는 구조적 한계로 인해 과도한 메모리 점유와 거대한 바이너리 크기라는 치명적인 단점을 노출해 왔다1. 이에 대한 대안으로 부상한 Tauri 2.0은 운영체제 네이티브 웹뷰(Windows의 WebView2, macOS의 WKWebView 등)를 렌더링 엔진으로 활용하고, 백엔드 로직을 메모리 안전성과 영(Zero) 비용 추상화를 보장하는 Rust로 작성함으로써 데스크톱 애플리케이션 아키텍처의 새로운 표준을 제시하고 있다1. 실제 벤치마크 데이터에 따르면, Tauri는 Electron 대비 설치 파일 크기를 약 99% 축소(349MB에서 2.58MB로 감소)하고, 유휴 상태의 메모리 점유율을 260MB에서 26MB 수준으로 대폭 절감하는 압도적인 리소스 효율성을 입증하였다3.  
이러한 고성능 백엔드 인프라와 결합하는 프론트엔드 생태계 역시 React 19의 도입과 함께 급격한 변화를 맞이하고 있다. React 19는 컴파일러 기반의 자동 메모이제이션(React Compiler)과 비동기 상태 전환 훅(useActionState, useOptimistic)을 새롭게 제공하여 컴포넌트 내부의 상태 렌더링을 고도화하였다6. 그러나 애플리케이션 전역을 아우르는 복잡한 클라이언트 상태와 백엔드 캐시 데이터를 일관성 있게 관리하기 위해서는 여전히 전역 상태 관리 솔루션이 필수적이다. Redux와 같은 기존의 무거운 상태 관리 도구는 보일러플레이트 코드의 범람과 렌더링 성능 저하를 야기하므로, 단일 훅(Hook) 호출만으로 컨텍스트 프로바이더(Provider) 없이 스토어를 생성하고 관리할 수 있는 1.2kB 규모의 초경량 라이브러리 Zustand가 시장을 주도하게 되었다8.  
본 레퍼런스 문서는 고성능 크로스 플랫폼 애플리케이션을 구축하려는 수석 엔지니어 및 아키텍트를 대상으로 작성되었다. 본 문서에서는 React 19 최신 환경에서 Zustand v5와 Immer 미들웨어를 결합하여 불변성을 유지하는 동시에 타입 안정성을 확보하는 전역 상태 관리 모범 사례를 상세히 다룬다. 아울러 Tauri 2.x 버전의 코어 API(@tauri-apps/api/core)를 활용하여 Rust 백엔드와 프론트엔드 간의 프로세스 간 통신(IPC)을 구현하는 비동기 커맨드 호출(Invoke) 설계 기법을 분석한다. 마지막으로, 단방향 상태 푸시를 위한 이벤트(Event) 시스템의 구독 및 해제 메커니즘과 대규모 데이터 스트리밍을 위한 채널(Channel) 기반 통신 최적화 전략을 심도 있게 조망한다.

## **2\. React 19 환경에서의 Zustand와 Immer 기반 전역 상태 관리 아키텍처**

Zustand는 리액트의 useSyncExternalStore 내부 메커니즘을 적극 활용하여, 리액트 컴포넌트 외부에서 독립적으로 상태를 관리하면서도 동시성 렌더링(Concurrency) 환경에서 티어링(Tearing) 현상을 방지하도록 설계되었다11. Zustand에 Immer를 결합하면 깊게 중첩된 객체 상태를 관리할 때 필수적인 전개 연산자(Spread Operator)의 남용을 막고, 상태의 불변성을 유지하면서도 코드를 직접 변이(Mutate)하는 것처럼 직관적으로 작성할 수 있다13. 그러나 이러한 미들웨어들의 중첩 결합은 타입스크립트의 타입 추론 시스템을 교란시킬 수 있으므로, 정확한 타입 선언과 미들웨어 체이닝 순서를 준수하는 것이 아키텍처 설계의 첫 번째 관문이다.

### **2.1. 미들웨어 체이닝과 타입스크립트 추론 최적화 기법**

Zustand의 create 함수는 기본적으로 타입스크립트 제네릭을 받아 상태와 액션의 형태를 강제한다. 그러나 Zustand에 Immer, DevTools, Persist와 같은 미들웨어를 다중으로 적용할 경우, 각각의 미들웨어가 스토어의 set 함수 시그니처를 변형시키기 때문에 타입스크립트 컴파일러가 상태 타입을 unknown으로 상실하는 인과적 한계가 존재한다15.  
이러한 타입 추론의 소실을 방지하고 상태 객체의 런타임 안정성을 보장하기 위해, Zustand는 커링(Currying) 패턴이 적용된 이중 괄호 create\<T\>()(...) 형태의 호출 문법을 강제한다8. 첫 번째 괄호에서 제네릭 타입 파라미터를 통해 전체 스토어의 형태를 확정 지은 후, 두 번째 괄호에서 실제 상태 생성자 함수(State Creator)와 미들웨어 체인을 주입하는 방식이다15.  
미들웨어의 적용 순서 또한 애플리케이션의 동작과 타입 추론에 지대한 영향을 미친다. 미들웨어는 래핑(Wrapping)된 순서의 역순으로 상태 변경 과정을 가로채기 때문이다. 특히 devtools 미들웨어는 상태 변경 내역을 Redux DevTools로 전송하기 위해 setState 객체에 액션 타입 파라미터를 추가하므로, 반드시 체인의 가장 바깥쪽(가장 먼저 호출되는 래퍼)에 위치해야 한다13. 만약 immer가 devtools를 감싸게 되면, devtools가 주입한 타입 정보가 유실되어 액션 이름이 추적되지 않거나 컴파일 에러가 발생한다15.  
이러한 원칙들을 종합한 최적의 상태 스토어 구성 패턴은 다음과 같이 구현된다.

TypeScript  
import { create } from 'zustand';  
import { immer } from 'zustand/middleware/immer';  
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

// 1\. 상태(State)와 액션(Action) 인터페이스의 명확한 분리  
interface SessionState {  
  user: {  
    id: string;  
    role: 'guest' | 'admin';  
    settings: {  
      theme: 'dark' | 'light';  
      notifications: boolean;  
    };  
  };  
  isAuthenticated: boolean;  
}

interface SessionActions {  
  updateTheme: (theme: 'dark' | 'light') \=\> void;  
  loginUser: (id: string, role: 'guest' | 'admin') \=\> void;  
  logoutUser: () \=\> void;  
}

type SessionStore \= SessionState & SessionActions;

// 2\. 초기 상태 분리를 통한 Reset 로직의 재사용성 확보  
const initialSessionState: SessionState \= {  
  user: {  
    id: '',  
    role: 'guest',  
    settings: {  
      theme: 'dark',  
      notifications: true,  
    },  
  },  
  isAuthenticated: false,  
};

// 3\. 커링(Currying)을 통한 타입 주입 및 정밀한 미들웨어 체이닝  
export const useSessionStore \= create\<SessionStore\>()(  
  devtools(  
    persist(  
      immer((set) \=\> ({  
        ...initialSessionState,  
          
        // Immer 미들웨어가 주입된 set 함수는 draft 상태를 직접 변이할 수 있음  
        updateTheme: (theme) \=\>  
          set(  
            (state) \=\> {  
              // 전개 연산자 없이 깊은 중첩 객체를 직접 수정  
              state.user.settings.theme \= theme;  
            },  
            false,  
            'session/updateTheme' // DevTools에 표시될 명시적 액션명  
          ),  
            
        loginUser: (id, role) \=\>  
          set(  
            (state) \=\> {  
              state.user.id \= id;  
              state.user.role \= role;  
              state.isAuthenticated \= true;  
            },  
            false,  
            'session/loginUser'  
          ),  
            
        logoutUser: () \=\>  
          set(  
            (state) \=\> {  
              // 상태 초기화를 위해 initialSessionState의 값을 할당  
              state.user \= initialSessionState.user;  
              state.isAuthenticated \= initialSessionState.isAuthenticated;  
            },  
            false,  
            'session/logoutUser'  
          ),  
      })),  
      {  
        name: 'session-storage', // 로컬 스토리지에 저장될 키 이름  
        storage: createJSONStorage(() \=\> localStorage), // 스토리지 방식 지정  
        // partialize 옵션을 통해 영속화할 상태를 선택적으로 필터링 가능  
        partialize: (state) \=\> ({ user: state.user, isAuthenticated: state.isAuthenticated }),  
      }  
    ),  
    { name: 'SessionStore', enabled: process.env.NODE\_ENV \!== 'production' }  
  )  
);

이 패턴은 객체의 불변성을 유지하기 위한 번거로운 복사 작업을 완벽히 제거하며, persist 미들웨어를 통해 브라우저의 새로고침 시에도 사용자 세션이 영구적으로 유지되도록 보장한다13. 또한 devtools 미들웨어의 세 번째 인자로 주입된 액션 문자열은 디버깅 시 상태 변화의 원인을 명확하게 식별할 수 있도록 기여한다13.

### **2.2. Slice 패턴을 활용한 대규모 상태 스토어의 모듈화 전략**

애플리케이션의 도메인이 확장되고 관리해야 할 상태가 방대해지면, 단일 파일에 모든 상태와 로직을 정의하는 것은 코드의 가독성을 파괴하고 유지보수를 불가능하게 만든다. Zustand는 Redux와 같이 단일 스토어를 강제하지 않고 도메인별로 여러 개의 스토어를 분리하여 사용하는 것을 허용하지만, 특정 상태들이 서로 의존성을 가지거나 함께 결합되어야 할 경우에는 'Slice 패턴'을 사용하여 거대한 스토어를 논리적인 조각(Slice)으로 분리한 뒤 병합하는 방식을 권장한다15.  
Immer 미들웨어를 적용한 상태에서 Slice 패턴을 구현하려면 타입스크립트의 추론 메커니즘을 각별히 고려해야 한다. 개별 슬라이스 생성 함수는 자신이 병합될 전체 스토어의 타입을 알아야 하며, 동시에 Immer 미들웨어에 의해 변형된 set 함수의 시그니처를 정확히 인지해야 한다15. 이를 위해 Zustand가 제공하는 StateCreator 타입을 기반으로 ImmerStateCreator라는 커스텀 유틸리티 타입을 정의하여 사용해야 한다20.

TypeScript  
import { create, StateCreator } from 'zustand';  
import { immer } from 'zustand/middleware/immer';  
import { devtools } from 'zustand/middleware';

// 전체 스토어 타입 제네릭 T, 현재 슬라이스 타입 제네릭 U  
// Immer 미들웨어 뮤테이터 시그니처 \[\["zustand/immer", never\]\] 적용  
export type ImmerStateCreator\<  
  T,  
  U \= T  
\> \= StateCreator\<T, \[\['zustand/immer', never\]\], \[\], U\>;

// 1\. 도메인별 슬라이스 인터페이스 정의  
interface TodoSlice {  
  todos: Array\<{ id: string; text: string; done: boolean }\>;  
  addTodo: (text: string) \=\> void;  
  toggleTodo: (id: string) \=\> void;  
}

interface FilterSlice {  
  visibilityFilter: 'ALL' | 'ACTIVE' | 'COMPLETED';  
  setFilter: (filter: 'ALL' | 'ACTIVE' | 'COMPLETED') \=\> void;  
}

// 2\. 전체 스토어 인터페이스 병합  
type RootStore \= TodoSlice & FilterSlice;

// 3\. Todo 슬라이스 구현체  
const createTodoSlice: ImmerStateCreator\<RootStore, TodoSlice\> \= (set, get) \=\> ({  
  todos: \[\],  
  addTodo: (text) \=\>  
    set((state) \=\> {  
      state.todos.push({ id: crypto.randomUUID(), text, done: false });  
    }, false, 'todo/addTodo'),  
      
  toggleTodo: (id) \=\>  
    set((state) \=\> {  
      const todo \= state.todos.find((t) \=\> t.id \=== id);  
      if (todo) {  
        todo.done \= \!todo.done;  
      }  
    }, false, 'todo/toggleTodo'),  
});

// 4\. Filter 슬라이스 구현체  
// get() 함수를 통해 다른 슬라이스의 상태(예: todos)에 접근하는 것도 가능함  
const createFilterSlice: ImmerStateCreator\<RootStore, FilterSlice\> \= (set) \=\> ({  
  visibilityFilter: 'ALL',  
  setFilter: (filter) \=\>  
    set((state) \=\> {  
      state.visibilityFilter \= filter;  
    }, false, 'filter/setFilter'),  
});

// 5\. 슬라이스 병합 및 스토어 생성  
export const useRootStore \= create\<RootStore\>()(  
  devtools(  
    immer((...args) \=\> ({  
      ...createTodoSlice(...args),  
      ...createFilterSlice(...args),  
    })),  
    { name: 'RootStore' }  
  )  
);

위의 아키텍처는 각 도메인 로직을 독립적인 파일로 분리할 수 있게 해주며, 동시에 get() 파라미터를 통해 교차 슬라이스 간의 의존성을 쉽게 해결할 수 있도록 돕는다. ImmerStateCreator를 통과한 set 함수는 타입 시스템 내에서 자신이 Immer의 draft 객체를 다루고 있다는 사실을 명확히 인지하게 되어 런타임 오류를 방지한다20.

### **2.3. 성능 최적화: useShallow와 파생 상태의 렌더링 제어**

React 컴포넌트에서 Zustand 스토어를 구독할 때 가장 흔히 범하는 안티 패턴은 전체 스토어 객체를 통째로 반환받거나, 구조 분해 할당을 위해 선택자(Selector) 내부에서 새로운 객체를 생성하여 반환하는 것이다22. React와 Zustand의 구독 시스템은 Object.is를 통한 얕은 비교(Shallow Equality) 메커니즘을 기반으로 상태의 변경 여부를 판단한다23. 따라서 컴포넌트가 매번 새로운 참조(Reference)를 가진 객체를 반환받게 되면, 실제 프로퍼티의 값은 동일하더라도 React는 이를 새로운 상태로 간주하여 심각한 불필요한 리렌더링이나 무한 루프를 발생시킨다22.  
Zustand는 이러한 성능 병목을 해결하기 위해 useShallow라는 내장 훅을 제공한다. useShallow로 선택자 함수를 감싸면, 반환된 객체의 각 프로퍼티 내부 값들을 순회하며 이전 렌더링 시점의 값과 비교하게 되고, 오직 실제 값이 변경되었을 때만 렌더링을 트리거하여 컴포넌트의 생명주기를 최적화한다22.

| 상태 구독 아키텍처 패턴 | 문법 구조 및 예시 | 리렌더링 유발 빈도 및 원인 | 최적화 평가 |
| :---- | :---- | :---- | :---- |
| **객체 반환 (안티 패턴)** | useStore((s) \=\> ({ a: s.a, b: s.b })) | 스토어 내의 완전히 무관한 상태가 변경되어도 매번 새로운 객체 참조가 생성되어 **항상 렌더링** 됨 | 매우 나쁨 (성능 저하 및 무한 루프 가능성 높음)22 |
| **개별 원시값 Selector** | const a \= useStore((s) \=\> s.a); const b \= useStore((s) \=\> s.b); | 개별 상태 a 또는 b가 변경될 때만 독립적으로 렌더링 됨 | 가장 확실하고 투명한 방법이나 구독할 상태가 많아지면 보일러플레이트가 급증함22 |
| **useShallow 결합 (권장)** | useStore(useShallow((s) \=\> ({ a: s.a, b: s.b }))) | 객체를 반환하지만, 내부 프로퍼티 a, b의 값이 실제로 변했을 때만 렌더링 됨 | 높은 응집력과 최적의 성능을 동시에 달성22 |

TypeScript  
import { useShallow } from 'zustand/react/shallow';  
import { useRootStore } from './store';

export function TodoList() {  
  // useShallow를 활용하여 객체 반환 시의 참조 변경에 따른 불필요한 리렌더링 차단  
  const { todos, toggleTodo } \= useRootStore(  
    useShallow((state) \=\> ({  
      // 주의: map, filter 등 배열의 새로운 참조를 반환하는 연산은   
      // 이 레벨에서 수행하지 않는 것이 렌더링 최적화에 유리하다.  
      todos: state.todos,  
      toggleTodo: state.toggleTodo,  
    }))  
  );

  return (  
    \<ul\>  
      {todos.map((todo) \=\> (  
        \<li   
          key={todo.id}   
          onClick={() \=\> toggleTodo(todo.id)}  
          style={{ textDecoration: todo.done ? 'line-through' : 'none' }}  
        \>  
          {todo.text}  
        \</li\>  
      ))}  
    \</ul\>  
  );  
}

추가적인 성능 최적화 관점에서, useShallow는 배열이나 중첩된 깊은 객체보다는 원시값(Primitive) 프로퍼티들의 조합을 반환할 때 진정한 위력을 발휘한다23. 따라서 상태를 설계할 때 거대한 단일 객체보다는 속성 단위로 정밀하게 쪼개어 스토어에 평탄화(Flatten)하는 것이 권장된다.  
또한 Next.js와 같이 SSR(서버 사이드 렌더링)이 적용되는 React 19 환경에서는 Zustand의 persist 미들웨어가 로컬 스토리지에서 비동기적으로 데이터를 읽어오는 과정에서 서버의 초기 HTML 트리와 클라이언트의 DOM 트리가 불일치하는 하이드레이션(Hydration) 에러가 발생할 수 있다26. 이를 방지하기 위해서는 컴포넌트 마운트 전에는 상태 반환을 보류하거나, 초기 상태를 일치시키고 useEffect를 통해 마운트 이후에 스토리지 상태를 클라이언트 뷰에 동기화하는 방어적 커스텀 훅 패턴이 동반되어야 한다27.

## **3\. Tauri 2.0 아키텍처: IPC 보안 모델과 Rust 비동기 커맨드 호출 (Invoke)**

Tauri 2.0 프레임워크의 핵심 아키텍처 철학은 프론트엔드의 웹 기술과 백엔드의 시스템 프로그래밍(Rust)을 분리하고, 그 경계를 철저히 통제되는 프로세스 간 통신(IPC)으로 연결하는 것이다1. Tauri의 IPC 브릿지는 보안적 취약점을 차단하기 위해 v2.0부터 기본적 거부(Deny-by-default) 접근 방식의 Capabilities 권한 모델을 채택하였다29. 웹 브라우저 환경에서 동작하는 프론트엔드 모듈이 운영체제의 핵심 기능이나 디스크 I/O에 접근하려면 Rust 커맨드를 작성하고, 이를 프론트엔드에서 비동기로 호출(Invoke)하는 계층적 구조를 반드시 거쳐야 한다1.

### **3.1. Capabilities 기반 보안 설정과 core:default 권한 체계**

Tauri 2.0에서 프론트엔드의 자바스크립트가 백엔드의 Rust 커맨드를 호출하거나 이벤트를 수신하기 위해서는 해당 명령어가 접근할 수 있는 권한 명세서인 Capabilities 파일에 명시적으로 인가되어야 한다29. src-tauri/capabilities/default.json (또는 toml) 파일은 애플리케이션의 기본 권한을 정의하며, 여기서 가장 필수적인 항목은 core:default 퍼미션이다31.  
core:default 권한은 IPC 커맨드 호출 기반 마련, 이벤트 발행 및 구독(allow-emit, allow-listen), 윈도우 관리 등 Tauri 코어의 근간이 되는 기능들을 프론트엔드에 개방한다31. 이 권한이 누락될 경우 프론트엔드의 모든 @tauri-apps/api/core 호출은 실행 시점에 "Permission denied" 에러와 함께 차단된다31.

JSON  
{  
  "\$schema": "../gen/schemas/desktop-schema.json",  
  "identifier": "default",  
  "windows": \["main"\],  
  "remote": {  
    "urls": \["http\://localhost:\*/\*\*"\]  
  },  
  "permissions": \[  
    // IPC 통신, 이벤트 시스템, 기본 윈도우 관리를 위한 코어 권한 필수 포함  
    "core:default",  
    // 애플리케이션에서 사용자가 직접 작성한 커맨드도 보안 정책에 따라 명시 가능  
    "fs:default",  
    "dialog:default"  
  \]  
}

### **3.2. Rust 백엔드 커맨드 정의와 비동기(Async) 처리**

프론트엔드의 호출을 수신하는 접점은 Rust 파일 내에 정의된 커맨드 핸들러다. 함수 상단에 \#\[tauri::command\] 매크로를 선언하면 해당 함수가 IPC 라우팅 테이블에 등록될 자격을 갖춘다32. 디스크 파일 읽기, 네트워크 트래픽 송수신, 데이터베이스 쿼리와 같이 메인 스레드를 블로킹할 우려가 있는 I/O 집약적 작업은 반드시 async 키워드를 동반하여 비동기로 선언되어야 한다32. Tauri는 이러한 비동기 커맨드를 내부적으로 Tokio 런타임 기반의 스레드 풀로 오프로드하여 UI 스레드의 멈춤(Freezing) 현상을 완벽히 차단한다32.  
프론트엔드(TS)와 백엔드(Rust) 간의 인자 전달 시 직렬화 정책 또한 매우 정교하게 동작한다. 자바스크립트 생태계의 명명 규칙인 카멜케이스(camelCase) 페이로드는 커맨드 진입 지점에서 자동으로 Rust 생태계의 스네이크케이스(snake\_case) 매개변수 명칭으로 역직렬화(Deserialization) 매핑된다32. 단, 비동기 커맨드 정의 시 Rust의 라이프타임 제약으로 인해 \&str과 같은 참조형 타입은 인자로 사용할 수 없으며, 값의 소유권을 가지는 String과 같은 타입으로 선언해야 한다32.

Rust  
// src-tauri/src/system\_commands.rs  
use std::fs;  
use tauri::command;  
use tokio::time::{sleep, Duration};

// 비동기 실행: 메인 스레드 블로킹 방지  
// 프론트엔드에서 전달된 카멜케이스(targetPath) 인자는 snake\_case(target\_path)로 맵핑됨  
\#\[tauri::command\]  
pub async fn analyze\_system\_logs(target\_path: String, max\_depth: u32) \-\> Result\<String, String\> {  
    // 무거운 작업을 시뮬레이션하기 위한 비동기 슬립 지연  
    sleep(Duration::from\_millis(1500)).await;  
      
    match fs::metadata(\&target\_path) {  
        Ok(meta) \=\> Ok(format\!(  
            "Log Analysis Complete \- Target: {}, Size: {} bytes, Depth: {}",   
            target\_path, meta.len(), max\_depth  
        )),  
        Err(e) \=\> Err(format\!("I/O Operation failed: {}", e)),  
    }  
}

작성된 커맨드는 프로그램 진입점의 tauri::Builder 내부 invoke\_handler에 전달되어야만 최종적으로 노출된다32.

Rust  
// src-tauri/src/lib.rs  
mod system\_commands;

\#\[cfg\_attr(mobile, tauri::mobile\_entry\_point)\]  
pub fn run() {  
    tauri::Builder::default()  
        // 여러 커맨드 등록 시 매크로 내부에 콤마로 나열  
        .invoke\_handler(tauri::generate\_handler\!\[  
            system\_commands::analyze\_system\_logs  
        \])  
        .run(tauri::generate\_context\!())  
        .expect("Tauri 애플리케이션 초기화 실패");  
}

### **3.3. thiserror를 활용한 구조화된 에러 핸들링 메커니즘**

복잡한 비즈니스 로직을 다루는 프로덕션 레벨의 백엔드에서는 단순한 문자열(String) 반환만으로는 프론트엔드 단에서의 예외 처리를 정밀하게 제어할 수 없다. Tauri 아키텍처에서 커맨드가 반환하는 Result\<T, E\> 타입의 Ok 값과 Err 값은 프론트엔드로 안전하게 전송되기 위해 반드시 직렬화를 지원하는 serde::Serialize 트레이트를 구현해야 한다32.  
그러나 Rust의 기본 std::io::Error나 기타 외부 크레이트의 에러 타입들은 구조체 내부에 포인터나 OS 특화 자원을 포함하고 있어 기본적으로 Serialize 트레이트를 지원하지 않는다32. 이러한 트레이트 경계를 안전하게 우회하기 위한 표준 아키텍처는 thiserror 크레이트를 활용하여 애플리케이션 고유의 에러 열거형(Enum)을 추상화하고, 해당 열거형에 대해 수동으로 직렬화 로직을 구현하는 것이다32.

Rust  
// src-tauri/src/error.rs  
use serde::{Serialize, Serializer};  
use thiserror::Error;

// 도메인 종속적인 커스텀 에러 열거형 정의  
\#\[derive(Debug, Error)\]  
pub enum CommandError {  
    \#\[error("System IO Error: {0}")\]  
    Io(\#\[from\] std::io::Error),  
      
    \#\[error("Validation Error: {0}")\]  
    Validation(String),  
      
    \#\[error("Database Execution Error: {0}")\]  
    Database(String),  
}

// IPC를 통해 JavaScript Promise의 catch 영역으로 전달하기 위한 수동 직렬화  
impl Serialize for CommandError {  
    fn serialize\<S\>(&self, serializer: S) \-\> std::result::Result\<S::Ok, S::Error\>  
    where  
        S: Serializer,  
    {  
        // 에러를 설명 문자열로 변환하여 JS로 전송  
        serializer.serialize\_str(&self.to\_string())  
    }  
}

이 패턴을 적용하면 Rust 백엔드 코드 전반에서 거추장스러운 패턴 매칭 없이 ? 연산자를 활용하여 에러를 상위로 전파할 수 있으며, 코드가 극적으로 간결해진다32.

Rust  
\#\[tauri::command\]  
pub async fn read\_secure\_config(token: String) \-\> Result\<String, CommandError\> {  
    if token.is\_empty() {  
        return Err(CommandError::Validation("Access token is strictly required".into()));  
    }  
    // ? 연산자에 의해 std::io::Error가 자동으로 CommandError::Io로 변환 및 직렬화됨  
    let data \= std::fs::read\_to\_string("/secure/config.json")?;  
    Ok(data)  
}

### **3.4. 프론트엔드 모듈에서의 비동기 호출 (Invoke) 구현**

Tauri 2.0에서 프론트엔드 API는 명확한 네임스페이스 분리를 거쳤으며, IPC 통신을 담당하는 코어 모듈은 @tauri-apps/api/core로 편입되었다32. invoke 함수는 네이티브 브릿지를 통해 백엔드 커맨드를 비동기로 실행하고 자바스크립트 프로미스(Promise)를 반환한다32. 반환 타입의 명확성을 위해 제네릭을 지정하고, Rust에서 발생한 Err 응답은 프로미스의 catch 블록으로 떨어지므로 try-catch 구문을 통해 체계적으로 분기 처리한다32.

TypeScript  
import { invoke } from '@tauri-apps/api/core';

async function performSystemAnalysis() {  
  try {  
    // Rust의 snake\_case 매개변수에 대응하는 camelCase 페이로드 전달  
    const response \= await invoke\<string\>('analyze\_system\_logs', {  
      targetPath: '/var/log/syslog',  
      maxDepth: 5  
    });  
      
    console.log('Analysis Result:', response);  
  } catch (error) {  
    // Rust CommandError에서 직렬화된 문자열 에러 메시지 캡처  
    console.error('System analysis failed with exception:', error);  
  }  
}

## **4\. 양방향 이벤트 통신(Events)과 대용량 데이터 스트리밍(Channels)**

클라이언트가 요청을 시작하는 커맨드(invoke) 구조와는 별개로, 백엔드 서버에서 장기 실행 중인 프로세스의 상태 변화를 알리거나 시스템 레벨의 이벤트를 프론트엔드에 실시간 푸시(Push)하기 위해서는 이벤트 기반 아키텍처가 필요하다41. Tauri 2.0은 가벼운 전역 알림을 위한 Event 시스템과, 고성능 대용량 데이터 스트리밍을 위한 Channel 시스템이라는 두 가지 뚜렷한 통신 파이프라인을 지원한다32.

### **4.1. 백엔드에서의 이벤트 발행 (Emit)과 보안 필터링**

Rust 백엔드에서 프론트엔드로 이벤트를 발행할 때는 AppHandle이나 WebviewWindow가 구현하는 Emitter 트레이트의 메서드를 사용한다41. 이벤트를 수신하는 페이로드 역시 serde::Serialize를 구현해야 하며, 프론트엔드의 접근성을 높이기 위해 \#\[serde(rename\_all \= "camelCase")\] 매크로를 함께 선언하여 JSON 키 형식을 일치시킨다35.

Rust  
use tauri::{AppHandle, Emitter};  
use serde::Serialize;  
use std::time::Duration;  
use tokio::time::sleep;

\#\[derive(Clone, Serialize)\]  
\#\[serde(rename\_all \= "camelCase")\]  
struct SyncProgressPayload {  
    sync\_id: String,  
    processed\_items: usize,  
    total\_items: usize,  
}

\#\[tauri::command\]  
pub async fn start\_background\_sync(app: AppHandle, sync\_id: String) \-\> Result\<(), String\> {  
    // 메인 스레드 차단을 방지하기 위한 별도의 Tokio 작업 스레드 생성  
    tauri::async\_runtime::spawn(async move {  
        let total \= 500;  
        for i in 1..=total {  
            sleep(Duration::from\_millis(20)).await;  
              
            let payload \= SyncProgressPayload {  
                sync\_id: sync\_id.clone(),  
                processed\_items: i,  
                total\_items: total,  
            };  
              
            // 1\. 전체 창을 대상으로 글로벌 이벤트 브로드캐스트  
            let \_ \= app.emit("sync-progress", \&payload);  
              
            // 2\. 특정 창(예: "dashboard" 창)으로만 이벤트를 제한하여 보안성과 성능 향상  
            // let \_ \= app.emit\_to("dashboard", "sync-progress", \&payload);  
        }  
    });  
      
    Ok(())  
}

emit은 애플리케이션의 모든 웹뷰 리스너에게 데이터를 직렬화하여 전달하지만, emit\_to나 emit\_filter를 사용하면 메모리 누출을 억제하고 데이터가 특정 컨텍스트(웹뷰) 외부에 노출되는 것을 보안 레벨에서 통제할 수 있다41.

### **4.2. 프론트엔드에서의 이벤트 구독 최적화 및 언마운트 해제 (Unlisten)**

프론트엔드에서는 @tauri-apps/api/event 모듈의 listen 함수를 통해 이벤트를 수신한다41. Tauri v1에서 v2로 넘어오면서 명칭이 변경된 getCurrentWebviewWindow() 함수를 활용하여 현재 창에 바인딩된 이벤트만 선별적으로 수신하는 기법도 널리 활용된다41.  
React 생명주기에서 Tauri 이벤트를 구독할 때 가장 경계해야 할 안티 패턴은 클린업 함수(Unlisten)를 잘못된 방식으로 처리하여 발생하는 좀비 리스너(Zombie Listeners) 문제다41. Tauri의 listen API는 구독 해제 함수(Unlisten function)를 즉각 반환하는 것이 아니라, IPC 브릿지를 거쳐 구독이 확정된 후 반환되는 **프로미스(Promise)로 감싸진 클린업 함수를 반환**한다41. 이를 동기식으로 간주하여 잘못 호출할 경우 구독 해제가 불가능해져, 컴포넌트 마운트 및 언마운트가 반복됨에 따라 이벤트 수신이 기하급수적으로 중첩되는 치명적 메모리 누수가 발생한다41.  
**메모리 누수를 완벽히 차단하는 안전한 React 이벤트 구독 패턴:**

TypeScript  
import { useEffect, useState } from 'react';  
import { listen } from '@tauri-apps/api/event';

interface SyncProgressPayload {  
  syncId: string;  
  processedItems: number;  
  totalItems: number;  
}

export function SyncMonitor({ syncId }: { syncId: string }) {  
  const \[progress, setProgress\] \= useState(0);

  useEffect(() \=\> {  
    // listen()은 '구독 해제 함수'를 감싼 Promise를 반환한다.  
    const unlistenPromise \= listen\<SyncProgressPayload\>('sync-progress', (event) \=\> {  
      // 컴포넌트 렌더링 범위에 맞는 이벤트인지 식별  
      if (event.payload.syncId \=== syncId) {  
        const percent \= Math.round(  
          (event.payload.processedItems / event.payload.totalItems) \* 100  
        );  
        setProgress(percent);  
      }  
    });

    // 컴포넌트 소멸(Unmount) 시점의 클린업 함수  
    return () \=\> {  
      // Promise가 Resolve될 때까지 대기한 후, 내부의 unlisten 콜백을 실행한다.  
      unlistenPromise.then((unlistenFn) \=\> unlistenFn());  
    };  
  }, \[syncId\]);

  return (  
    \<div className="monitor-container"\>  
      \<h3\>Background Sync Progress\</h3\>  
      \<div className="progress-bar-bg"\>  
        \<div   
          className="progress-bar-fill"   
          style={{ width: \`\${progress}%\` }}  
        /\>  
      \</div\>  
      \<p\>{progress}% Completed\</p\>  
    \</div\>  
  );  
}

### **4.3. 병목 해소: 채널(Channels)을 활용한 고속 스트리밍 데이터 전송**

Tauri의 이벤트 시스템은 간헐적인 상태 업데이트에는 완벽하게 작동하지만, JSON 문자열 직렬화 과정을 거치고 브라우저의 V8 엔진이 자바스크립트 코드를 동적으로 평가(Evaluate)하는 방식이기 때문에 태생적인 오버헤드가 발생한다41. 초당 수천 개의 이벤트가 발생하는 대용량 로그 스트리밍, AI 토큰 생성, 바이너리 다운로드와 같은 상황에서 이벤트 시스템을 사용하면 렌더링 지연과 순서 꼬임(Out-of-order) 현상이 불가피하다41.  
이를 근본적으로 타개하기 위해 Tauri 2.0에서 새롭게 도입된 기능이 **채널(Channel) API**다. 채널은 순서를 완벽히 보장(Ordered)하며 데이터 전송의 오버헤드를 극단적으로 낮춘 스트리밍 전용 터널이다32.

| 통신 계층 아키텍처 | 주요 활용 목적 및 특징 | 데이터 구조 및 처리 한계 | 런타임 성능 및 순서 보장 |
| :---- | :---- | :---- | :---- |
| **Events (emit)** | 시스템 전역의 가벼운 알림, 비동기 작업의 완료 상태 통지41 | JSON 직렬화에 의존, 데이터 크기에 비례하여 오버헤드 급증41 | 고부하 환경에서 전송 순서가 보장되지 않을 수 있음41 |
| **Channels** | 실시간 파일 입출력, AI 토큰 스트리밍, 바이너리(ArrayBuffer) 실시간 전송32 | Uint8Array 등 이진 데이터를 메모리 복사 최소화로 전송 가능40 | 극한의 성능 처리, 메시지 도착 순서 완벽 보장41 |

채널 통신을 구현하기 위해서는 프론트엔드 측에서 채널 객체를 생성한 후 이를 커맨드의 인자로 넘겨주어 파이프라인의 양 끝단을 연결하는 방식을 취한다.  
**Rust 백엔드 (채널 송신부):**

Rust  
use tauri::ipc::Channel;

// 커맨드 인자로 Channel\<T\> 타입을 받아 프론트엔드와의 다이렉트 통신 파이프 확립  
\#\[tauri::command\]  
pub async fn stream\_binary\_data(on\_chunk: Channel\<Vec\<u8\>\>) \-\> Result\<(), String\> {  
    // 4096바이트 단위의 고속 스트리밍 시뮬레이션  
    let chunks \= vec\!\[vec\!\[1, 2, 3\], vec\!\[4, 5, 6\], vec\!\[7, 8, 9\]\];  
      
    for chunk in chunks {  
        // 이벤트를 우회하여 브라우저에 바이너리 덩어리를 직접 푸시  
        if let Err(e) \= on\_chunk.send(chunk) {  
            return Err(format\!("Channel broken: {}", e));  
        }  
    }  
    Ok(())  
}

**React 프론트엔드 (채널 수신부):**

TypeScript  
import { invoke, Channel } from '@tauri-apps/api/core';

async function startBinaryStream() {  
  // 제네릭을 통해 Rust에서 송신할 데이터 타입(예: Uint8Array 또는 배열) 지정  
  const onChunkChannel \= new Channel\<number\[\]\>();  
    
  // 데이터 수신 리스너 등록  
  onChunkChannel.onmessage \= (chunkData) \=\> {  
    console.log('Received binary chunk:', chunkData);  
    // 버퍼 처리 로직 등 고성능 스트리밍 데이터 조작  
  };

  try {  
    // Rust 커맨드에 확립된 채널 인스턴스를 전달하여 스트리밍 파이프 개통  
    await invoke('stream\_binary\_data', {   
      onChunk: onChunkChannel   
    });  
    console.log('Stream transmission completed.');  
  } catch (err) {  
    console.error('Stream failure:', err);  
  }  
}

이와 같은 채널 모델은 거대한 데이터를 한 번에 보내기 위해 메모리를 할당하는 대신 점진적 전송을 가능하게 하여, 26MB 이하의 극도로 낮은 메모리 점유율을 자랑하는 Tauri의 장점을 한층 더 배가시킨다3.

## **5\. 결론 및 종합**

모던 크로스 플랫폼 애플리케이션의 발전은 프론트엔드 상태의 극단적인 경량화와 시스템 백엔드의 고성능 네이티브 제어라는 양립하기 어려운 목표를 완벽히 융합하는 방향으로 진화하고 있다. React 19와 상태 관리 라이브러리 Zustand의 조합은 클라이언트 사이드의 성능을 한계까지 끌어올리는 강력한 패러다임이다. 특히 Immer를 통한 불변성 보장, 슬라이스(Slice) 패턴을 활용한 도메인 분리, 그리고 useShallow를 활용한 객체 참조 동등성 방어 전략은 거대한 리액트 트리의 불필요한 리렌더링을 완전히 근절하는 최고의 접근법으로 분석된다.  
아울러 백엔드와 클라이언트의 통신 브릿지로 채택된 Tauri 2.0은 Electron이 남긴 거대한 메모리 발자국과 패키지 용량의 한계를 Rust의 영(Zero) 비용 추상화로 해결한 모범적 아키텍처다. 개발자는 철저히 차단된 core:default Capabilities 기반 하에 보안 영역을 점진적으로 개방해야 하며, thiserror를 적용한 구조화된 직렬화 에러 핸들링을 통해 프론트엔드의 비동기 커맨드(invoke)에 강력한 타입 안정성과 예외 처리 기능을 제공해야 한다.  
마지막으로, IPC 경계를 넘나드는 데이터 전달 관점에서 시스템 알림이나 진행률 표시 등 일반적인 상황에서는 메모리 누수 방지가 적용된 이벤트(Event) 구독 모델을 활용하고, AI 토큰 생성이나 파일 처리와 같은 초고속, 순차적 데이터 무결성이 요구되는 상황에서는 채널(Channel) 기반의 바이너리 스트리밍 파이프라인을 융합하는 이원화된 설계가 필수적이다. 이러한 고차원적 아키텍처의 채택은 최종적으로 차세대 데스크톱 및 웹 애플리케이션에 타협 없는 성능과 최상의 사용자 경험(UX)을 동시에 선사하는 견고한 토대가 될 것이다.

#### **참고 자료**

> 1. Tauri — UI for your rust program \- Medium, [https\://medium.com/coderhack-com/tauri-f5fd95921306](https://medium.com/coderhack-com/tauri-f5fd95921306)  
> 2. Tauri vs Electron Comparison: Choose the Right Framework \- Medium, [https\://medium.com/@raftlabs/tauri-vs-electron-a-practical-guide-to-picking-the-right-framework-5df80e360f26](https://medium.com/@raftlabs/tauri-vs-electron-a-practical-guide-to-picking-the-right-framework-5df80e360f26)  
> 3. Performance Comparison of Tauri and Electron Frameworks in, [https\://jurnal.kdi.or.id/index.php/bt/article/download/3733/1998/24196](https://jurnal.kdi.or.id/index.php/bt/article/download/3733/1998/24196)  
> 4. Webview Versions \- Tauri, [https\://v2.tauri.app/reference/webview-versions/](https://v2.tauri.app/reference/webview-versions/)  
> 5. Tauri vs. Electron Benchmark: \~58% Less Memory, \~96% Smaller, [https\://www\.reddit.com/r/programming/comments/1jwjw7b/tauri\_vs\_electron\_benchmark\_58\_less\_memory\_96/](https://www.reddit.com/r/programming/comments/1jwjw7b/tauri_vs_electron_benchmark_58_less_memory_96/)  
> 6. 리액트 19 신규 기능 및 개선 사항 \- Tech Blog, [https\://dabletech.oopy.io/34da9d23-9593-46e7-892c-a6dd652b7306](https://dabletech.oopy.io/34da9d23-9593-46e7-892c-a6dd652b7306)  
> 7. Will React Compiler (from React 19\) affect Zustand in any way? \#2562, [https\://github.com/pmndrs/zustand/discussions/2562](https://github.com/pmndrs/zustand/discussions/2562)  
> 8. Zustand: React State Management Without Providers or Reducers, [https\://recca0120.github.io/en/2026/03/13/zustand-react-state-management/](https://recca0120.github.io/en/2026/03/13/zustand-react-state-management/)  
> 9. Zustand v5 2026: React State Complete Mastery Guide, [https\://reepank-blogs.vercel.app/blogs/zustand-v5-2026-react-state-complete-mastery-guide-](https://reepank-blogs.vercel.app/blogs/zustand-v5-2026-react-state-complete-mastery-guide-)  
> 10. \[React\] Zustand 라이브러리: 상태(state) 관리 라이브러리, [https\://tensdiary.tistory.com/entry/React-Zustand-%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC-React-%EC%83%81%ED%83%9Cstate-%EA%B4%80%EB%A6%AC-%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC](https://tensdiary.tistory.com/entry/React-Zustand-%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC-React-%EC%83%81%ED%83%9Cstate-%EA%B4%80%EB%A6%AC-%EB%9D%BC%EC%9D%B4%EB%B8%8C%EB%9F%AC%EB%A6%AC)  
> 11. Zustand Docs, [https\://zustand.docs.pmnd.rs/](https://zustand.docs.pmnd.rs/)  
> 12. Fixing React hydration errors when using Zustand persist ... \- Medium, [https\://medium.com/@judemiracle/fixing-react-hydration-errors-when-using-zustand-persist-with-usesyncexternalstore-b6d7a40f2623](https://medium.com/@judemiracle/fixing-react-hydration-errors-when-using-zustand-persist-with-usesyncexternalstore-b6d7a40f2623)  
> 13. Taking Zustand Further: Persist, Immer, and DevTools Explained, [https\://medium.com/@skyshots/taking-zustand-further-persist-immer-and-devtools-explained-ab4493083ca1](https://medium.com/@skyshots/taking-zustand-further-persist-immer-and-devtools-explained-ab4493083ca1)  
> 14. Building Robust React Apps with Zustand and Immer \- Zwit, [https\://zwit.link/posts/20250301173228-building-robust-react-apps-with-zustand-and-immer/](https://zwit.link/posts/20250301173228-building-robust-react-apps-with-zustand-and-immer/)  
> 15. Advanced TypeScript Guide \- Zustand Docs, [https\://zustand.docs.pmnd.rs/learn/guides/advanced-typescript.html](https://zustand.docs.pmnd.rs/learn/guides/advanced-typescript.html)  
> 16. Beginner TypeScript Guide \- Zustand Docs, [https\://zustand.docs.pmnd.rs/learn/guides/beginner-typescript.html](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript.html)  
> 17. Working with Zustand \- TkDodo's blog, [https\://tkdodo.eu/blog/working-with-zustand](https://tkdodo.eu/blog/working-with-zustand)  
> 18. \[React.js \+ TypeScript\] Zustand로 상태관리하기 (+ persist 미들웨어), [https\://whatdoyumin.tistory.com/38](https://whatdoyumin.tistory.com/38)  
> 19. Scaling Stores with the Slice Pattern \- grasp.study, [https\://paths.grasp.study/modules/e9bf1f82-7ffe-44a3-8bca-da04c83c4cf7/lessons/7b032ebf-e174-4018-9a3c-d5f228692fac](https://paths.grasp.study/modules/e9bf1f82-7ffe-44a3-8bca-da04c83c4cf7/lessons/7b032ebf-e174-4018-9a3c-d5f228692fac)  
> 20. Typescript \+ Immer \+ Slice pattern \#1796 \- pmndrs zustand \- GitHub, [https\://github.com/pmndrs/zustand/discussions/1796](https://github.com/pmndrs/zustand/discussions/1796)  
> 21. Best practice for Typescript \+ Slice Pattern \+ Immer \+ Devtools \#2070, [https\://github.com/pmndrs/zustand/discussions/2070](https://github.com/pmndrs/zustand/discussions/2070)  
> 22. Zustand useShallow 사용하여 무한루프 해결하기 \- velog, [https\://velog.io/@duddlfkd02/Zustand-useShallow-%EC%82%AC%EC%9A%A9%ED%95%98%EC%97%AC-%EB%AC%B4%ED%95%9C%EB%A3%A8%ED%94%84-%ED%95%B4%EA%B2%B0%ED%95%98%EA%B8%B0](https://velog.io/@duddlfkd02/Zustand-useShallow-%EC%82%AC%EC%9A%A9%ED%95%98%EC%97%AC-%EB%AC%B4%ED%95%9C%EB%A3%A8%ED%94%84-%ED%95%B4%EA%B2%B0%ED%95%98%EA%B8%B0)  
> 23. Zustand에서 useShallow 제대로 쓰기 — 원시값 중심 설계의 이유, [https\://uminoh.tistory.com/72](https://uminoh.tistory.com/72)  
> 24. Prevent rerenders with useShallow \- Zustand Docs, [https\://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow.html](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow.html)  
> 25. Avoid performance issues when using Zustand \- DEV Community, [https\://dev.to/devgrana/avoid-performance-issues-when-using-zustand-12ee](https://dev.to/devgrana/avoid-performance-issues-when-using-zustand-12ee)  
> 26. Persisting store data \- Zustand Docs, [https\://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data.html](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data.html)  
> 27. \[Next.js\] Zustand persist 사용하기 (feat. Hydration 에러 해결), [https\://jjang-j.tistory.com/124](https://jjang-j.tistory.com/124)  
> 28. Develop \- Tauri, [https\://v2.tauri.app/develop/](https://v2.tauri.app/develop/)  
> 29. Window Customization \- Tauri, [https\://v2.tauri.app/learn/window-customization/](https://v2.tauri.app/learn/window-customization/)  
> 30. Building Cross-Platform Desktop Apps with Tauri 2.0 \- Reintech, [https\://reintech.io/blog/building-cross-platform-desktop-apps-tauri-2](https://reintech.io/blog/building-cross-platform-desktop-apps-tauri-2)  
> 31. Permissions and Capabilities | zudo-tauri-wisdom, [https\://zudo-tauri-wisdom.takazudomodular.com/docs/frontend/capabilities](https://zudo-tauri-wisdom.takazudomodular.com/docs/frontend/capabilities)  
> 32. Calling Rust from the Frontend \- Tauri, [https\://v2.tauri.app/develop/calling-rust/](https://v2.tauri.app/develop/calling-rust/)  
> 33. Core Permissions \- Tauri, [https\://v2.tauri.app/reference/acl/core-permissions/](https://v2.tauri.app/reference/acl/core-permissions/)  
> 34. Calling Rust from the frontend | Tauri v1, [https\://tauri.app/v1/guides/features/command](https://tauri.app/v1/guides/features/command)  
> 35. Tauri-typegen \- Lib.rs, [https\://lib.rs/crates/tauri-typegen](https://lib.rs/crates/tauri-typegen)  
> 36. Calling Rust from the frontend | Tauri v1, [https\://tauri.app/ko/v1/guides/features/command/](https://tauri.app/ko/v1/guides/features/command/)  
> 37. async tauri command returning dynamic error, does not implement, [https\://stackoverflow.com/questions/79520656/async-tauri-command-returning-dynamic-error-does-not-implement-necessary-traits](https://stackoverflow.com/questions/79520656/async-tauri-command-returning-dynamic-error-does-not-implement-necessary-traits)  
> 38. Calling Rust from the frontend | Tauri v1, [https\://tauri.app/ko/v1/guides/features/command](https://tauri.app/ko/v1/guides/features/command)  
> 39. HTML, CSS, JavaScript, and Rust for Beginners \- Tauri, [https\://tauri.app/assets/learn/community/HTML\_CSS\_JavaScript\_and\_Rust\_for\_Beginners\_A\_Guide\_to\_Application\_Development\_with\_Tauri.pdf](https://tauri.app/assets/learn/community/HTML_CSS_JavaScript_and_Rust_for_Beginners_A_Guide_to_Application_Development_with_Tauri.pdf)  
> 40. core \- Tauri, [https\://v2.tauri.app/reference/javascript/api/namespacecore/](https://v2.tauri.app/reference/javascript/api/namespacecore/)  
> 41. Calling the Frontend from Rust | Tauri, [https\://v2.tauri.app/develop/calling-frontend/](https://v2.tauri.app/develop/calling-frontend/)  
> 42. webviewWindow \- Tauri, [https\://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)  
> 43. tauri-apps/api@2.0.0-beta.15, [https\://v2.tauri.app/release/@tauri-apps/api/v2.0.0-beta.15/](https://v2.tauri.app/release/@tauri-apps/api/v2.0.0-beta.15/)  
> 44. How I Built a Desktop AI App with Tauri v2 \+ React 19 in 2026, [https\://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47](https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47)  
> 45. \[feat\] Additionally support pushing array buffers with the event system., [https\://github.com/tauri-apps/tauri/issues/13405](https://github.com/tauri-apps/tauri/issues/13405)