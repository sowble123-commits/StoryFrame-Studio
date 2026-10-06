import { useEffect, useState, useCallback, memo, useMemo } from 'react';
import { useStoryFrameStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { ClipCard } from '@/components/ClipCard';
import { PeekPanel } from '@/components/PeekPanel';
import { LayoutGrid, List, Download, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { listen } from '@tauri-apps/api/event';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

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
import type { Clip } from '@/types/project';

const GhostCard = memo(function GhostCard({ clip }: { clip: Clip }) {
  const activeTake = clip.takes[0];
  const activeFrame = activeTake?.frames[0];
  if (!activeFrame) return null;

  return (
    <div
      className="
        bg-surface-1 border border-accent rounded-xl overflow-hidden
        shadow-2xl ring-2 ring-blue-500/30 opacity-90
        flex flex-col h-64 w-full pointer-events-none
      "
    >
      <div className="h-32 bg-surface-0 border-b border-border-subtle flex items-center justify-center relative overflow-hidden">
        {activeFrame.F0_reference ? (
          <img
            src={activeFrame.F0_reference}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-surface-2" />
        )}
      </div>
      <div className="p-3 flex-1">
        <p className="text-sm text-secondary truncate font-medium">
          {activeFrame.description || 'No description'}
        </p>
      </div>
    </div>
  );
});

// ─── 뷰 모드 토글 버튼 ────────────────────────────────────────────────────────
const ViewToggle = memo(function ViewToggle({
  viewMode,
  onSet,
  disabled,
}: {
  viewMode: 'grid' | 'list';
  onSet: (m: 'grid' | 'list') => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex bg-surface-0 border border-border rounded-lg p-1"
      role="group"
      aria-label="보기 모드 선택"
    >
      {(['grid', 'list'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onSet(mode)}
          disabled={disabled}
          aria-pressed={viewMode === mode}
          aria-label={mode === 'grid' ? '그리드 보기' : '리스트 보기'}
          title={mode === 'grid' ? 'Grid View' : 'List View'}
          className={clsx(
            'p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            viewMode === mode
              ? 'bg-surface-2 text-primary'
              : 'text-tertiary hover:text-secondary',
            disabled && 'opacity-50 cursor-not-allowed'
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
import { ExportDialog } from '@/components/ExportDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Sequence } from '@/types/project';

const EMPTY_SEQUENCES: Sequence[] = [];

export function EditorPage() {
  useKeyboardShortcuts();

  // Selector 세분화 — 각각 최소 slice만 구독하여 무관한 변경 시 리렌더 방지
  const title      = useStoryFrameStore((s) => s.project?.meta.title ?? '제목 없는 프로젝트');
  const sequencesRaw = useStoryFrameStore(useShallow((s) => s.project?.sequences));
  const sequences  = sequencesRaw || EMPTY_SEQUENCES;
  
  const clipCount  = useMemo(() => sequences.reduce((acc, seq) => acc + seq.clips.length, 0), [sequences]);
  
  const projectPath = useStoryFrameStore((s) => s.project?.projectPath);
  const viewMode   = useStoryFrameStore((s) => s.viewMode);
  const setViewMode      = useStoryFrameStore((s) => s.setViewMode);
  const moveClip         = useStoryFrameStore((s) => s.moveClip);

  const addClip = useStoryFrameStore((s) => s.addClip);

  // 드래그 중인 클립
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // 이미지 드롭용 모달 상태
  const [dropPaths, setDropPaths] = useState<string[]>([]);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

  // 클립 내보내기용 (임시 빈 배열)
  const clipsForExport = useMemo(() => [], []);

  // ── 파일 드롭 리스너 (메모리 릭 방지) ──────────────────────────────────────
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let isMounted = true;

    const registerListener = async () => {
      try {
        unlistenFn = await listen('tauri://drag-drop', async (event) => {
          if (!isMounted) return; // 컴포넌트 언마운트 시 실행 방지
          const payload = event.payload as { paths: string[] };
          if (!payload?.paths || !projectPath) return;

          const imagePaths = payload.paths.filter(p => /\.(png|jpe?g|gif|webp)$/i.test(p));
          if (imagePaths.length > 0) {
            setDropPaths(imagePaths);
            setIsPromptModalOpen(true);
          }
        });
        
        if (!isMounted && unlistenFn) {
          unlistenFn();
        }
      } catch (err) {
        console.error('Drag-drop listener registration failed:', err);
      }
    };

    registerListener();

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [projectPath]);

  const handlePromptSubmit = async (promptText: string) => {
    setIsPromptModalOpen(false);
    
    const currentSequences = useStoryFrameStore.getState().project?.sequences ?? [];
    if (currentSequences.length === 0) return;
    
    const targetSeqId = useStoryFrameStore.getState().project?.uiState?.selectedSequenceId || currentSequences[0].id;
    
    for (const path of dropPaths) {
      try {
        await invoke('inject_metadata', { filePath: path, prompt: promptText });
        
        const assetUrl = convertFileSrc(path);
        
        const clip: Clip = {
          id: crypto.randomUUID(),
          index: 1,
          takes: [
            {
              id: crypto.randomUUID(),
              index: 1,
              sectionId: '',
              story: { description: promptText, lyrics: '', timeRange: { startSec: 0, endSec: 3 } },
              illustration: { status: 'Todo', primaryImagePath: '', variantPaths: [], characterRefs: [], moodboardRefs: [], camera: { angle: '', movement: '', notes: '' } },
              video: { status: 'Todo', motionDifficulty: '', motionDescription: '', lastFramePath: '', versions: [] },
              timeline: { inPointSec: 0, outPointSec: 3, effectiveDurationSec: 3, absoluteStartSec: 0, transitionIn: '', transitionOut: '' },
              variants: [],
              isHardCut: false,
              F0_reference: assetUrl,
              frames: [
                {
                  id: crypto.randomUUID(),
                  F0_reference: assetUrl,
                  variants: [],
                  isHardCut: false,
                  description: promptText,
                  prompt: promptText,
                }
              ],
              videoVersion: null,
              durationSec: 3,
            }
          ]
        };
        
        addClip(targetSeqId, clip);
      } catch (err) {
        console.error('Failed to process dropped image:', err);
      }
    }
    
    setDropPaths([]);
  };

  const handleOpenPicker = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      });
      if (selected && Array.isArray(selected)) {
        setDropPaths(selected);
        setIsPromptModalOpen(true);
      } else if (selected && typeof selected === 'string') {
        setDropPaths([selected]);
        setIsPromptModalOpen(true);
      }
    } catch (err) {
      console.error('File picker error:', err);
    }
  };

  const handlePromptCancel = () => {
    setIsPromptModalOpen(false);
    setDropPaths([]);
  };

  // ── DnD 핸들러 ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const currentSequences = useStoryFrameStore.getState().project?.sequences ?? [];
      let found: Clip | null = null;
      for (const seq of currentSequences) {
        const c = seq.clips.find(clip => clip.id === event.active.id);
        if (c) {
          found = c;
          break;
        }
      }
      setActiveClip(found);
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveClip(null);
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const currentSequences = useStoryFrameStore.getState().project?.sequences ?? [];
        for (const seq of currentSequences) {
          const oldIndex = seq.clips.findIndex((c) => c.id === active.id);
          const newIndex = seq.clips.findIndex((c) => c.id === over.id);
          if (oldIndex !== -1 && newIndex !== -1) {
            moveClip(seq.id, oldIndex, newIndex);
            break;
          }
        }
      }
    },
    [moveClip],
  );

  const handleDragCancel = useCallback(() => setActiveClip(null), []);

  if (!sequences.length && !title) return null;

  return (
    <div className="flex flex-col h-full w-full bg-canvas overflow-hidden relative">
      <header className="flex justify-between items-center px-6 py-3.5 border-b border-border bg-canvas/80 backdrop-blur-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-primary leading-tight">{title}</h2>
          <p className="text-xs text-tertiary mt-0.5">{clipCount} Clips</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenPicker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1 hover:bg-surface-2 text-primary text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>파일 추가</span>
          </button>
          <button
            onClick={() => setIsExportOpen(true)}
            disabled={clipCount === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            <span>내보내기</span>
          </button>
          <ViewToggle viewMode={viewMode} onSet={setViewMode} disabled={clipCount === 0} />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 relative border-r border-border custom-scrollbar">
          {clipCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border-subtle flex items-center justify-center">
                <LayoutGrid size={24} className="text-slate-700" />
              </div>
              <p className="text-sm">프로젝트에 클립이 없습니다.</p>
              <p className="text-xs text-slate-700">새 시퀀스와 클립을 추가하세요.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="flex flex-col gap-10">
                {sequences.map(seq => (
                  <div key={seq.id} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-1 h-4 bg-accent rounded-full" />
                      <h3 className="text-sm font-bold text-secondary tracking-wide uppercase">{seq.label}</h3>
                      <span className="text-xs text-slate-600 font-medium ml-2">{seq.clips.length} Clips</span>
                    </div>
                    
                    <SortableContext items={seq.clips.map(c => c.id)} strategy={rectSortingStrategy}>
                      <div
                        className={clsx(
                          'grid gap-4',
                          viewMode === 'grid'
                            ? 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3'
                            : 'grid-cols-1 max-w-4xl',
                        )}
                      >
                        {seq.clips.map((clip) => (
                          <ClipCardWrapper
                            key={clip.id}
                            sequenceId={seq.id}
                            clipId={clip.id}
                            viewMode={viewMode}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                ))}
              </div>

              <DragOverlay
                adjustScale={false}
                dropAnimation={{
                  duration: 180,
                  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}
              >
                {activeClip ? (
                  <div
                    className={clsx(
                      viewMode === 'grid' ? 'w-52' : 'w-full max-w-4xl',
                    )}
                  >
                    <GhostCard clip={activeClip} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
        
        <div className="w-[45%] shrink-0 p-4 bg-canvas flex flex-col border-l border-border">
          <PreviewPlayer />
        </div>
      </div>

      <PeekPanel />

      <ExportDialog 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        clips={clipsForExport} 
      />

      <DropPromptModal
        isOpen={isPromptModalOpen}
        paths={dropPaths}
        onSubmit={handlePromptSubmit}
        onCancel={handlePromptCancel}
      />
    </div>
  );
}

const ClipCardWrapper = memo(function ClipCardWrapper({ sequenceId, clipId, viewMode }: { sequenceId: string, clipId: string, viewMode: 'grid' | 'list' }) {
  const clip = useStoryFrameStore(useCallback((s) => s.project?.sequences?.find(seq => seq.id === sequenceId)?.clips?.find(c => c.id === clipId), [sequenceId, clipId]));
  const isSelected = useStoryFrameStore(useCallback((s) => s.project?.uiState?.selectedClipId === clipId, [clipId]));
  const setSelectedIds = useStoryFrameStore((s) => s.setSelectedIds);

  if (!clip) return null;

  return (
    <ClipCard
      sequenceId={sequenceId}
      clip={clip}
      viewMode={viewMode}
      isSelected={isSelected}
      onClick={() => setSelectedIds(sequenceId, clipId, null, null)}
    />
  );
});

const DropPromptModal = memo(function DropPromptModal({
  isOpen,
  paths,
  onSubmit,
  onCancel,
}: {
  isOpen: boolean;
  paths: string[];
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [promptText, setPromptText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPromptText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-0 border border-border-subtle rounded-xl shadow-2xl p-6 w-[480px]">
        <h3 className="text-xl font-bold text-primary mb-4">
          {paths.length}개의 이미지 메타데이터 추가
        </h3>
        <p className="text-sm text-secondary mb-4">
          추가할 이미지에 각인될 프롬프트를 입력하세요.
        </p>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          className="w-full bg-surface-1 border border-border-subtle rounded-lg p-3 text-primary focus:outline-none focus:border-accent min-h-[100px]"
          placeholder="예: 산 너머로 지는 아름다운 노을..."
        />
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-secondary hover:bg-surface-1 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => onSubmit(promptText)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent transition-colors"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
});

// verified P1-02
