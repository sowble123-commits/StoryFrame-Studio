import { Maximize, Minus, X, Home } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStoryFrameStore } from '@/store';

export function TitleBar() {
  const minimize = () => getCurrentWindow().minimize();
  const maximize = () => getCurrentWindow().toggleMaximize();
  const close = () => getCurrentWindow().close();
  const project = useStoryFrameStore((state) => state.project);
  const closeProject = useStoryFrameStore((state) => state.closeProject);

  return (
    <div
      data-tauri-drag-region
      className="h-10 bg-slate-900 flex items-center justify-between px-2 select-none border-b border-slate-800 shrink-0"
    >
      <div className="flex items-center space-x-2 pointer-events-none px-2 text-slate-300 text-sm font-medium">
        <span>StoryFrame Studio</span>
      </div>
      <div className="flex items-center space-x-1">
        {project && (
          <button
            onClick={closeProject}
            className="p-1.5 mr-2 flex items-center gap-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors text-xs font-medium"
            title="프로젝트 닫기 (홈으로)"
          >
            <Home size={14} />
            홈으로
          </button>
        )}
        <button
          onClick={minimize}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={maximize}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
        >
          <Maximize size={16} />
        </button>
        <button
          onClick={close}
          className="p-2 hover:bg-red-500 hover:text-white rounded text-slate-400 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
