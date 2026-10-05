import { useStoryFrameStore } from '@/store';
import { ChevronDown } from 'lucide-react';

export function StatusBar() {
  const project = useStoryFrameStore((state) => state.project);
  
  return (
    <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 shrink-0 text-xs text-slate-400 select-none">
      <div className="flex items-center gap-4">
        <span>{project ? project.meta.title : '프로젝트 없음'}</span>
        {project && (
          <span>
            {project.progress.completedCuts} / {project.progress.totalCuts} 컷 완료
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {project && (
          <button
            onClick={() => useStoryFrameStore.getState().toggleTimeline()}
            className="hover:text-slate-200 hover:bg-slate-800 p-1 rounded transition-colors focus:outline-none flex items-center justify-center text-slate-400"
            title="타임라인 토글"
            aria-label="타임라인 토글"
          >
            <ChevronDown 
              size={18} 
              className={`transition-transform duration-200 ${(project.uiState as any)?.timelineVisible ? '' : 'rotate-180'}`}
            />
          </button>
        )}
        <span>
          {project?.progress?.pendingTasks && project.progress.pendingTasks.length > 0
            ? `처리 중: ${project.progress.pendingTasks[0]}`
            : '준비됨'}
        </span>
      </div>
    </div>
  );
}
