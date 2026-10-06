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
  currentTab: 'cuts' | 'audio' | 'settings';
  setCurrentTab: (tab: 'cuts' | 'audio' | 'settings') => void;
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
}

function syncCuts(state: StoryFrameStore) {
  if (state.project && state.project.sequences) {
    state.project.cuts = state.project.sequences.flatMap((s: Sequence) => s.clips).flatMap((c: Clip) => c.takes);
  }
}

function findTakePath(sequences: Sequence[], takeId: string) {
  for (let s = 0; s < sequences.length; s++) {
    for (let c = 0; c < sequences[s].clips.length; c++) {
      const takes = sequences[s].clips[c].takes;
      for (let t = 0; t < takes.length; t++) {
        if (takes[t].id === takeId) {
          return { s, c, t, take: takes[t] };
        }
      }
    }
  }
  return null;
}

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
        const data = await invoke<ProjectState>('open_project', { path });
        set((state) => {
          if (!data.meta) data.meta = { id: '', title: 'Untitled', genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' };
          if (!data.globalAssets) data.globalAssets = { characterSheets: [], moodboards: [] };
          if (!data.music) data.music = { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] };
          if (!data.progress) data.progress = { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] };
          if (!data.sequences) data.sequences = [];
          
          if (data.cuts && data.cuts.length > 0 && data.sequences.length === 0) {
            data.sequences.push({
              id: `seq_migrated`,
              index: 1,
              clips: [{
                id: `clip_migrated`,
                index: 1,
                takes: data.cuts.map(c => ({
                  ...c,
                  variants: (c as {variants?: unknown[]}).variants || [],
                  isHardCut: (c as {isHardCut?: boolean}).isHardCut || false,
                  F0_reference: (c as {F0_reference?: string}).F0_reference || ''
                }))
              }]
            });
          }
          data.cuts = data.sequences.flatMap(s => s.clips).flatMap(c => c.takes);
          
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };
          if (!data.uiState) {
            data.uiState = { sidebarCollapsed: false, timelineZoom: 100, selectedCutId: null, gridColumns: 3, timelineVisible: false } as { sidebarCollapsed: boolean, timelineZoom: number, selectedCutId: string | null, gridColumns: number, timelineVisible?: boolean };
          } else {
            data.uiState.sidebarCollapsed = data.uiState.sidebarCollapsed ?? false;
            data.uiState.timelineZoom = data.uiState.timelineZoom ?? 100;
            data.uiState.selectedCutId = data.uiState.selectedCutId ?? null;
            data.uiState.gridColumns = data.uiState.gridColumns ?? 3;
          }
          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        const d = data as {projectPath?: string};
        if (d.projectPath) {
            await invoke('watch_project', { path: d.projectPath }).catch(console.error);
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
        
        const data = await invoke<ProjectState>('create_project', { name, path: selectedPath });
        set((state) => {
          if (!data.meta) data.meta = { id: '', title: name, genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' };
          if (!data.globalAssets) data.globalAssets = { characterSheets: [], moodboards: [] };
          if (!data.music) data.music = { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] };
          if (!data.progress) data.progress = { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] };
          if (!data.sequences) data.sequences = [];
          data.cuts = [];
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };
          if (!data.uiState) {
            data.uiState = { sidebarCollapsed: false, timelineZoom: 100, selectedCutId: null, gridColumns: 3, timelineVisible: false } as { sidebarCollapsed: boolean, timelineZoom: number, selectedCutId: string | null, gridColumns: number, timelineVisible?: boolean };
          }
          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        const d = data as {projectPath?: string};
        if (d.projectPath) {
            await invoke('watch_project', { path: d.projectPath }).catch(console.error);
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
        const data = await invoke<ProjectState>('open_project', { path });
        set((state) => {
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
        if (state.project) (state.project.uiState as {timelineVisible?: boolean}).timelineVisible = !(state.project.uiState as {timelineVisible?: boolean}).timelineVisible;
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
        
        const [take] = state.project.sequences[oldPath.s].clips[oldPath.c].takes.splice(oldPath.t, 1);
        
        const tempCuts = [...cuts];
        tempCuts.splice(oldIndex, 1);
        const insertBeforeId = newIndex < tempCuts.length ? tempCuts[newIndex].id : null;
        
        let targetS = 0, targetC = 0, targetT = 0;
        
        if (tempCuts.length === 0) {
           targetS = 0; targetC = 0; targetT = 0;
        } else if (insertBeforeId) {
           const insertPath = findTakePath(state.project.sequences, insertBeforeId);
           if (insertPath) {
             targetS = insertPath.s; targetC = insertPath.c; targetT = insertPath.t;
           } else {
             const lastS = state.project.sequences.length - 1;
             targetS = lastS; targetC = state.project.sequences[lastS].clips.length - 1;
             targetT = state.project.sequences[targetS].clips[targetC].takes.length;
           }
        } else {
           const lastS = state.project.sequences.length - 1;
           targetS = lastS; targetC = state.project.sequences[lastS].clips.length - 1;
           targetT = state.project.sequences[targetS].clips[targetC].takes.length;
        }
        
        state.project.sequences[targetS].clips[targetC].takes.splice(targetT, 0, take);
        
        let indexCounter = 1;
        state.project.sequences.forEach(s => s.clips.forEach(c => c.takes.forEach(t => t.index = indexCounter++)));
        
        syncCuts(state);
      });
    },

    deleteCut: (id) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, id);
        if (path) {
          state.project.sequences[path.s].clips[path.c].takes.splice(path.t, 1);
          let idx = 1;
          state.project.sequences.forEach(s => s.clips.forEach(c => c.takes.forEach(t => t.index = idx++)));
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
          state.project.sequences[path.s].clips[path.c].takes.splice(path.t + 1, 0, newTake);
          let idx = 1;
          state.project.sequences.forEach(s => s.clips.forEach(c => c.takes.forEach(t => t.index = idx++)));
          syncCuts(state);
        }
      });
    },

    updateCut: (id, patch) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, id);
        if (path) {
          Object.assign(path.take, patch);
          if (state.project.cuts) {
             const cut = state.project.cuts.find(c => c.id === id);
             if (cut) Object.assign(cut, patch);
          }
        }
      });
    },

    switchVideoVersion: (cutId, versionId) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, cutId);
        if (path && path.take.video?.versions) {
          path.take.video.versions.forEach(v => {
            v.isSelected = v.versionId === versionId;
          });
          if (state.project.cuts) {
            const cut = state.project.cuts.find(c => c.id === cutId);
            if (cut && cut.video?.versions) {
              cut.video.versions.forEach(v => {
                v.isSelected = v.versionId === versionId;
              });
            }
          }
        }
      });
    },

    currentTime: 0,
    isPlaying: false,
    setCurrentTime: (time) => { set((state) => { state.currentTime = time; }); },
    setIsPlaying: (playing) => { set((state) => { state.isPlaying = playing; }); },
    setTimelineZoom: (zoom) => { set((state) => { if (state.project) state.project.uiState.timelineZoom = zoom; }); },
    
    updateCutTimeline: (cutId, patch) => {
      set((state) => {
        if (!state.project?.sequences) return;
        const path = findTakePath(state.project.sequences, cutId);
        if (path) {
          Object.assign(path.take.timeline, patch);
          if (patch.inPointSec !== undefined || patch.outPointSec !== undefined) {
             const dur = path.take.timeline.outPointSec - path.take.timeline.inPointSec;
             if (dur > 0) path.take.timeline.effectiveDurationSec = dur;
          }
          if (state.project.cuts) {
             const cut = state.project.cuts.find(c => c.id === cutId);
             if (cut) {
               Object.assign(cut.timeline, patch);
               if (patch.inPointSec !== undefined || patch.outPointSec !== undefined) {
                 const dur = cut.timeline.outPointSec - cut.timeline.inPointSec;
                 if (dur > 0) cut.timeline.effectiveDurationSec = dur;
               }
             }
          }
        }
      });
    },
    
    addImportedMedia: (mediaPath, thumbnailPath, durationSec) => {
      set((state) => {
        if (!state.project) return;
        if (!state.project.sequences) state.project.sequences = [];
        
        if (state.project.sequences.length === 0) {
          state.project.sequences.push({ id: `seq_${Date.now()}`, index: 1, clips: [] });
        }
        const lastSeq = state.project.sequences[state.project.sequences.length - 1];
        
        if (lastSeq.clips.length === 0) {
          lastSeq.clips.push({ id: `clip_${Date.now()}`, index: 1, takes: [] });
        }
        const lastClip = lastSeq.clips[lastSeq.clips.length - 1];
        
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
          F0_reference: ''
        };
        
        lastClip.takes.push(newTake);
        syncCuts(state);
      });
    },
  }))
);

// P0-02 completed
