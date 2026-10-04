import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStoryFrameStore } from '@/store';
import { Cut } from '@/types/project';
import { clsx } from 'clsx';
import { GripVertical } from 'lucide-react';

interface TimelineClipProps {
  cut: Cut;
  pixelsPerSecond: number;
}

export function TimelineClip({ cut, pixelsPerSecond }: TimelineClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cut.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${cut.timeline.effectiveDurationSec * pixelsPerSecond}px`,
  };

  const updateCutTimeline = useStoryFrameStore(s => s.updateCutTimeline);
  const setSelectedCutId = useStoryFrameStore(s => s.setSelectedCutId);
  const selectedCutId = useStoryFrameStore(s => s.project?.uiState?.selectedCutId);
  const beatMarkers = useStoryFrameStore(s => s.project?.music?.beatMarkers || []);
  const isSelected = selectedCutId === cut.id;
  const switchVideoVersion = useStoryFrameStore(s => s.switchVideoVersion);

  // In/Out Trimming Handles with Beat Magnet Snap (±50ms)
  const handleTrimIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startInPoint = cut.timeline.inPointSec;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let newInPoint = startInPoint + deltaX / pixelsPerSecond;
      
      // Beat Magnet Snap
      if (beatMarkers.length > 0) {
        const closestBeat = beatMarkers.reduce((prev, curr) => 
          Math.abs(curr.timeSec - newInPoint) < Math.abs(prev.timeSec - newInPoint) ? curr : prev
        );
        if (Math.abs(closestBeat.timeSec - newInPoint) <= 0.05) { // 50ms
          newInPoint = closestBeat.timeSec;
        }
      }
      
      updateCutTimeline(cut.id, { inPointSec: Math.max(0, newInPoint) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTrimOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startOutPoint = cut.timeline.outPointSec;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let newOutPoint = startOutPoint + deltaX / pixelsPerSecond;
      
      // Beat Magnet Snap
      if (beatMarkers.length > 0) {
        const closestBeat = beatMarkers.reduce((prev, curr) => 
          Math.abs(curr.timeSec - newOutPoint) < Math.abs(prev.timeSec - newOutPoint) ? curr : prev
        );
        if (Math.abs(closestBeat.timeSec - newOutPoint) <= 0.05) { // 50ms
          newOutPoint = closestBeat.timeSec;
        }
      }
      
      updateCutTimeline(cut.id, { outPointSec: Math.max(cut.timeline.inPointSec + 0.1, newOutPoint) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const activeVersion = cut.video.versions?.find(v => v.isSelected) || cut.video.versions?.[0];
  const thumbnail = activeVersion?.thumbnailPath || cut.illustration.primaryImagePath;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "relative h-20 bg-slate-800 border-y border-r border-slate-700 flex flex-col overflow-visible group",
        isDragging && "z-50 opacity-50 shadow-2xl scale-105",
        isSelected && "ring-2 ring-blue-500 z-10"
      )}
      onClick={() => setSelectedCutId(cut.id)}
    >
      {/* Background Thumbnail */}
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
          draggable={false}
        />
      )}

      {/* Header / Info */}
      <div 
        className="relative z-10 px-2 py-1 bg-black/50 text-xs font-mono text-slate-300 flex items-center justify-between cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-1">
          <GripVertical size={12} className="text-slate-500" />
          <span>C{String(cut.index).padStart(3, '0')}</span>
        </div>
        <span className="opacity-70">{cut.timeline.effectiveDurationSec.toFixed(1)}s</span>
      </div>

      {/* Version dropdown toggle - P3-06 */}
      {cut.video.versions && cut.video.versions.length > 1 && (
        <select 
          className="relative z-10 mx-2 mt-1 text-[10px] bg-slate-900 border border-slate-700 rounded p-0.5 text-slate-300"
          value={activeVersion?.versionId}
          onChange={(e) => switchVideoVersion(cut.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          {cut.video.versions.map((v, i) => (
            <option key={v.versionId} value={v.versionId}>v{i+1}</option>
          ))}
        </select>
      )}

      {/* Trimming Handles */}
      <div 
        className="absolute top-0 bottom-0 left-0 w-2 cursor-col-resize hover:bg-blue-500/50 z-20 group-hover:bg-slate-500/30 transition-colors"
        onMouseDown={handleTrimIn}
      />
      <div 
        className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-blue-500/50 z-20 group-hover:bg-slate-500/30 transition-colors"
        onMouseDown={handleTrimOut}
      />
    </div>
  );
}
