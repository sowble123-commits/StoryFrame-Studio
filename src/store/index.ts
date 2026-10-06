import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ProjectState, Cut, Take, Sequence, Clip } from '@/types/project';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface RecentProject {
  name: string;
  path: string;
  last_opened: number;
}

interface StoryFrameStore {
  project: ProjectState | null;
  isLoading: boolean;
  error: string | null;
  recentProjects: RecentProject[];
  viewMode: 'grid' | 'list';
  currentTab: 'cuts' | 'audio' | 'settings' | 'characters' | 'locations';
  setCurrentTab: (tab: 'cuts' | 'audio' | 'settings' | 'characters' | 'locations') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setProject: (project: ProjectState | null) => void;
  loadProject: (path?: string) => Promise<void>;
  closeProject: () => void;
  saveProject: (path: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadRecentProjects: () => Promise<void>;
  toggleSidebar: () => void;
  toggleTimeline: () => void;
  
  setSelectedCutId: (id: string | null) => void;
  
  moveCut: (oldIndex: number, newIndex: number) => void;
  deleteCut: (id: string) => void;
  duplicateCut: (id: string) => void;
  
  deleteClip: (sequenceId: string, clipId: string) => void;
  moveClip: (sequenceId: string, oldIndex: number, newIndex: number) => void;
  addClip: (sequenceId: string, clip: Clip) => void;
  setSelectedIds: (seqId: string, clipId: string, takeId: string | null, frameId: string | null) => void;
  
  mergeProject: (path: string) => Promise<void>;
  updateCut: (id: string, patch: Partial<Cut>) => void;
  switchVideoVersion: (cutId: string, versionId: string) => void;

  currentTime: number;
  isPlaying: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTimelineZoom: (zoom: number) => void;
  updateCutTimeline: (cutId: string, patch: Partial<import('@/types/project').CutTimeline>) => void;
  addImportedMedia: (mediaPath: string, thumbnailPath: string, durationSec: number) => void;
  addCharacterSheet: (sheet: import('@/types/project').CharacterSheet) => void;
  addMoodboard: (board: import('@/types/project').Moodboard) => void;
}

// --- Utility Functions ---

function normalizeProjectData(data: Partial<ProjectState>, fallbackTitle: string): ProjectState {
  return {
    ...data,
    version: data.version || '1.0',
    meta: data.meta || { id: '', title: fallbackTitle, genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' },
    progress: data.progress || { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] },
    music: data.music || { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] },
    globalAssets: data.globalAssets || { characterSheets: [], moodboards: [] },
    sequences: data.sequences || [],
    cuts: data.cuts || [],
    roughCut: data.roughCut || { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] },
    uiState: {
      sidebarCollapsed: data.uiState?.sidebarCollapsed ?? false,
      timelineZoom: data.uiState?.timelineZoom ?? 100,
      gridColumns: data.uiState?.gridColumns ?? 3,
      selectedCutId: data.uiState?.selectedCutId ?? null,
      selectedSequenceId: data.uiState?.selectedSequenceId ?? null,
      selectedClipId: data.uiState?.selectedClipId ?? null,
      timelineVisible: data.uiState?.timelineVisible ?? false,
    },
    projectPath: data.projectPath
  };
}

function syncCuts(state: StoryFrameStore) {
  if (state.project?.sequences) {
    state.project.cuts = state.project.sequences.flatMap((s: Sequence) => s.clips).flatMap((c: Clip) => c.takes);
  }
}

function findTakePath(sequences: Sequence[], takeId: string) {
  for (let s = 0; s < sequences.length; s++) {
    for (let c = 0; c < sequences[s].clips.length; c++) {
      const takes = sequences[s].clips[c].takes;
      for (let t = 0; t < takes.length; t++) {
        if (takes[t].id === takeId) {
          return { s, c, t, takes, take: takes[t] };
        }
      }
    }
  }
  return null;
}

function reindexSequences(sequences: Sequence[]) {
  let indexCounter = 1;
  sequences.forEach(s => s.clips.forEach(c => c.takes.forEach(t => {
    t.index = indexCounter++;
  })));
}

function updateTake(state: StoryFrameStore, takeId: string, updater: (take: Take) => void) {
  if (!state.project?.sequences) return;
  const path = findTakePath(state.project.sequences, takeId);
  if (path) {
    updater(path.take);
    if (state.project.cuts) {
      const cut = state.project.cuts.find(c => c.id === takeId);
      if (cut) updater(cut);
    }
  }
}

function ensureImportSequenceAndClip(sequences: Sequence[]): Clip {
  if (sequences.length === 0) {
    sequences.push({ id: `seq_${Date.now()}`, index: 1, label: 'Imported', clips: [] });
  }
  const lastSeq = sequences[sequences.length - 1];
  
  if (lastSeq.clips.length === 0) {
    lastSeq.clips.push({ id: `clip_${Date.now()}`, index: 1, takes: [] });
  }
  return lastSeq.clips[lastSeq.clips.length - 1];
}

// --- Store Definition ---

export const useStoryFrameStore = create<StoryFrameStore>()(
  immer((set, get) => ({
    project: null,
    isLoading: false,
    error: null,
    recentProjects: [],
    viewMode: 'grid',
    currentTab: 'cuts',
    setCurrentTab: (tab) => set((state) => { state.currentTab = tab; }),
    setViewMode: (mode) => set((state) => { state.viewMode = mode; }),
    setProject: (project) => set((state) => { state.project = project; }),
    
    loadRecentProjects: async () => {
      try {
        const recents = await invoke<RecentProject[]>('list_recent_projects');
        set((state) => { state.recentProjects = recents; });
      } catch (err: unknown) {
        console.error('Failed to load recent projects:', err);
      }
    },
    
    loadProject: async (path?: string) => {
      set((state) => { state.isLoading = true; state.error = null; });
      try {
        const rawData = await invoke<Partial<ProjectState>>('open_project', { path });
        set((state) => {
          const data = normalizeProjectData(rawData, 'Untitled');
          
          if (data.cuts && data.cuts.length > 0 && data.sequences.length === 0) {
            data.sequences.push({
              id: `seq_migrated`,
              index: 1,
              label: 'Migrated Sequence',
              clips: [{
                id: `clip_migrated`,
                index: 1,
                takes: data.cuts.map((c, idx) => ({
                  ...c,
                  index: idx + 1,
                  variants: c.variants || [],
                  isHardCut: c.isHardCut || false,
                  F0_reference: c.F0_reference || '',
                  frames: c.frames || [{
                    id: `frame_${idx}`,
                    F0_reference: c.F0_reference || '',
                    variants: [],
                    isHardCut: c.isHardCut || false,
                    description: c.story?.description || '',
                  }],
                  durationSec: c.timeline?.effectiveDurationSec || 3,
                  videoVersion: null
                }))
              }]
            });
          }
          data.cuts = data.sequences.flatMap(s => s.clips).flatMap(c => c.takes);
          state.project = data;
          state.isLoading = false;
        });
        
        get().loadRecentProjects();
        if (rawData.projectPath) {
            await invoke('watch_project', { path: rawData.projectPath }).catch(console.error);
        }
      } catch (err: unknown) {
        set((state) => { state.error = String(err); state.isLoading = false; });
      }
    },
    
    createProject: async (name: string) => {
      set((state) => { state.isLoading = true; state.error = null; });
      try {
        const selectedPath = await open({ directory: true, multiple: false });
        if (!selectedPath) {
          set((state) => { state.isLoading = false; });
          return;
        }
        
        const rawData = await invoke<Partial<ProjectState>>('create_project', { name, path: selectedPath });
        set((state) => {
          state.project = normalizeProjectData(rawData, name);
          state.isLoading = false;
        });
        
        get().loadRecentProjects();
        if (rawData.projectPath) {
            await invoke('watch_project', { path: rawData.projectPath }).catch(console.error);
        }
      } catch (err: unknown) {
        set((state) => { state.error = String(err); state.isLoading = false; });
      }
    },
    
    closeProject: () => {
      set((state) => { state.project = null; state.error = null; });
    },
    
    mergeProject: async (path) => {
      try {
        const rawData = await invoke<Partial<ProjectState>>('open_project', { path });
        set((state) => {
          const data = normalizeProjectData(rawData, 'Untitled');
          if (state.project) {
            const currentUiState = state.project.uiState;
            state.project = data;
            state.project.uiState = { ...data.uiState, ...currentUiState };
            
            if (state.project.uiState.selectedCutId) {
              const exists = state.project.sequences?.flatMap(s => s.clips).flatMap(c => c.takes).some(t => t.id === state.project!.uiState.selectedCutId);
              if (!exists) state.project.uiState.selectedCutId = null;
            }
          } else {
            state.project = data;
          }
          syncCuts(state);
        });
      } catch (err) {
        console.error('Failed to merge project:', err);
      }
    },
    
    saveProject: async (path) => {
      const project = get().project;
      if (!project) return;
      try {
        await invoke('save_project_state', { path, state: project });
      } catch (err: unknown) {
        set((state) => { state.error = String(err); });
      }
    },
    
    toggleSidebar: () => {
      set((state) => {
        if (state.project) state.project.uiState.sidebarCollapsed = !state.project.uiState.sidebarCollapsed;
      });
    },
    
    toggleTimeline: () => {
      set((state) => {
        if (state.project) state.project.uiState.timelineVisible = !state.project.uiState.timelineVisible;
      });
    },
    
    setSelectedCutId: (id) => {
      set((state) => {
        if (state.project) state.project.uiState.selectedCutId = id;
      });
    },

    moveCut: (oldIndex, newIndex) => {
      set((state) => {
        if (!state.project?.sequences || !state.project.cuts) return;
        
        const cuts = state.project.cuts;
        if (oldIndex < 0 || oldIndex >= cuts.length || newIndex < 0 || newIndex >= cuts.length) return;
        
        const takeId = cuts[oldIndex].id;
        const oldPath = findTakePath(state.project.sequences, takeId);
        if (!oldPath) return;
        
        const [take] = oldPath.takes.splice(oldPath.t, 1);
        
        const tempCuts = [...cuts];
        tempCuts.splice(oldIndex, 1);
        const insertBeforeId = newIndex < tempCuts.length ? tempCuts[newIndex].id : null;
        
        let targetTakes: Take[] | null = null;
        let targetIndex = 0;
        
        if (tempCuts.length === 0) {
           targetTakes = state.project.sequences[0]?.clips[0]?.takes;
           targetIndex = 0;
        } else if (insertBeforeId) {
           const insertPath = findTakePath(state.project.sequences, insertBeforeId);
           if (insertPath) {
             targetTakes = insertPath.takes;
             targetIndex = insertPath.t;
           }
        }
        
        if (!targetTakes) {
           const lastS = state.project.sequences.length - 1;
           const lastC = state.project.sequences[lastS].clips.length - 1;
           targetTakes = state.project.sequences[lastS].clips[lastC].takes;
           targetIndex = targetTakes.length;
        }
        
        targetTakes?.splice(targetIndex, 0, take);
        
        reindexSequences(state.project.sequences);
        syncCuts(state);
      });
    },

    deleteCut: (id) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, id);
        if (path) {
          path.takes.splice(path.t, 1);
          reindexSequences(state.project.sequences);
          if (state.project.uiState.selectedCutId === id) {
            state.project.uiState.selectedCutId = null;
          }
          syncCuts(state);
        }
      });
    },
    
    duplicateCut: (id) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, id);
        if (path) {
          const newTake = JSON.parse(JSON.stringify(path.take)); 
          newTake.id = `cut_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          path.takes.splice(path.t + 1, 0, newTake);
          reindexSequences(state.project.sequences);
          syncCuts(state);
        }
      });
    },
    
    deleteClip: (sequenceId, clipId) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const seq = state.project.sequences.find(s => s.id === sequenceId);
        if (seq) {
          seq.clips = seq.clips.filter(c => c.id !== clipId);
          syncCuts(state);
        }
      });
    },
    
    moveClip: (sequenceId, oldIndex, newIndex) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const seq = state.project.sequences.find(s => s.id === sequenceId);
        if (seq && oldIndex >= 0 && oldIndex < seq.clips.length && newIndex >= 0 && newIndex < seq.clips.length) {
          const [moved] = seq.clips.splice(oldIndex, 1);
          seq.clips.splice(newIndex, 0, moved);
          syncCuts(state);
        }
      });
    },
    
    addClip: (sequenceId, clip) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const seq = state.project.sequences.find(s => s.id === sequenceId);
        if (seq) {
          seq.clips.push(clip);
          syncCuts(state);
        }
      });
    },
    
    setSelectedIds: (seqId, clipId, takeId, _frameId) => {
      set((state) => {
        if (!state.project) return;
        state.project.uiState.selectedSequenceId = seqId;
        state.project.uiState.selectedClipId = clipId;
        state.project.uiState.selectedCutId = takeId;
      });
    },

    updateCut: (id, patch) => {
      set((state) => {
        updateTake(state, id, (take) => { Object.assign(take, patch); });
      });
    },

    switchVideoVersion: (cutId, versionId) => {
      set((state) => {
        updateTake(state, cutId, (take) => {
          if (take.video?.versions) {
            take.video.versions.forEach(v => {
              v.isSelected = v.versionId === versionId;
            });
          }
        });
      });
    },

    currentTime: 0,
    isPlaying: false,
    setCurrentTime: (time) => { set((state) => { state.currentTime = time; }); },
    setIsPlaying: (playing) => { set((state) => { state.isPlaying = playing; }); },
    setTimelineZoom: (zoom) => { set((state) => { if (state.project) state.project.uiState.timelineZoom = zoom; }); },
    
    updateCutTimeline: (cutId, patch) => {
      set((state) => {
        updateTake(state, cutId, (take) => {
          Object.assign(take.timeline, patch);
          if (patch.inPointSec !== undefined || patch.outPointSec !== undefined) {
             const dur = take.timeline.outPointSec - take.timeline.inPointSec;
             if (dur > 0) take.timeline.effectiveDurationSec = dur;
          }
        });
      });
    },
    
    addImportedMedia: (mediaPath, thumbnailPath, durationSec) => {
      set((state) => {
        if (!state.project) return;
        if (!state.project.sequences) state.project.sequences = [];
        
        const lastClip = ensureImportSequenceAndClip(state.project.sequences);
        
        const lastTake = lastClip.takes.length > 0 ? lastClip.takes[lastClip.takes.length - 1] : null;
        const startTimeSec = lastTake 
          ? (lastTake.timeline?.absoluteStartSec ?? 0) + (lastTake.timeline?.effectiveDurationSec ?? 0)
          : 0;

        const newTake: Take = {
          id: `cut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          index: state.project.cuts ? state.project.cuts.length + 1 : 1,
          sectionId: '',
          story: { description: '', lyrics: '', timeRange: { startSec: startTimeSec, endSec: startTimeSec + durationSec } },
          illustration: { status: 'Todo', primaryImagePath: '', variantPaths: [], characterRefs: [], moodboardRefs: [], camera: { angle: '', movement: '', notes: '' } },
          video: {
            status: 'Todo', motionDifficulty: '', motionDescription: '', lastFramePath: '',
            versions: [{ versionId: `v_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, filePath: mediaPath, durationSec: durationSec, generatedBy: 'import', generatedAt: new Date().toISOString(), isSelected: true, thumbnailPath: thumbnailPath, notes: '' }]
          },
          timeline: { inPointSec: 0, outPointSec: durationSec, effectiveDurationSec: durationSec, absoluteStartSec: startTimeSec, transitionIn: '', transitionOut: '' },
          variants: [],
          isHardCut: false,
          F0_reference: '',
          frames: [{
            id: `frame_${Date.now()}`,
            F0_reference: thumbnailPath,
            variants: [],
            isHardCut: false,
            description: '',
            prompt: ''
          }],
          durationSec: durationSec,
          videoVersion: null
        };
        
        lastClip.takes.push(newTake);
        syncCuts(state);
      });
    },
    
    addCharacterSheet: (sheet) => {
      set((state) => {
        if (!state.project) return;
        if (!state.project.globalAssets) state.project.globalAssets = { characterSheets: [], moodboards: [] };
        if (!state.project.globalAssets.characterSheets) state.project.globalAssets.characterSheets = [];
        state.project.globalAssets.characterSheets.push(sheet);
      });
    },
    
    addMoodboard: (board) => {
      set((state) => {
        if (!state.project) return;
        if (!state.project.globalAssets) state.project.globalAssets = { characterSheets: [], moodboards: [] };
        if (!state.project.globalAssets.moodboards) state.project.globalAssets.moodboards = [];
        state.project.globalAssets.moodboards.push(board);
      });
    },
  }))
);

// P0-02 completed
