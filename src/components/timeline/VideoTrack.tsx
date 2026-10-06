import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStoryFrameStore } from '@/store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
  type PointerSensorOptions,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { TimelineClip } from './TimelineClip';

/**
 * 트리밍 핸들 등 data-no-dnd 요소에서 시작된 포인터는 드래그로 활성화하지 않는다.
 * 기본 PointerSensor activator와 동일하되 필터만 추가.
 */
class TrimSafePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: React.PointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0) return false;
        if ((event.target as HTMLElement | null)?.closest('[data-no-dnd]')) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });


const OVERSCAN_PX = 600;

/** 가장 가까운 가로 스크롤 조상 (타임라인 Pan 컨테이너) */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const ox = getComputedStyle(p).overflowX;
    if (ox === 'auto' || ox === 'scroll') return p;
    p = p.parentElement;
  }
  return null;
}

export function VideoTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const cuts = useStoryFrameStore((s) => s.project?.cuts);
  const ids = useMemo(() => cuts?.map((c) => c.id) ?? [], [cuts]);
  const durations = useMemo(() => cuts?.map((c) => c.timeline.effectiveDurationSec) ?? [], [cuts]);
  const moveCut = useStoryFrameStore((s) => s.moveCut);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ start: number; end: number }>({ start: 0, end: 2000 });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // 컷별 누적 오프셋 (clip 폭 = duration * pps)
  const { offsets, total } = useMemo(() => {
    const o = new Array<number>(durations.length + 1);
    o[0] = 0;
    for (let i = 0; i < durations.length; i++) o[i + 1] = o[i] + durations[i] * pixelsPerSecond;
    return { offsets: o, total: o[durations.length] };
  }, [durations, pixelsPerSecond]);

  // 스크롤/리사이즈 → 트랙 좌표계의 가시 구간 계산 (RAF로 프레임당 1회)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const scroller = findScrollParent(wrap);
    let raf = 0;

    const measure = () => {
      raf = 0;
      const wr = wrap.getBoundingClientRect();
      const sr = scroller?.getBoundingClientRect();
      const viewLeft = sr ? sr.left : 0;
      const viewWidth = scroller ? scroller.clientWidth : window.innerWidth;
      const start = viewLeft - wr.left - OVERSCAN_PX;
      const end = viewLeft - wr.left + viewWidth + OVERSCAN_PX;
      // 오버스캔 단위로 양자화 → 미세 스크롤마다 리렌더 방지
      const qs = Math.floor(start / 200) * 200;
      const qe = Math.ceil(end / 200) * 200;
      setViewport((prev) => (prev.start === qs && prev.end === qe ? prev : { start: qs, end: qe }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    (scroller ?? window).addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller ?? document.documentElement);
    return () => {
      (scroller ?? window).removeEventListener('scroll', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 가시 구간 [first, last] 이진 탐색 + 드래그 중인 컷 강제 포함
  const { first, last } = useMemo(() => {
    const n = ids.length;
    if (n === 0) return { first: 0, last: -1 };
    const lowerBound = (x: number) => {
      // offsets[i+1] > x 인 최소 i
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid + 1] > x) hi = mid; else lo = mid + 1;
      }
      return lo;
    };
    const f = Math.min(n - 1, lowerBound(Math.max(0, viewport.start)));
    let l = f;
    while (l + 1 < n && offsets[l + 1] < viewport.end) l++;
    return { first: f, last: l };
  }, [ids.length, offsets, viewport]);

  const dragIndex = activeDragId ? ids.indexOf(activeDragId) : -1;
  const visibleIds = useMemo(() => {
    const out: { id: string; index: number }[] = [];
    for (let i = first; i <= last; i++) out.push({ id: ids[i], index: i });
    return out;
  }, [ids, first, last]);

  // 드래그 중인 컷이 가시 영역 밖이어도 언마운트되지 않도록 앞/뒤에 유지
  const dragOutsideBefore = dragIndex !== -1 && dragIndex < first;
  const dragOutsideAfter = dragIndex !== -1 && dragIndex > last;

  const leftSpacer = dragOutsideBefore ? offsets[first] - (offsets[dragIndex + 1] - offsets[dragIndex]) : offsets[first] ?? 0;
  const rightEnd = last >= 0 ? offsets[last + 1] : 0;
  const rightSpacer = dragOutsideAfter
    ? Math.max(0, total - rightEnd - (offsets[dragIndex + 1] - offsets[dragIndex]))
    : Math.max(0, total - rightEnd);

  const sensors = useSensors(
    useSensor(TrimSafePointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => setActiveDragId(String(active.id)), []);
  const handleDragCancel = useCallback(() => setActiveDragId(null), []);
  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveDragId(null);
      if (!over || active.id === over.id) return;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) moveCut(oldIndex, newIndex);
    },
    [ids, moveCut],
  );

  return (
    <div ref={wrapRef} className="relative h-24 border-b border-border bg-surface-0 flex items-center">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {/* SortableContext에는 전체 id 전달 → 정렬 인덱스/이동 계산 정확성 유지 */}
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="flex h-full items-center">
            {dragOutsideBefore && (
              <TimelineClip key={ids[dragIndex]} id={ids[dragIndex]} pixelsPerSecond={pixelsPerSecond} />
            )}
            <div aria-hidden="true" className="shrink-0 h-full" style={{ width: Math.max(0, leftSpacer) }} />
            {visibleIds.map(({ id }) => (
              <TimelineClip key={id} id={id} pixelsPerSecond={pixelsPerSecond} />
            ))}
            <div aria-hidden="true" className="shrink-0 h-full" style={{ width: rightSpacer }} />
            {dragOutsideAfter && (
              <TimelineClip key={ids[dragIndex]} id={ids[dragIndex]} pixelsPerSecond={pixelsPerSecond} />
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
