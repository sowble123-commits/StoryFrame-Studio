import { Timeline } from '../timeline/Timeline';
import { useStoryFrameStore } from '@/store';
import { PreviewPlayer } from '../timeline/PreviewPlayer';
import { useState, useRef, useEffect } from 'react';

export function MainContent({ children }: { children?: React.ReactNode }) {
  const project = useStoryFrameStore((state) => state.project);
  const isTimelineVisible = project?.uiState?.timelineVisible ?? false;
  
  const [panelWidth, setPanelWidth] = useState(400); // initial width
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(250, Math.min(newWidth, 800)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-canvas">
      {/* 2분할 영역 */}
      <div className="flex-1 flex border-b border-border p-0 overflow-hidden relative">
        <div className="flex-1 relative overflow-hidden flex flex-col">
          {children}
        </div>
        
        {project && (
          <>
            {/* 리사이저 */}
            <div 
              className="w-1 bg-border hover:bg-accent cursor-col-resize shrink-0 transition-colors z-10"
              onMouseDown={(e) => {
                e.preventDefault();
                isDragging.current = true;
                document.body.style.cursor = 'col-resize';
              }}
            />
            {/* 도킹된 프리뷰 패널 */}
            <div 
              className="shrink-0 p-4 bg-canvas flex flex-col"
              style={{ width: panelWidth }}
            >
              <PreviewPlayer />
            </div>
          </>
        )}
      </div>
      {project && isTimelineVisible && (
        <div className="h-72 shrink-0 flex flex-col border-t border-border">
          <Timeline />
        </div>
      )}
    </div>
  );
}
