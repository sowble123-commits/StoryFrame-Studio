import { Timeline } from '../timeline/Timeline';
import { useStoryFrameStore } from '@/store';

export function MainContent({ children }: { children?: React.ReactNode }) {
  const project = useStoryFrameStore((state) => state.project);
  const isTimelineVisible = project?.uiState?.timelineVisible ?? false;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-canvas">
      {/* 2분할 영역 */}
      <div className="flex-1 border-b border-border p-0 overflow-hidden relative flex flex-col">
        {children}
      </div>
      {project && isTimelineVisible && (
        <div className="h-72 shrink-0 flex flex-col border-t border-border">
          <Timeline />
        </div>
      )}
    </div>
  );
}
