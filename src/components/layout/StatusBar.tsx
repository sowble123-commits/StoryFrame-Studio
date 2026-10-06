import { useStoryFrameStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

export function StatusBar() {
  const title = useStoryFrameStore((state) => state.project?.meta.title);
  const progress = useStoryFrameStore(useShallow((state) => state.project?.progress));
  const timelineVisible = useStoryFrameStore((state) => state.project?.uiState?.timelineVisible);
  const toggleTimeline = useStoryFrameStore((state) => state.toggleTimeline);
  
  const [renderProgress, setRenderProgress] = useState<number | null>(null);

  useEffect(() => {
    let unlistenFn: () => void;
    
    listen<number>('render-progress', (e) => {
      if (e.payload >= 100) {
        setRenderProgress(null);
      } else {
        setRenderProgress(e.payload);
      }
    }).then(unlisten => {
      unlistenFn = unlisten;
    }).catch(console.error);

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);
  
  return (
    <div className="h-8 bg-surface-0 border-t border-border flex items-center justify-between px-4 shrink-0 text-xs text-secondary select-none">
      <div className="flex items-center gap-4">
        <span>{title ? title : '프로젝트 없음'}</span>
        {progress && (
          <span>
            {progress.completedCuts ?? 0} / {progress.totalCuts ?? 0} 컷 완료
          </span>
        )}
        {renderProgress !== null && (
          <div className="flex items-center gap-2 text-blue-400 font-medium">
            <Loader2 size={12} className="animate-spin" />
            <span>렌더링 중: {renderProgress.toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {title && (
          <button
            onClick={() => toggleTimeline()}
            className="hover:text-primary hover:bg-surface-1 p-1 rounded transition-colors focus:outline-none flex items-center justify-center text-secondary"
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
