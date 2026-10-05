import { useStoryFrameStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown } from 'lucide-react';

export function StatusBar() {
  const title = useStoryFrameStore((state) => state.project?.meta.title);
  const progress = useStoryFrameStore(useShallow((state) => state.project?.progress));
  const timelineVisible = useStoryFrameStore((state) => (state.project?.uiState as any)?.timelineVisible);
  const toggleTimeline = useStoryFrameStore((state) => state.toggleTimeline);
  
  return (
    <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 shrink-0 text-xs text-slate-400 select-none">
      <div className="flex items-center gap-4">
        <span>{title ? title : '프로젝트 없음'}</span>
        {progress && (
          <span>
            {progress.completedCuts ?? 0} / {progress.totalCuts ?? 0} 컷 완료
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {title && (
          <button
            onClick={() => toggleTimeline()}
            className="hover:text-slate-200 hover:bg-slate-800 p-1 rounded transition-colors focus:outline-none flex items-center justify-center text-slate-400"
            title="타임라인 토글"
            aria-label="타임라인 토글"
          >
            <ChevronDown 
              size={18} 
              className={`transition-transform duration-200 ${timelineVisible ? '' : 'rotate-180'}`}
            />
          </button>
        )}
        <span>
          {progress?.pendingTasks && progress.pendingTasks.length > 0
            ? `처리 중: ${progress.pendingTasks[0]}`
            : '준비됨'}
        </span>
      </div>
    </div>
  );
}
