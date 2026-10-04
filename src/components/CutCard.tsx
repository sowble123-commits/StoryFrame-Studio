
import { Cut } from '@/types/project';
import { Image, Video, CheckCircle, Clock, Zap, Gauge, Flame, Copy, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useStoryFrameStore } from '@/store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CutCardProps {
  cut: Cut;
  viewMode: 'grid' | 'list';
  onClick?: () => void;
  isSelected?: boolean;
}

export function CutCard({ cut, viewMode, onClick, isSelected }: CutCardProps) {
  const isGrid = viewMode === 'grid';
  const { duplicateCut, deleteCut } = useStoryFrameStore();
  
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };
  
  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} className="text-green-500" />;
      case 'in_progress': return <Clock size={14} className="text-yellow-500" />;
      default: return <Clock size={14} className="text-slate-500" />;
    }
  };

  const MotionBadge = ({ difficulty }: { difficulty: string }) => {
    switch (difficulty) {
      case 'high': return <span title="High Motion"><Flame size={14} className="text-red-500" /></span>;
      case 'medium': return <span title="Medium Motion"><Zap size={14} className="text-yellow-500" /></span>;
      case 'low': return <span title="Low Motion"><Gauge size={14} className="text-blue-500" /></span>;
      default: return null;
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div 
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onClick}
          className={clsx(
            "bg-slate-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-blue-500/50 hover:bg-slate-800",
            isSelected ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-800",
            isGrid ? "flex flex-col h-64" : "flex flex-row items-center p-4 gap-4"
          )}
        >
          {/* Thumbnail area (bento style header for grid) */}
          <div className={clsx(
            "bg-slate-950 flex items-center justify-center overflow-hidden relative",
            isGrid ? "h-32 border-b border-slate-800 shrink-0" : "w-32 h-20 rounded bg-slate-900 border border-slate-800 shrink-0"
          )}>
            {cut.illustration.primaryImagePath ? (
              <img 
                src={cut.illustration.primaryImagePath} 
                alt={`Cut ${cut.index}`} 
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <Image className="text-slate-700" size={32} />
            )}
            <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-mono text-slate-300">
              C{String(cut.index).padStart(3, '0')}
            </div>
            {cut.video.motionDifficulty && (
              <div className="absolute top-2 right-2 bg-black/60 p-1 rounded">
                <MotionBadge difficulty={cut.video.motionDifficulty} />
              </div>
            )}
          </div>

          {/* Content area */}
          <div className={clsx("flex flex-col flex-1 min-w-0", isGrid ? "p-4 gap-2" : "gap-1")}>
            <div className="flex justify-between items-start">
              <h4 className="text-slate-200 font-medium truncate" title={cut.story.description}>
                {cut.story.description || "No description"}
              </h4>
              {!isGrid && <div className="text-xs text-slate-500 whitespace-nowrap ml-4 shrink-0">{cut.timeline.effectiveDurationSec}s</div>}
            </div>
            
            {isGrid && (
              <div className="text-xs text-slate-500 mt-auto flex justify-between items-center">
                <span>{cut.timeline.effectiveDurationSec}s</span>
              </div>
            )}

            <div className={clsx("flex justify-between mt-auto", !isGrid && "items-center")}>
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Image size={14} />
                  <StatusIcon status={cut.illustration.status} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Video size={14} />
                  <StatusIcon status={cut.video.status} />
                </div>
              </div>
              
              {/* Bento Video Slots Indicator */}
              {cut.video.versions && cut.video.versions.length > 0 && (
                <div className="flex gap-1 items-center">
                  {cut.video.versions.map((v, i) => (
                    <div 
                      key={v.versionId || i} 
                      className={clsx(
                        "w-2 h-2 rounded-sm", 
                        v.isSelected ? "bg-blue-500" : "bg-slate-700"
                      )} 
                      title={`Version ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-slate-800 border border-slate-700 rounded-md p-1 min-w-[160px] shadow-xl z-50 overflow-hidden">
          <ContextMenu.Item 
            className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-200 outline-none cursor-default hover:bg-slate-700 rounded"
            onClick={(e) => {
              e.stopPropagation();
              duplicateCut(cut.id);
            }}
          >
            <Copy size={14} /> Duplicate
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-slate-700 my-1" />
          <ContextMenu.Item 
            className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 outline-none cursor-default hover:bg-slate-700 rounded"
            onClick={(e) => {
              e.stopPropagation();
              deleteCut(cut.id);
            }}
          >
            <Trash2 size={14} /> Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
