import React, { useRef, useCallback, useMemo } from 'react';
import { useStoryFrameStore } from '@/store';
import { WaveformTrack } from './WaveformTrack';
import { VideoTrack } from './VideoTrack';
import { LyricsTrack } from './LyricsTrack';
import { Play, Pause, ZoomIn, ZoomOut } from 'lucide-react';
import { usePlaybackEngine } from '@/hooks/usePlaybackEngine';
import { seekTo } from '@/lib/playbackClock';

/**
 * Timeline — 컨테이너 & 마스터 클락 소비자
 *
 * currentTime을 구독하지 않는다. Playhead/타임코드는 ref + 직접 DOM 뮤테이션.
 */
export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef  = useRef<HTMLDivElement>(null);
  const timecodeRef  = useRef<HTMLSpanElement>(null);

  const isPlaying       = useStoryFrameStore((s) => s.isPlaying);
  const setIsPlaying    = useStoryFrameStore((s) => s.setIsPlaying);
  const zoom            = useStoryFrameStore((s) => s.project?.uiState?.timelineZoom ?? 100);
  const setTimelineZoom = useStoryFrameStore((s) => s.setTimelineZoom);
  const musicDuration   = useStoryFrameStore((s) => s.project?.music?.durationSec ?? 180);

  usePlaybackEngine({ playheadRef, timecodeRef, pixelsPerSecond: zoom });

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      // 클립/핸들 위 클릭은 seek 대상이 아님
      if ((e.target as HTMLElement).closest('[data-no-seek]')) return;
      const rect = el.getBoundingClientRect();
      seekTo((e.clientX - rect.left + el.scrollLeft) / zoom);
      // 정지 상태 seek은 스토어에도 반영 (단축키/저장 일관성)
      if (!useStoryFrameStore.getState().isPlaying) {
        useStoryFrameStore.getState().setCurrentTime(Math.max(0, (e.clientX - rect.left + el.scrollLeft) / zoom));
      }
    },
    [zoom],
  );

  const handleZoom = useCallback(
    (delta: number) => setTimelineZoom(Math.min(400, Math.max(20, zoom + delta))),
    [zoom, setTimelineZoom],
  );

  const trackWidth = useMemo(
    () => Math.max(1000, musicDuration * zoom),
    [musicDuration, zoom],
  );

  return (
    <div className="flex flex-col h-full bg-surface-0 border-t border-border text-secondary relative select-none">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-canvas shrink-0">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? '일시정지' : '재생'}
          className="p-1.5 rounded hover:bg-surface-1 text-secondary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </button>

        <span ref={timecodeRef} className="font-mono text-xs text-secondary w-16 tabular-nums">
          0.00s
        </span>

        <div className="flex items-center gap-1 ml-auto">
          <button type="button" onClick={() => handleZoom(-20)} aria-label="줌 아웃"
            className="p-1 rounded hover:bg-surface-1 text-tertiary transition-colors">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-slate-600 w-12 text-center tabular-nums">{zoom}px/s</span>
          <button type="button" onClick={() => handleZoom(20)} aria-label="줌 인"
            className="p-1 rounded hover:bg-surface-1 text-tertiary transition-colors">
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-auto" onClick={handleTimelineClick}>
        <div className="relative min-h-full" style={{ width: `${trackWidth}px` }}>
          <VideoTrack pixelsPerSecond={zoom} />
          <LyricsTrack pixelsPerSecond={zoom} />
          <WaveformTrack pixelsPerSecond={zoom} />

          <div
            ref={playheadRef}
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-0 w-px bg-danger z-50 pointer-events-none"
            style={{ willChange: 'transform' }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-danger rotate-45" />
          </div>
        </div>
      </div>
    </div>
  );
}
