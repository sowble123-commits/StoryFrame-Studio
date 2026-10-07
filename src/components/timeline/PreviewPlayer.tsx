import { SafeImage } from '@/components/SafeImage';
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

const DIFF_TOKEN_SPLITTER = /(\s+)/;
const EDGE_PUNCTUATION = /^[.,!?;:(){}[\]<>…—–-]+|[.,!?;:(){}[\]<>…—–-]+$/g;

interface PromptDiffToken {
  value: string;
  isChanged: boolean;
}

function normalizeDiffWord(value: string): string {
  return value.trim().replace(EDGE_PUNCTUATION, '').toLocaleLowerCase();
}

function createPromptDiff(original: string | undefined, current: string | undefined): PromptDiffToken[] {
  if (!current) return [];
  const tokens = current.split(DIFF_TOKEN_SPLITTER);
  if (!original || original === current) {
    return tokens.map((value) => ({ value, isChanged: false }));
  }
  const originalWords = new Set(
    original.split(DIFF_TOKEN_SPLITTER).map(normalizeDiffWord).filter(Boolean),
  );
  return tokens.map((value) => {
    const normalized = normalizeDiffWord(value);
    return {
      value,
      isChanged: normalized.length > 0 && !originalWords.has(normalized),
    };
  });
}

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

  const promptDiff = useMemo(
    () => createPromptDiff(activeTake?.story.description, activeFrame?.prompt),
    [activeFrame?.prompt, activeTake?.story.description],
  );

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
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border-subtle bg-canvas shadow-xl shadow-black/30">
      <div className="absolute top-3 left-3 z-10 rounded-md border border-white/10 bg-surface-0/80 px-2 py-1 font-mono text-xs text-secondary backdrop-blur">
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
          <SafeImage
            src={imageSource}
            className="w-full h-full object-contain"
            alt="Reference"
          />
        ) : (
          <div className="text-slate-600 text-sm flex flex-col items-center gap-2">
            <span>비디오/이미지 소스 없음</span>
            {music && (
              <span className="text-xs bg-surface-1 px-2 py-1 rounded">
                BPM ({music.bpm}) 기반 자동 빈 클립 템포 매칭
              </span>
            )}
          </div>
        )}

        {/* 가사 오버레이 */}
        {activeLyrics && (
          <div className="absolute bottom-20 left-0 right-0 text-center pointer-events-none">
            <span className="rounded-lg border border-white/10 bg-black/60 px-4 py-1.5 text-xl font-semibold text-white shadow-lg shadow-black/30 backdrop-blur md:text-2xl">
              {activeLyrics}
            </span>
          </div>
        )}

        {/* 프롬프트 Diff 오버레이 (가챠 시 변경된 단어 형광펜) */}
        {promptDiff.length > 0 && (
          <div className='pointer-events-none absolute bottom-8 left-0 right-0 px-6 text-center md:px-10'>
            <div className='inline-block max-w-full rounded-xl border border-white/10 bg-black/70 px-4 py-2 text-left text-sm leading-relaxed text-slate-200 shadow-lg shadow-black/30 backdrop-blur md:text-base line-clamp-2'>
              {promptDiff.map((token, index) => (
                <span
                  key={index + '-' + token.value}
                  className={token.isChanged
                    ? 'rounded-sm bg-accent/30 px-0.5 font-semibold text-primary ring-1 ring-inset ring-accent/40'
                    : undefined}
                >
                  {token.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// verified P1-03

// verified P1-03

// verified P1-03

// verified P2-03
