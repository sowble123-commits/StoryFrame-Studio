import type React from 'react';
import { useCallback, useMemo } from 'react';
import { useStoryFrameStore } from '@/store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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

export function VideoTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const cuts = useStoryFrameStore((s) => s.project?.cuts);
  const moveCut = useStoryFrameStore((s) => s.moveCut);

  const sensors = useSensors(
    useSensor(TrimSafePointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => (cuts ?? []).map((c) => c.id), [cuts]);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) moveCut(oldIndex, newIndex);
    },
    [ids, moveCut],
  );

  return (
    <div className="relative h-24 border-b border-slate-800 bg-slate-900 flex items-center">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="flex h-full items-center">
            {(cuts ?? []).map((cut) => (
              <TimelineClip key={cut.id} cut={cut} pixelsPerSecond={pixelsPerSecond} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
