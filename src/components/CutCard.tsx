import { memo, useCallback, useMemo } from 'react';
import { Image, Video, CheckCircle, Clock, Zap, Gauge, Flame, Copy, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useStoryFrameStore } from '@/store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Cut } from '@/types/project';
import { getAssetUrl } from '@/lib/utils';

interface CutCardProps {
  cut: Cut;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
  onClick?: () => void;
}

// ─── 순수 서브 컴포넌트 (메모이즈) ────────────────────────────────────────────

const StatusIcon = memo(function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle size={13} className="text-green-500" />;
  return <Clock size={13} className={status === 'in_progress' ? 'text-yellow-500' : 'text-slate-600'} />;
});

const MotionBadge = memo(function MotionBadge({ difficulty }: { difficulty: string }) {
  switch (difficulty) {
    case 'high':   return <span title="High Motion"><Flame size={13} className="text-red-500" /></span>;
    case 'medium': return <span title="Medium Motion"><Zap size={13} className="text-yellow-500" /></span>;
    case 'low':    return <span title="Low Motion"><Gauge size={13} className="text-blue-500" /></span>;
    default:       return null;
  }
});

// ─── 가챠 버전 슬롯 ────────────────────────────────────────────────────────────

interface VersionSlotsProps {
  cutId: string;
  versions: Cut['video']['versions'];
}

const VersionSlots = memo(function VersionSlots({ cutId, versions }: VersionSlotsProps) {
  const switchVideoVersion = useStoryFrameStore((s) => s.switchVideoVersion);
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);

  if (!versions || versions.length === 0) return null;

  return (
    <div
      className="flex gap-1 items-center"
      role="group"
      aria-label="비디오 버전 선택"
    >
      {versions.map((v, i) => {
        const label = `버전 ${i + 1}${v.isSelected ? ' (선택됨)' : ''}`;
        return v.thumbnailPath ? (
          // 썸네일이 있으면 바 형태로 렌더
          <button
            key={v.versionId}
            type="button"
            aria-label={label}
            aria-pressed={v.isSelected}
            onClick={(e) => {
              e.stopPropagation(); // CutCard onClick으로 버블링 방지
              switchVideoVersion(cutId, v.versionId);
            }}
            className={clsx(
              'w-8 h-5 rounded overflow-hidden border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
              v.isSelected
                ? 'border-blue-400 ring-1 ring-blue-400'
                : 'border-slate-700 opacity-60 hover:opacity-100',
            )}
          >
            <img src={getAssetUrl(projectPath, v.thumbnailPath)} alt={label} className="w-full h-full object-cover" draggable={false} />
          </button>
        ) : (
          // 썸네일 없으면 점(dot)
          <button
            key={v.versionId}
            type="button"
            aria-label={label}
            aria-pressed={v.isSelected}
            onClick={(e) => {
              e.stopPropagation();
              switchVideoVersion(cutId, v.versionId);
            }}
            className={clsx(
              'w-2.5 h-2.5 rounded-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
              v.isSelected
                ? 'bg-blue-500 scale-110'
                : 'bg-slate-700 hover:bg-slate-500',
            )}
          />
        );
      })}
    </div>
  );
});

// ─── CutCard ──────────────────────────────────────────────────────────────────

export const CutCard = memo(function CutCard({ cut, viewMode, isSelected, onClick }: CutCardProps) {
  const isGrid = viewMode === 'grid';

  // Selector 세분화: CutCard는 자신의 액션만 구독
  const duplicateCut = useStoryFrameStore((s) => s.duplicateCut);
  const deleteCut    = useStoryFrameStore((s) => s.deleteCut);
  const projectPath  = useStoryFrameStore((s) => s.project?.projectPath);
  const thumbUrl = useMemo(
    () => getAssetUrl(projectPath, cut.illustration.primaryImagePath),
    [projectPath, cut.illustration.primaryImagePath],
  );

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cut.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // 원본은 완전히 숨김 → DragOverlay로 대체
    zIndex: isDragging ? 10 : 'auto' as const,
  };

  const handleDuplicate = useCallback(
    (e: Event) => { e.stopPropagation(); duplicateCut(cut.id); },
    [cut.id, duplicateCut],
  );
  const handleDelete = useCallback(
    (e: Event) => { e.stopPropagation(); deleteCut(cut.id); },
    [cut.id, deleteCut],
  );

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
            'bg-slate-900 border rounded-xl overflow-hidden select-none',
            'cursor-pointer transition-all duration-150',
            'hover:border-blue-500/50 hover:bg-slate-800',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-800',
            isGrid ? 'flex flex-col h-64' : 'flex flex-row items-center p-4 gap-4',
          )}
        >
          {/* ── 썸네일 ── */}
          <div
            className={clsx(
              'bg-slate-950 flex items-center justify-center overflow-hidden relative shrink-0',
              isGrid ? 'h-32 border-b border-slate-800' : 'w-32 h-20 rounded border border-slate-800',
            )}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={`컷 ${cut.index} 썸네일`}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <Image className="text-slate-700" size={28} />
            )}
            {/* 컷 인덱스 배지 */}
            <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300 leading-none">
              C{String(cut.index).padStart(3, '0')}
            </div>
            {/* 모션 난이도 배지 */}
            {cut.video.motionDifficulty && (
              <div className="absolute top-2 right-2 bg-black/60 p-1 rounded">
                <MotionBadge difficulty={cut.video.motionDifficulty} />
              </div>
            )}
          </div>

          {/* ── 콘텐츠 ── */}
          <div className={clsx('flex flex-col flex-1 min-w-0', isGrid ? 'p-3 gap-2' : 'gap-1')}>
            <div className="flex justify-between items-start gap-2">
              <h4
                className="text-slate-200 font-medium text-sm truncate"
                title={cut.story.description}
              >
                {cut.story.description || 'No description'}
              </h4>
              {!isGrid && (
                <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                  {cut.timeline.effectiveDurationSec}s
                </span>
              )}
            </div>

            {/* 그리드에서만 가사 미리보기 */}
            {isGrid && cut.story.lyrics && (
              <p className="text-xs text-slate-600 truncate">{cut.story.lyrics}</p>
            )}

            <div className={clsx('flex justify-between items-center mt-auto', isGrid && 'pt-1')}>
              {/* 상태 아이콘 */}
              <div className="flex gap-3">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Image size={13} />
                  <StatusIcon status={cut.illustration.status} />
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Video size={13} />
                  <StatusIcon status={cut.video.status} />
                </div>
                {isGrid && (
                  <span className="text-xs text-slate-600 ml-auto">
                    {cut.timeline.effectiveDurationSec}s
                  </span>
                )}
              </div>

              {/* 가챠 버전 슬롯 */}
              <VersionSlots cutId={cut.id} versions={cut.video.versions} />
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
            onSelect={handleDuplicate}
            className="
              flex items-center gap-2 px-3 py-1.5 rounded-md
              text-sm text-slate-200 cursor-default outline-none
              data-[highlighted]:bg-slate-700 data-[highlighted]:text-white
            "
          >
            <Copy size={13} />
            복제
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px bg-slate-700 my-1" />

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
