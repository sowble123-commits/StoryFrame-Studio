import { TitleBar } from './TitleBar';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { MainContent } from './MainContent';
import { StatusBar } from './StatusBar';
import { useStoryFrameStore } from '@/store';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useExternalSync } from '@/hooks/useExternalSync';

export function AppShell({ children }: { children?: React.ReactNode }) {
  const project = useStoryFrameStore((state) => state.project);
  
  useAutoSave();
  useExternalSync();
  
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        {project && <CollapsibleSidebar />}
        <MainContent>{children}</MainContent>
      </div>
      {project && <StatusBar />}
    </div>
  );
}
