import { useStoryFrameStore } from '@/store';

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
            className="hover:text-slate-200 transition-colors focus:outline-none flex items-center gap-1"
          >
            {(project.uiState as any)?.timelineVisible ? '타임라인 숨기기 ⬇' : '타임라인 열기 ⬆'}
          </button>
        )}
        <span>준비됨</span>
      </div>
    </div>
  );
}
