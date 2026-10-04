import { useStoryFrameStore } from '@/store';

export function StatusBar() {
  const project = useStoryFrameStore((state) => state.project);
  
  return (
    <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 shrink-0 text-xs text-slate-400">
      <div className="flex items-center gap-4">
        <span>{project ? project.meta.title : 'No Project Loaded'}</span>
        {project && (
          <span>
            {project.progress.completedCuts} / {project.progress.totalCuts} Cuts Completed
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Placeholder for background tasks */}
        <span>Ready</span>
      </div>
    </div>
  );
}
