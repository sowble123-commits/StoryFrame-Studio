/**
 * playbackClock — 리액트 외부의 단일 마스터 클락(싱글톤)
 *
 * 재생 중 currentTime은 초당 60회 변하므로 React state/Zustand에 두면
 * 트리 전체가 리렌더된다. 대신 이 모듈 객체에 쓰고, 소비자(Playhead, PreviewPlayer,
 * 단축키)는 자신의 RAF 루프 또는 이벤트 시점에 직접 읽는다.
 *
 * Zustand `currentTime`은 "정지 상태의 위치 / seek 요청"의 소스로만 사용된다.
 */

export const playbackClock = {
  /** 현재 재생 위치(초). 오디오 엘리먼트가 마스터. */
  time: 0,
  isPlaying: false,
  pixelsPerSecond: 100,
};

type Seeker = (time: number) => void;
let seeker: Seeker | null = null;

/** usePlaybackEngine이 등록: 오디오 엘리먼트에 실제 seek을 수행 */
export function registerSeeker(fn: Seeker | null) {
  seeker = fn;
}

/** 재생 중/정지 중 모두 안전한 seek. 단축키·클릭 등 외부에서 사용. */
export function seekTo(time: number) {
  const t = Math.max(0, time);
  playbackClock.time = t;
  seeker?.(t);
}
