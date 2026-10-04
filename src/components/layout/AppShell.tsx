import { TitleBar } from './TitleBar';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { MainContent } from './MainContent';
import { StatusBar } from './StatusBar';

export function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <CollapsibleSidebar />
        <MainContent>{children}</MainContent>
      </div>
      <StatusBar />
    </div>
  );
}
