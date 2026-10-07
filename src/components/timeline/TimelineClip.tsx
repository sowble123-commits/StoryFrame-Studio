import { SafeImage } from '@/components/SafeImage';
import React, { memo, useCallback, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStoryFrameStore } from '@/store';

import { clsx } from 'clsx';
import { GripVertical } from 'lucide-react';
import { clamp, snapToBeat } from '@/lib/timelineMath';

interface TimelineClipProps {
  id: string;
  pixelsPerSecond: number;
}

const MIN_CLIP_SEC = 0.1;

type Edge = 'in' | 'out';

export const TimelineClip = memo(function TimelineClip({ id, pixelsPerSecond }: TimelineClipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const cut = useStoryFrameStore((s) => s.project?.cuts?.find((c) => c.id === id));
  const updateCutTimeline = useStoryFrameStore((s) => s.updateCutTimeline);
  const setSelectedCutId  = useStoryFrameStore((s) => s.setSelectedCutId);
  const switchVideoVersion = useStoryFrameStore((s) => s.switchVideoVersion);
  const isSelected = useStoryFrameStore((s) => s.project?.uiState?.selectedCutId === id);

  const activeVersion = cut?.video.versions?.find((v) => v.isSelected) ?? cut?.video.versions?.[0];
  const thumbnail = activeVersion?.thumbnailPath || cut?.illustration.primaryImagePath;

  // 최신 값을 pointer 핸들러 클로저 없이 읽기 위한 ref
  const latest = useRef({ cut, pps: pixelsPerSecond, sourceDuration: activeVersion?.durationSec ?? 0 });
  latest.current = { cut, pps: pixelsPerSecond, sourceDuration: activeVersion?.durationSec ?? 0 };

  /**
   * 트리밍 핸들 공용 pointerdown.
   *  - setPointerCapture: 포인터가 핸들 밖/윈도우 밖으로 나가도 move/up 보장
   *  - stopPropagation: dnd-kit(PointerSensor)·클립 onClick·타임라인 seek으로 전파 차단
   *  - 절대 위치(startValue + totalDelta/pps)로 계산 → 빠른 드래그에서도 스냅 누락 없음
   *  - RAF로 스토어 커밋을 프레임당 1회로 합침
   */
  const startTrim = useCallback(
    (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const { cut: c0 } = latest.current; if (!c0) return;
      const startX = e.clientX;
      const startValue = edge === 'in' ? c0.timeline.inPointSec : c0.timeline.outPointSec;
      // 드래그 시작 시점에 한 번만 정렬 스냅샷 (읽기 전용 getState → 구독/리렌더 없음)
      const beats = (useStoryFrameStore.getState().project?.music?.beatMarkers ?? [])
        .map((b) => b.timeSec)
        .sort((a, b) => a - b);

      let raf = 0;
      let pending: number | null = null;

      const commit = () => {
        raf = 0;
        if (pending === null) return;
        const value = pending;
        pending = null;
        updateCutTimeline(c0.id, edge === 'in' ? { inPointSec: value } : { outPointSec: value });
      };

      const onMove = (ev: PointerEvent) => {
        const { cut: cur, pps, sourceDuration } = latest.current;
        let t = startValue + (ev.clientX - startX) / pps;
        t = snapToBeat(beats, t, 0.05);

        if (edge === 'in') {
          t = clamp(t, 0, cur!.timeline.outPointSec - MIN_CLIP_SEC);
        } else {
          const max = sourceDuration > 0 ? sourceDuration : Number.POSITIVE_INFINITY;
          t = clamp(t, cur!.timeline.inPointSec + MIN_CLIP_SEC, max);
        }
        pending = t;
        if (!raf) raf = requestAnimationFrame(commit);
      };

      const finish = (ev: PointerEvent) => {
        if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', finish);
        target.removeEventListener('pointercancel', finish);
        if (raf) cancelAnimationFrame(raf);
        commit(); // 마지막 값 확정
      };

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', finish);
      target.addEventListener('pointercancel', finish);
    },
    [updateCutTimeline],
  );

  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform), // Translate: scale 왜곡 없음
    transition,
    width: (cut?.timeline.effectiveDurationSec ?? 0) * pixelsPerSecond,
    flexShrink: 0,
  };

  

  if (!cut) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-no-seek
      className={clsx(
        'relative h-20 bg-surface-1 border-y border-r border-border-subtle flex flex-col overflow-visible group',
        isDragging && 'z-50 opacity-60 shadow-2xl',
        isSelected && 'ring-2 ring-accent z-10',
      )}
      onClick={() => setSelectedCutId(cut.id)}
    >
      {thumbnail && (
        <SafeImage           src={thumbnail}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
          draggable={false}
        />
      )}

      {/* 드래그(순서 변경) 영역: 헤더에만 listeners 부착 */}
      <div
        className="relative z-10 px-2 py-1 bg-black/50 text-xs font-mono text-secondary flex items-center justify-between cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-1">
          <GripVertical size={12} className="text-tertiary" />
          <span>C{String(cut.index).padStart(3, '0')}</span>
        </div>
        <span className="opacity-70">{cut.timeline.effectiveDurationSec.toFixed(1)}s</span>
      </div>

      {cut?.video.versions && cut?.video.versions.length > 1 && (
        <select
          data-no-dnd
          className="relative z-10 mx-2 mt-1 text-[10px] bg-surface-0 border border-border-subtle rounded p-0.5 text-secondary"
          value={activeVersion?.versionId}
          onChange={(e) => switchVideoVersion(cut.id, e.target.value)}
          onClick={stop}
          onPointerDown={stop}
          aria-label="비디오 버전"
        >
          {cut?.video.versions.map((v, i) => (
            <option key={v.versionId} value={v.versionId}>v{i + 1}</option>
          ))}
        </select>
      )}

      {/* 트리밍 핸들: data-no-dnd + pointer capture + 전파 차단 */}
      <div
        data-no-dnd
        role="separator"
        aria-label="In 포인트 트리밍"
        className="absolute top-0 bottom-0 left-0 w-2 cursor-col-resize hover:bg-accent/50 z-20 touch-none transition-colors"
        onPointerDown={startTrim('in')}
        onClick={stop}
      />
      <div
        data-no-dnd
        role="separator"
        aria-label="Out 포인트 트리밍"
        className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-accent/50 z-20 touch-none transition-colors"
        onPointerDown={startTrim('out')}
        onClick={stop}
      />
    </div>
  );
});
