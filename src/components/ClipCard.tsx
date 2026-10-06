import { memo, useState, useCallback, useMemo } from 'react';
import { Eye, EyeOff, Image as ImageIcon, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useStoryFrameStore } from '@/store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Clip } from '@/types/project';
import { getAssetUrl } from '@/lib/utils';

interface ClipCardProps {
  sequenceId: string;
  clip: Clip;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  onClick?: () => void;
}

export const ClipCard = memo(function ClipCard({ sequenceId, clip, viewMode, isSelected, onClick }: ClipCardProps) {
  const isGrid = viewMode === 'grid';
  
  const deleteClip = useStoryFrameStore((s) => s.deleteClip);
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);

  // Get the active take and its primary frame
  const activeTake = clip.takes[0]; // Assuming the first take is active for now
  const activeFrame = activeTake?.frames[0];
  
  const thumbUrl = useMemo(
    () => getAssetUrl(projectPath, activeFrame?.F0_reference ?? ''),
    [projectPath, activeFrame?.F0_reference],
  );

  const [showPrompt, setShowPrompt] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : ('auto' as const),
  };

  const handleDelete = useCallback(
    (e: Event) => { e.stopPropagation(); deleteClip(sequenceId, clip.id); },
    [sequenceId, clip.id, deleteClip],
  );

  if (!activeFrame) return null;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onClick}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
          className={clsx(
            'bg-slate-900 border rounded-xl overflow-hidden select-none relative',
            'cursor-pointer transition-all duration-150',
            'hover:border-blue-500/50 hover:bg-slate-800',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-800',
            isGrid ? 'flex flex-col h-auto min-h-[16rem]' : 'flex flex-row items-center p-4 gap-4',
          )}
        >
          {/* ── 썸네일 ── */}
          <div
            className={clsx(
              'bg-slate-950 flex items-center justify-center overflow-hidden relative shrink-0 group',
              isGrid ? 'h-40 border-b border-slate-800' : 'w-32 h-20 rounded border border-slate-800',
            )}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={`클립 썸네일`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                draggable={false}
              />
            ) : (
              <ImageIcon className="text-slate-700" size={28} />
            )}
            
            {/* 하드컷 배지 */}
            {activeFrame.isHardCut && (
              <div className="absolute top-2 left-2 bg-red-600/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white leading-none">
                HARD CUT
              </div>
            )}
            
            {/* 캡션 토글 버튼 (P1-03) */}
            {isGrid && activeFrame.prompt && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPrompt(p => !p);
                }}
                className="absolute bottom-2 right-2 bg-black/70 p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-black transition-colors"
                title={showPrompt ? '프롬프트 숨기기' : '프롬프트 보기'}
              >
                {showPrompt ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}

            {/* 프롬프트 캡션 오버레이 (P1-03) */}
            {isGrid && showPrompt && activeFrame.prompt && (
              <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 border-t border-slate-700/50 backdrop-blur-sm">
                <p className="text-xs text-slate-200 line-clamp-3 leading-relaxed">
                  {activeFrame.prompt}
                </p>
              </div>
            )}
          </div>

          {/* ── 콘텐츠 ── */}
          <div className={clsx('flex flex-col flex-1 min-w-0', isGrid ? 'p-3 gap-2' : 'gap-1')}>
            <div className="flex justify-between items-start gap-2">
              <h4
                className="text-slate-200 font-medium text-sm truncate flex-1"
                title={activeFrame.description}
              >
                {activeFrame.description || 'No description'}
              </h4>
              {!isGrid && activeTake.durationSec > 0 && (
                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                  {activeTake.durationSec}s
                </span>
              )}
            </div>

            <div className={clsx('flex justify-between items-center mt-auto', isGrid && 'pt-1')}>
              <div className="flex gap-2">
                 <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                   Take {clip.takes.length}
                 </span>
                 <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                   Var {activeFrame.variants.length}
                 </span>
              </div>
              
              {isGrid && activeTake.durationSec > 0 && (
                <span className="text-xs text-slate-500 ml-auto font-mono">
                  {activeTake.durationSec.toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>

      {/* ── 컨텍스트 메뉴 ── */}
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="
            bg-slate-800 border border-slate-700 rounded-lg p-1
            min-w-[160px] shadow-2xl z-[100] overflow-hidden
            animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
          "
        >
          <ContextMenu.Item
            onSelect={handleDelete}
            className="
              flex items-center gap-2 px-3 py-1.5 rounded-md
              text-sm text-red-400 cursor-default outline-none
              data-[highlighted]:bg-red-900/40 data-[highlighted]:text-red-300
            "
          >
            <Trash2 size={13} />
            삭제
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});
