/**
 * usePlaybackEngine — 오디오 마스터 클락 + Playhead/Timecode 직접 DOM 갱신
 *
 * • 재생 중 Zustand/React state 쓰기 없음. RAF에서 playbackClock과 DOM만 갱신.
 * • Zustand에는 pause / ended / seek 시점에만 시간을 커밋한다.
 * • seek 요청 구독은 store.subscribe → Timeline 리렌더 없음.
 */

import { useEffect } from 'react';
import { useStoryFrameStore } from '@/store';
import { playbackClock, registerSeeker } from '@/lib/playbackClock';

interface Options {
  playheadRef: React.RefObject<HTMLDivElement | null>;
  timecodeRef: React.RefObject<HTMLSpanElement | null>;
  pixelsPerSecond: number;
}

function paint(
  t: number,
  pps: number,
  playhead: HTMLDivElement | null,
  timecode: HTMLSpanElement | null,
) {
  if (playhead) playhead.style.transform = `translate3d(${t * pps}px,0,0)`;
  if (timecode) timecode.textContent = `${t.toFixed(2)}s`;
}

export function usePlaybackEngine({ playheadRef, timecodeRef, pixelsPerSecond }: Options) {
  const musicPath = useStoryFrameStore((s) => s.project?.music?.filePath);
  const isPlaying = useStoryFrameStore((s) => s.isPlaying);

  // pps 변경: 싱글톤 갱신 + 정지 상태 playhead 위치 보정
  useEffect(() => {
    playbackClock.pixelsPerSecond = pixelsPerSecond;
    paint(playbackClock.time, pixelsPerSecond, playheadRef.current, timecodeRef.current);
  }, [pixelsPerSecond, playheadRef, timecodeRef]);

  // 오디오 엘리먼트 생성 + 재생 루프 (마운트 1회)
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    let raf = 0;

    const tick = () => {
      playbackClock.time = audio.currentTime;
      paint(audio.currentTime, playbackClock.pixelsPerSecond, playheadRef.current, timecodeRef.current);
      raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPlay = () => {
      playbackClock.isPlaying = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      playbackClock.isPlaying = false;
      stopLoop();
      playbackClock.time = audio.currentTime;
      paint(audio.currentTime, playbackClock.pixelsPerSecond, playheadRef.current, timecodeRef.current);
      // 정지 시점에만 스토어 커밋
      useStoryFrameStore.getState().setCurrentTime(audio.currentTime);
    };
    const onEnded = () => {
      useStoryFrameStore.getState().setIsPlaying(false);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    // seek: 재생/정지 상관없이 오디오와 DOM에 즉시 반영
    registerSeeker((t) => {
      audio.currentTime = t;
      paint(t, playbackClock.pixelsPerSecond, playheadRef.current, timecodeRef.current);
    });

    // 스토어의 currentTime 변경(클릭 seek, 정지 커밋) 구독 — React 리렌더 없음
    let lastStoreTime = useStoryFrameStore.getState().currentTime;
    const unsub = useStoryFrameStore.subscribe((state) => {
      if (state.currentTime === lastStoreTime) return;
      lastStoreTime = state.currentTime;
      // 오디오가 이미 해당 위치(pause 커밋)이면 중복 seek 생략
      if (Math.abs(audio.currentTime - state.currentTime) > 0.01) {
        playbackClock.time = state.currentTime;
        audio.currentTime = state.currentTime;
        paint(state.currentTime, playbackClock.pixelsPerSecond, playheadRef.current, timecodeRef.current);
      }
    });

    // 오디오 인스턴스를 isPlaying 이펙트에서 쓰기 위해 data로 노출
    (playbackClock as unknown as { _audio?: HTMLAudioElement })._audio = audio;

    return () => {
      stopLoop();
      unsub();
      registerSeeker(null);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      delete (playbackClock as unknown as { _audio?: HTMLAudioElement })._audio;
    };
  }, [playheadRef, timecodeRef]);

  // 소스 변경
  useEffect(() => {
    const audio = (playbackClock as unknown as { _audio?: HTMLAudioElement })._audio;
    if (!audio || !musicPath) return;
    audio.src = musicPath;
    audio.load();
  }, [musicPath]);

  // 재생/정지 토글
  useEffect(() => {
    const audio = (playbackClock as unknown as { _audio?: HTMLAudioElement })._audio;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => useStoryFrameStore.getState().setIsPlaying(false));
    } else if (!audio.paused) {
      audio.pause();
    }
  }, [isPlaying]);
}
