
import { useEffect } from 'react';
import { useStoryFrameStore } from '@/store';
import { CutCard } from '@/components/CutCard';
import { PeekPanel } from '@/components/PeekPanel';
import { LayoutGrid, List } from 'lucide-react';
import { clsx } from 'clsx';
import { listen } from '@tauri-apps/api/event';
import { copyFile, mkdir } from '@tauri-apps/plugin-fs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

export function EditorPage() {
  const { project, viewMode, setViewMode, moveCut, setSelectedCutId } = useStoryFrameStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    // Setup Tauri file drop listener
    const unlisten = listen('tauri://drag-drop', async (event) => {
      const payload = event.payload as { paths: string[] };
      if (payload && payload.paths && project?.projectPath) {
        console.log('Files dropped:', payload.paths);
        const assetsDir = `${project.projectPath}/assets`;
        
        try {
          await mkdir(assetsDir, { recursive: true });
        } catch (e) {
          console.log('Assets directory might already exist:', e);
        }

        for (const filePath of payload.paths) {
          try {
            const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
            const targetPath = `${assetsDir}/${fileName}`;
            await copyFile(filePath, targetPath);
            console.log('Copied file to:', targetPath);
            // Here we could also create new cuts based on dropped files if needed
          } catch (e) {
            console.error('Failed to copy file:', e);
          }
        }
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [project]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && project?.cuts) {
      const oldIndex = project.cuts.findIndex(c => c.id === active.id);
      const newIndex = project.cuts.findIndex(c => c.id === over.id);
      moveCut(oldIndex, newIndex);
    }
  };

  if (!project) return null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden relative">
      {/* Editor Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950/50">
        <div>
          <h2 className="text-xl font-bold text-slate-200">{project.meta.title || "Untitled Project"}</h2>
          <p className="text-sm text-slate-500">{project.cuts?.length || 0} Cuts</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              "p-1.5 rounded transition-colors",
              viewMode === 'grid' ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            )}
            title="Grid View"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              "p-1.5 rounded transition-colors",
              viewMode === 'list' ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            )}
            title="List View"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 relative">
        {(!project.cuts || project.cuts.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <p>No cuts found in this project.</p>
            <p className="text-xs mt-2">Drag and drop media files here to import</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={project.cuts.map(c => c.id)} strategy={rectSortingStrategy}>
              <div className={clsx(
                "grid gap-4",
                viewMode === 'grid' 
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                  : "grid-cols-1 max-w-4xl mx-auto"
              )}>
                {project.cuts.map((cut) => (
                  <CutCard 
                    key={cut.id} 
                    cut={cut} 
                    viewMode={viewMode}
                    isSelected={project.uiState?.selectedCutId === cut.id}
                    onClick={() => setSelectedCutId(cut.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Peek Panel (Slide-in) */}
      <PeekPanel />
    </div>
  );
}
