import { AppShell } from '@/components/layout/AppShell';
import { useStoryFrameStore } from '@/store';

function App() {
  const loadProject = useStoryFrameStore((state) => state.loadProject);
  
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p>Main Workspace Area</p>
        <button 
          onClick={() => loadProject('project_state.json')}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors cursor-pointer"
        >
          Load Project State
        </button>
      </div>
    </AppShell>
  );
}

export default App;
