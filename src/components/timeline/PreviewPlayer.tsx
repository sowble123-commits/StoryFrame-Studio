import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStoryFrameStore } from '@/store';
import { playbackClock } from '@/lib/playbackClock';
import type { Cut } from '@/types/project';
import { getAssetUrl } from '@/lib/utils';

interface LayoutEntry {
  cut: Cut;
  start: number;
  end: number;
}

/** 오름차순 구간에서 t를 포함하는 엔트리 (이진 탐색) */
function findEntry(layout: readonly LayoutEntry[], t: number): LayoutEntry | undefined {
  let lo = 0;
  let hi = layout.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = layout[mid];
    if (t < e.start) hi = mid - 1;
    else if (t >= e.end) lo = mid + 1;
    else return e;
  }
  return undefined;
}

const DRIFT_TOLERANCE_SEC = 0.15;

/**
 * PreviewPlayer
 *  - currentTime을 구독하지 않는다. 재생 중에는 자체 RAF 루프가 playbackClock을 읽어
 *    <video>를 직접 동기화(드리프트 보정, play/pause)한다.
 *  - React 리렌더는 "활성 컷이 바뀔 때"에만 발생 (video src 교체).
 */
export function PreviewPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cuts = useStoryFrameStore((s) => s.project?.cuts);
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);
  const [activeCutId, setActiveCutId] = useState<string | null>(null);

  const layout = useMemo<LayoutEntry[]>(() => {
    let cursor = 0;
    return (cuts ?? []).map((cut) => {
      const start = cursor;
      cursor += cut.timeline.effectiveDurationSec;
      return { cut, start, end: cursor };
    });
  }, [cuts]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const activeIdRef = useRef<string | null>(null);

  const activeCut = useMemo(
    () => layout.find((e) => e.cut.id === activeCutId)?.cut,
    [layout, activeCutId],
  );
  const activeVersion = activeCut?.video.versions?.find((v) => v.isSelected) ?? activeCut?.video.versions?.[0];
  const videoSource = useMemo(
    () => getAssetUrl(projectPath, activeVersion?.filePath),
    [projectPath, activeVersion?.filePath],
  );

  /** 마스터 클락 시간 t에 <video>를 맞춘다. DOM 직접 조작. */
  const sync = useCallback((t: number, force = false) => {
    const entry = findEntry(layoutRef.current, t);
    const id = entry?.cut.id ?? null;
    if (id !== activeIdRef.current) {
      activeIdRef.current = id;
      setActiveCutId(id); // 컷 경계를 넘을 때만 리렌더
    }
    const v = videoRef.current;
    if (!entry || !v) return;

    const local = t - entry.start + entry.cut.timeline.inPointSec;
    const ready = v.readyState >= 1;
    if (ready && (force || Math.abs(v.currentTime - local) > DRIFT_TOLERANCE_SEC)) {
      v.currentTime = local;
    }
    const shouldPlay = playbackClock.isPlaying && ready && local < entry.cut.timeline.outPointSec;
    if (shouldPlay && v.paused) v.play().catch(() => {});
    else if (!shouldPlay && !v.paused) v.pause();
  }, []);

  // 재생 루프 + 정지 상태 seek 반영 (store.subscribe: 리렌더 없음)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      sync(playbackClock.time);
      raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    let prevPlaying = useStoryFrameStore.getState().isPlaying;
    let prevTime = useStoryFrameStore.getState().currentTime;

    const apply = () => {
      const s = useStoryFrameStore.getState();
      stopLoop();
      if (s.isPlaying) raf = requestAnimationFrame(tick);
      else sync(s.currentTime, true);
    };
    apply();

    const unsub = useStoryFrameStore.subscribe((s) => {
      if (s.isPlaying !== prevPlaying) {
        prevPlaying = s.isPlaying;
        prevTime = s.currentTime;
        apply();
      } else if (!s.isPlaying && s.currentTime !== prevTime) {
        prevTime = s.currentTime;
        sync(s.currentTime, true);
      }
    });

    return () => {
      stopLoop();
      unsub();
      videoRef.current?.pause();
    };
  }, [sync]);

  // 컷 구성/버전/트림 변경 시 즉시 재동기화
  useEffect(() => {
    const s = useStoryFrameStore.getState();
    sync(s.isPlaying ? playbackClock.time : s.currentTime, true);
  }, [layout, videoSource, sync]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl relative">
      <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-black/60 rounded text-xs font-mono text-slate-300 backdrop-blur">
        미리보기 플레이어
      </div>
      <div className="flex-1 bg-black relative flex items-center justify-center">
        {videoSource ? (
          <video
            ref={videoRef}
            src={videoSource}
            className="w-full h-full object-contain"
            muted // 오디오는 마스터 오디오 엘리먼트가 담당
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              const s = useStoryFrameStore.getState();
              sync(s.isPlaying ? playbackClock.time : s.currentTime, true);
            }}
          />
        ) : (
          <div className="text-slate-600 text-sm">비디오 소스 없음</div>
        )}
      </div>
    </div>
  );
}
