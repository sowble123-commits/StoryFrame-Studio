export function MainContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
      {/* 2분할 영역 */}
      <div className="flex-1 border-b border-slate-800 p-4 overflow-auto relative">
        <h2 className="text-slate-400 font-medium mb-4">Workspace</h2>
        {children}
      </div>
      <div className="h-64 p-4 overflow-auto bg-slate-900 shrink-0">
        <h2 className="text-slate-400 font-medium">Timeline</h2>
      </div>
    </div>
  );
}
