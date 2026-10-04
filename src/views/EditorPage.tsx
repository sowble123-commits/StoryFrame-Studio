import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useStoryFrameStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
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
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import type { Cut } from '@/types/project';

// ─── DragOverlay에서 사용할 경량 고스트 카드 ──────────────────────────────────
// DragOverlay는 Portal에서 렌더되므로 전체 그리드와 독립. memo로 재렌더 최소화.
const GhostCard = memo(function GhostCard({ cut }: { cut: Cut }) {
  return (
    <div
      className="
        bg-slate-800 border border-blue-500 rounded-xl overflow-hidden
        shadow-2xl ring-2 ring-blue-500/30 opacity-90
        flex flex-col h-64 w-full pointer-events-none
      "
    >
      <div className="h-32 bg-slate-900 border-b border-slate-700 flex items-center justify-center relative overflow-hidden">
        {cut.illustration.primaryImagePath ? (
          <img
            src={cut.illustration.primaryImagePath}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-slate-700" />
        )}
        <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-xs font-mono text-slate-300">
          C{String(cut.index).padStart(3, '0')}
        </div>
      </div>
      <div className="p-3 flex-1">
        <p className="text-sm text-slate-300 truncate font-medium">
          {cut.story.description || 'No description'}
        </p>
      </div>
    </div>
  );
});

// ─── 뷰 모드 토글 버튼 ────────────────────────────────────────────────────────
const ViewToggle = memo(function ViewToggle({
  viewMode,
  onSet,
}: {
  viewMode: 'grid' | 'list';
  onSet: (m: 'grid' | 'list') => void;
}) {
  return (
    <div
      className="flex bg-slate-900 border border-slate-800 rounded-lg p-1"
      role="group"
      aria-label="보기 모드 선택"
    >
      {(['grid', 'list'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onSet(mode)}
          aria-pressed={viewMode === mode}
          aria-label={mode === 'grid' ? '그리드 보기' : '리스트 보기'}
          title={mode === 'grid' ? 'Grid View' : 'List View'}
          className={clsx(
            'p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
            viewMode === mode
              ? 'bg-slate-700 text-slate-200'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {mode === 'grid' ? <LayoutGrid size={17} /> : <List size={17} />}
        </button>
      ))}
    </div>
  );
});

// ─── EditorPage ───────────────────────────────────────────────────────────────

import { PreviewPlayer } from '@/components/timeline/PreviewPlayer';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function EditorPage() {
  useKeyboardShortcuts();

  // Selector 세분화 — 각각 최소 slice만 구독하여 무관한 변경 시 리렌더 방지
  const title      = useStoryFrameStore((s) => s.project?.meta.title ?? 'Untitled Project');
  const cutCount   = useStoryFrameStore((s) => s.project?.cuts?.length ?? 0);
  const cutIds     = useStoryFrameStore(useShallow((s) => s.project?.cuts?.map((c) => c.id) ?? []));
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);
  const viewMode   = useStoryFrameStore((s) => s.viewMode);
  const setViewMode      = useStoryFrameStore((s) => s.setViewMode);
  const moveCut          = useStoryFrameStore((s) => s.moveCut);

  // 드래그 중인 컷 (고스트 렌더용)
  const [activeCut, setActiveCut] = useState<Cut | null>(null);

  // ── 파일 드롭 리스너 (메모리 릭 방지) ──────────────────────────────────────
  // projectPath가 바뀔 때만 재등록하되, Promise를 ref에 보관해 cleanup에서 확실히 해제
  const unlistenRef = useRef<ReturnType<typeof listen> | null>(null);

  useEffect(() => {
    // 이전 리스너 해제
    if (unlistenRef.current) {
      unlistenRef.current.then((f) => f());
    }

    const registerListener = async () => {
      const unlisten = listen('tauri://drag-drop', async (event) => {
        const payload = event.payload as { paths: string[] };
        if (!payload?.paths || !projectPath) return;

        const assetsDir = `${projectPath}/assets`;
        try {
          await mkdir(assetsDir, { recursive: true });
        } catch {
          // 이미 존재하는 경우 무시
        }

        for (const filePath of payload.paths) {
          try {
            const fileName = filePath.split(/[/\\]/).pop() ?? 'unknown';
            await copyFile(filePath, `${assetsDir}/${fileName}`);
          } catch (err) {
            console.error('[drop] Failed to copy:', filePath, err);
          }
        }
      });
      unlistenRef.current = Promise.resolve(await unlisten) as any;
    };

    registerListener();

    return () => {
      // 컴포넌트 언마운트 or projectPath 변경 시 반드시 해제
      if (unlistenRef.current) {
        unlistenRef.current.then((f) => f());
        unlistenRef.current = null;
      }
    };
  }, [projectPath]); // project 전체 대신 projectPath만 의존

  // ── DnD 핸들러 ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const currentCuts = useStoryFrameStore.getState().project?.cuts ?? [];
      const found = currentCuts.find((c) => c.id === event.active.id);
      setActiveCut(found ?? null);
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCut(null);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const currentCuts = useStoryFrameStore.getState().project?.cuts ?? [];
        const oldIndex = currentCuts.findIndex((c) => c.id === active.id);
        const newIndex = currentCuts.findIndex((c) => c.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          moveCut(oldIndex, newIndex);
        }
      }
    },
    [moveCut],
  );

  const handleDragCancel = useCallback(() => setActiveCut(null), []);

  // ── 빈 프로젝트 가드 ──────────────────────────────────────────────────────
  if (!cutIds.length && !title) return null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden relative">

      {/* ── 에디터 헤더 ── */}
      <header className="flex justify-between items-center px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-200 leading-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{cutCount} Cuts</p>
        </div>
        <ViewToggle viewMode={viewMode} onSet={setViewMode} />
      </header>

      {/* ── 컷 그리드 & 프리뷰 ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 relative border-r border-slate-800">
          {cutIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center">
                <LayoutGrid size={24} className="text-slate-700" />
              </div>
              <p className="text-sm">No cuts in this project.</p>
              <p className="text-xs text-slate-700">Drag &amp; drop media files to import</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={cutIds} strategy={rectSortingStrategy}>
                <div
                  className={clsx(
                    'grid gap-4',
                    viewMode === 'grid'
                      ? 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3'
                      : 'grid-cols-1 max-w-4xl mx-auto',
                  )}
                >
                  {cutIds.map((id) => (
                    <CutCardWrapper
                      key={id}
                      id={id}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* DragOverlay: 드래그 중 고스트를 Portal에 독립 렌더 → 그리드 리렌더 없음 */}
              <DragOverlay
                adjustScale={false}
                dropAnimation={{
                  duration: 180,
                  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}
              >
                {activeCut ? (
                  <div
                    className={clsx(
                      viewMode === 'grid' ? 'w-52' : 'w-full max-w-4xl',
                    )}
                  >
                    <GhostCard cut={activeCut} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
        
        {/* PreviewPlayer Section */}
        <div className="w-[45%] shrink-0 p-4 bg-slate-950 flex flex-col">
          <PreviewPlayer />
        </div>
      </div>

      {/* ── PeekPanel ── */}
      <PeekPanel />
    </div>
  );
}


function CutCardWrapper({ id, viewMode }: { id: string, viewMode: 'grid' | 'list' }) {
  const cut = useStoryFrameStore((s) => s.project?.cuts?.find(c => c.id === id));
  const isSelected = useStoryFrameStore((s) => s.project?.uiState?.selectedCutId === id);
  const setSelectedCutId = useStoryFrameStore((s) => s.setSelectedCutId);

  if (!cut) return null;

  return (
    <CutCard
      cut={cut}
      viewMode={viewMode}
      isSelected={isSelected}
      onClick={() => setSelectedCutId(id)}
    />
  );
}
