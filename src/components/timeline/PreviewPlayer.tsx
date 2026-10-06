import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStoryFrameStore } from '@/store';
import { playbackClock } from '@/lib/playbackClock';
import type { Clip } from '@/types/project';
import { getAssetUrl } from '@/lib/utils';

interface LayoutEntry {
  clip: Clip;
  start: number;
  end: number;
}

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

export function PreviewPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const sequences = useStoryFrameStore((s) => s.project?.sequences);
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);
  const music = useStoryFrameStore((s) => s.project?.music);

  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [activeLyrics, setActiveLyrics] = useState<string | null>(null);

  const layout = useMemo<LayoutEntry[]>(() => {
    let cursor = 0;
    const entries: LayoutEntry[] = [];
    if (!sequences) return entries;
    for (const seq of sequences) {
      for (const clip of seq.clips) {
        const take = clip.takes[0];
        if (!take) continue;
        const start = cursor;
        cursor += take.durationSec;
        entries.push({ clip, start, end: cursor });
      }
    }
    return entries;
  }, [sequences]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const activeIdRef = useRef<string | null>(null);
  const activeLyricsRef = useRef<string | null>(null);
  const sectionsRef = useRef(music?.sections);
  sectionsRef.current = music?.sections;

  const activeClip = useMemo(
    () => layout.find((e) => e.clip.id === activeClipId)?.clip,
    [layout, activeClipId],
  );
  
  const activeTake = activeClip?.takes[0];
  const activeFrame = activeTake?.frames[0];
  const videoVersion = activeTake?.videoVersion;

  const imageSource = useMemo(() => getAssetUrl(projectPath, activeFrame?.F0_reference ?? undefined), [projectPath, activeFrame?.F0_reference]);
  const videoSource = useMemo(() => getAssetUrl(projectPath, videoVersion ?? undefined), [projectPath, videoVersion]);
  const audioSource = useMemo(() => getAssetUrl(projectPath, music?.filePath ?? undefined), [projectPath, music?.filePath]);

  const sync = useCallback((t: number, force = false) => {
    // 1. Audio sync
    const a = audioRef.current;
    if (a) {
      const ready = a.readyState >= 1;
      if (ready && (force || Math.abs(a.currentTime - t) > DRIFT_TOLERANCE_SEC)) {
        a.currentTime = t;
      }
      const shouldPlayAudio = playbackClock.isPlaying;
      if (shouldPlayAudio && a.paused) a.play().catch((e) => console.warn(e));
      else if (!shouldPlayAudio && !a.paused) a.pause();
    }

    // 2. Lyrics sync
    const section = sectionsRef.current?.find((s) => t >= s.startSec && t < s.endSec);
    const lyrics = section?.lyrics ?? null;
    if (lyrics !== activeLyricsRef.current) {
      activeLyricsRef.current = lyrics;
      setActiveLyrics(lyrics);
    }

    // 3. Visual sync
    const entry = findEntry(layoutRef.current, t);
    const id = entry?.clip.id ?? null;
    if (id !== activeIdRef.current) {
      activeIdRef.current = id;
      setActiveClipId(id);
    }

    const v = videoRef.current;
    if (entry && v && entry.clip.takes[0]?.videoVersion) {
      const local = t - entry.start;
      const ready = v.readyState >= 1;
      if (ready && (force || Math.abs(v.currentTime - local) > DRIFT_TOLERANCE_SEC)) {
        v.currentTime = local;
      }
      const shouldPlayVideo = playbackClock.isPlaying && ready && local < entry.clip.takes[0].durationSec;
      if (shouldPlayVideo && v.paused) v.play().catch((e) => console.warn(e));
      else if (!shouldPlayVideo && !v.paused) v.pause();
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const s = useStoryFrameStore.getState();
    sync(s.isPlaying ? playbackClock.time : s.currentTime, true);
  }, [sync]);

  useEffect(() => {
    let rafId = 0;
    let isMounted = true;
    
    // 메모리 릭(Memory Leak) 방지를 위해 마운트 당시의 ref 값을 안전하게 캡처
    const vRef = videoRef.current;
    const aRef = audioRef.current;

    const tick = () => {
      if (!isMounted) return;
      sync(playbackClock.time);
      rafId = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    let prevPlaying = useStoryFrameStore.getState().isPlaying;
    let prevTime = useStoryFrameStore.getState().currentTime;

    const apply = () => {
      const s = useStoryFrameStore.getState();
      stopLoop();
      if (s.isPlaying && isMounted) {
        rafId = requestAnimationFrame(tick);
      } else if (!s.isPlaying && isMounted) {
        sync(s.currentTime, true);
      }
    };
    
    apply();

    const unsub = useStoryFrameStore.subscribe((s) => {
      if (!isMounted) return;
      
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
      isMounted = false;
      stopLoop();
      unsub();
      // 언마운트 시 이미 사라졌을 수도 있는 최신 ref 대신 캡처된 ref를 사용해 깔끔하게 정지
      if (vRef) vRef.pause();
      if (aRef) aRef.pause();
    };
  }, [sync]);

  useEffect(() => {
    const s = useStoryFrameStore.getState();
    sync(s.isPlaying ? playbackClock.time : s.currentTime, true);
  }, [layout, videoSource, audioSource, sync]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl relative">
      <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-black/60 rounded text-xs font-mono text-slate-300 backdrop-blur">
        미리보기 플레이어
      </div>

      {audioSource && (
        <audio
          ref={audioRef}
          src={audioSource}
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          className="hidden"
        />
      )}

      <div className="flex-1 bg-black relative flex items-center justify-center">
        {videoSource ? (
          <video
            ref={videoRef}
            src={videoSource}
            className="w-full h-full object-contain"
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
          />
        ) : imageSource ? (
          <img
            src={imageSource}
            className="w-full h-full object-contain"
            alt="Reference"
          />
        ) : (
          <div className="text-slate-600 text-sm">비디오/이미지 소스 없음</div>
        )}

        {activeLyrics && (
          <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
            <span className="bg-black/60 text-white text-xl md:text-2xl font-semibold px-4 py-1 rounded backdrop-blur">
              {activeLyrics}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// verified P1-03

// verified P1-03

// verified P1-03
