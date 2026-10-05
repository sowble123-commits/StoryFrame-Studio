import { Timeline } from '../timeline/Timeline';
import { useStoryFrameStore } from '@/store';

export function MainContent({ children }: { children?: React.ReactNode }) {
  const project = useStoryFrameStore((state) => state.project);
  const isTimelineVisible = (project?.uiState as any)?.timelineVisible ?? false;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
      {/* 2분할 영역 */}
      <div className="flex-1 border-b border-slate-800 p-0 overflow-hidden relative flex flex-col">
        {children}
      </div>
      {project && isTimelineVisible && (
        <div className="h-72 shrink-0 flex flex-col border-t border-slate-800">
          <Timeline />
        </div>
      )}
    </div>
  );
}
