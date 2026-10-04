import { useCallback } from 'react';
import { useStoryFrameStore } from '@/store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable';
import { TimelineClip } from './TimelineClip';

export function VideoTrack({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const cuts = useStoryFrameStore(s => s.project?.cuts || []);
  const moveCut = useStoryFrameStore(s => s.moveCut);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cuts.findIndex(c => c.id === active.id);
      const newIndex = cuts.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        moveCut(oldIndex, newIndex);
      }
    }
  }, [cuts, moveCut]);

  return (
    <div className="relative h-24 border-b border-slate-800 bg-slate-900 flex items-center px-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        // modifiers={[restrictToHorizontalAxis]}
      >
        <SortableContext items={cuts.map(c => c.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex h-full items-center">
            {cuts.map((cut) => (
              <TimelineClip
                key={cut.id}
                cut={cut}
                pixelsPerSecond={pixelsPerSecond}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
