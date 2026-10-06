import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ProjectState, Sequence, Clip, Take, CutFrame, Cut, CharacterSheet } from '@/types/project';
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
  currentTab: 'cuts' | 'audio' | 'characters' | 'locations' | 'settings';
  setCurrentTab: (tab: 'cuts' | 'audio' | 'characters' | 'locations' | 'settings') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setProject: (project: ProjectState | null) => void;
  loadProject: (path?: string) => Promise<void>;
  closeProject: () => void;
  saveProject: (path: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadRecentProjects: () => Promise<void>;
  toggleSidebar: () => void;
  toggleTimeline: () => void;
  setSelectedIds: (sequenceId: string | null, clipId: string | null, takeId: string | null, frameId: string | null) => void;
  
  // Sequence / Clip / Take / Frame actions
  addSequence: (sequence: Sequence) => void;
  deleteSequence: (sequenceId: string) => void;
  moveSequence: (oldIndex: number, newIndex: number) => void;
  
  addClip: (sequenceId: string, clip: Clip) => void;
  deleteClip: (sequenceId: string, clipId: string) => void;
  moveClip: (sequenceId: string, oldIndex: number, newIndex: number) => void;

  addTake: (sequenceId: string, clipId: string, take: Take) => void;
  deleteTake: (sequenceId: string, clipId: string, takeId: string) => void;

  updateFrame: (sequenceId: string, clipId: string, takeId: string, frameId: string, patch: Partial<CutFrame>) => void;

  mergeProject: (path: string) => Promise<void>;

  // Playback state
  currentTime: number;
  isPlaying: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTimelineZoom: (zoom: number) => void;

  // Deprecated methods for Phase 0 compilation
  moveCut: (oldIndex: number, newIndex: number) => void;
  deleteCut: (id: string) => void;
  duplicateCut: (id: string) => void;
  updateCut: (id: string, patch: Partial<Cut>) => void;
  switchVideoVersion: (cutId: string, versionId: string) => void;
  updateCutTimeline: (cutId: string, patch: unknown) => void;
  addImportedMedia: (mediaPath: string, thumbnailPath: string, durationSec: number) => void;
  setSelectedCutId: (id: string | null) => void;
  
  // Character Sheets
  addCharacterSheet: (sheet: CharacterSheet) => void;
}

const defaultUiState = {
  selectedSequenceId: null,
  selectedClipId: null,
  selectedTakeId: null,
  selectedFrameId: null,
  selectedCutId: null,
  sidebarCollapsed: false,
  timelineZoom: 100,
  gridColumns: 3
};

export const useStoryFrameStore = create<StoryFrameStore>()(
  immer((set, get) => ({
    project: null,
    isLoading: false,
    error: null,
    recentProjects: [],
    viewMode: 'grid',
    currentTab: 'cuts',
    setCurrentTab: (tab) => {
      set((state) => {
        state.currentTab = tab;
      });
    },
    setViewMode: (mode) => {
      set((state) => {
        state.viewMode = mode;
      });
    },
    setProject: (project) => {
      set((state) => {
        state.project = project;
      });
    },
    loadRecentProjects: async () => {
      try {
        const recents = await invoke<RecentProject[]>('list_recent_projects');
        set((state) => {
          state.recentProjects = recents;
        });
      } catch (err: unknown) {
        console.error('Failed to load recent projects:', err);
      }
    },
    loadProject: async (path?: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });
      try {
        const data = await invoke<ProjectState>('open_project', { path });
        set((state) => {
          if (!data.meta) {
            data.meta = { id: '', title: 'Untitled', genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' };
          }
          if (!data.globalAssets) {
            data.globalAssets = { characterSheets: [], moodboards: [] };
          }
          if (!data.music) {
            data.music = { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] };
          }
          if (!data.progress) {
            data.progress = { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] };
          }
          if (!data.sequences) data.sequences = [];
          if (!data.cuts) data.cuts = [];
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };
          if (!data.uiState) {
            data.uiState = { ...defaultUiState };
          }

          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        if (data.projectPath) {
            await invoke('watch_project', { path: data.projectPath }).catch(console.error);
        }
      } catch (err: unknown) {
        set((state) => {
          state.error = String(err);
          state.isLoading = false;
        });
      }
    },
    createProject: async (name: string) => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });
      try {
        const selectedPath = await open({
          directory: true,
          multiple: false,
        });
        if (!selectedPath) {
          set((state) => { state.isLoading = false; });
          return;
        }
        
        const data = await invoke<ProjectState>('create_project', { 
          name, 
          path: selectedPath 
        });
        
        set((state) => {
          if (!data.meta) data.meta = { id: '', title: name, genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' };
          if (!data.globalAssets) data.globalAssets = { characterSheets: [], moodboards: [] };
          if (!data.music) data.music = { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] };
          if (!data.progress) data.progress = { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] };
          if (!data.sequences) data.sequences = [];
          if (!data.cuts) data.cuts = [];
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };
          if (!data.uiState) {
            data.uiState = { ...defaultUiState };
          }

          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        if (data.projectPath) {
            await invoke('watch_project', { path: data.projectPath }).catch(console.error);
        }
      } catch (err: unknown) {
        set((state) => {
          state.error = String(err);
          state.isLoading = false;
        });
      }
    },
    closeProject: () => {
      set((state) => {
        state.project = null;
        state.error = null;
      });
    },
    mergeProject: async (path) => {
      try {
        const data = await invoke<ProjectState>('open_project', { path });
        set((state) => {
          if (state.project) {
            const currentUiState = state.project.uiState;
            state.project = data;
            state.project.uiState = { ...data.uiState, ...currentUiState };
          } else {
            state.project = data;
          }
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
        set((state) => {
          state.error = String(err);
        });
      }
    },
    toggleSidebar: () => {
      set((state) => {
        if (state.project) {
          state.project.uiState.sidebarCollapsed = !state.project.uiState.sidebarCollapsed;
        }
      });
    },
    toggleTimeline: () => {
      set((state) => {
        if (state.project) {
          // not used right now
        }
      });
    },
    setSelectedIds: (sequenceId, clipId, takeId, frameId) => {
      set((state) => {
        if (state.project) {
          state.project.uiState.selectedSequenceId = sequenceId;
          state.project.uiState.selectedClipId = clipId;
          state.project.uiState.selectedTakeId = takeId;
          state.project.uiState.selectedFrameId = frameId;
        }
      });
    },
    
    addSequence: (sequence) => {
      set((state) => {
        state.project?.sequences.push(sequence);
      });
    },
    deleteSequence: (sequenceId) => {
      set((state) => {
        const sequences = state.project?.sequences;
        if (!sequences) return;
        const index = sequences.findIndex(s => s.id === sequenceId);
        if (index !== -1) sequences.splice(index, 1);
      });
    },
    moveSequence: (oldIndex, newIndex) => {
      set((state) => {
        const sequences = state.project?.sequences;
        if (!sequences) return;
        if (oldIndex < 0 || oldIndex >= sequences.length || newIndex < 0 || newIndex >= sequences.length) return;
        const [movedItem] = sequences.splice(oldIndex, 1);
        sequences.splice(newIndex, 0, movedItem);
      });
    },
    
    addClip: (sequenceId, clip) => {
      set((state) => {
        const seq = state.project?.sequences.find(s => s.id === sequenceId);
        if (seq) seq.clips.push(clip);
      });
    },
    deleteClip: (sequenceId, clipId) => {
      set((state) => {
        const seq = state.project?.sequences.find(s => s.id === sequenceId);
        if (!seq) return;
        const index = seq.clips.findIndex(c => c.id === clipId);
        if (index !== -1) seq.clips.splice(index, 1);
      });
    },
    moveClip: (sequenceId, oldIndex, newIndex) => {
      set((state) => {
        const seq = state.project?.sequences.find(s => s.id === sequenceId);
        if (!seq) return;
        const clips = seq.clips;
        if (oldIndex < 0 || oldIndex >= clips.length || newIndex < 0 || newIndex >= clips.length) return;
        const [movedItem] = clips.splice(oldIndex, 1);
        clips.splice(newIndex, 0, movedItem);
      });
    },

    addTake: (sequenceId, clipId, take) => {
      set((state) => {
        const clip = state.project?.sequences.find(s => s.id === sequenceId)?.clips.find(c => c.id === clipId);
        if (clip) clip.takes.push(take);
      });
    },
    deleteTake: (sequenceId, clipId, takeId) => {
      set((state) => {
        const clip = state.project?.sequences.find(s => s.id === sequenceId)?.clips.find(c => c.id === clipId);
        if (!clip) return;
        const index = clip.takes.findIndex(t => t.id === takeId);
        if (index !== -1) clip.takes.splice(index, 1);
      });
    },

    updateFrame: (sequenceId, clipId, takeId, frameId, patch) => {
      set((state) => {
        const frame = state.project?.sequences
          .find(s => s.id === sequenceId)?.clips
          .find(c => c.id === clipId)?.takes
          .find(t => t.id === takeId)?.frames
          .find(f => f.id === frameId);
        
        if (frame) {
          Object.assign(frame, patch);
        }
      });
    },

    currentTime: 0,
    isPlaying: false,
    setCurrentTime: (time) => {
      set((state) => {
        state.currentTime = time;
      });
    },
    setIsPlaying: (playing) => {
      set((state) => {
        state.isPlaying = playing;
      });
    },
    setTimelineZoom: (zoom) => {
      set((state) => {
        if (state.project) {
          state.project.uiState.timelineZoom = zoom;
        }
      });
    },

    // Deprecated dummies
    moveCut: () => { throw new Error('Deprecated in Phase 0'); },
    deleteCut: () => { throw new Error('Deprecated in Phase 0'); },
    duplicateCut: () => { throw new Error('Deprecated in Phase 0'); },
    updateCut: () => { throw new Error('Deprecated in Phase 0'); },
    switchVideoVersion: () => { throw new Error('Deprecated in Phase 0'); },
    updateCutTimeline: () => { throw new Error('Deprecated in Phase 0'); },
    addImportedMedia: () => { throw new Error('Deprecated in Phase 0'); },
    setSelectedCutId: (id) => {
      set((state) => {
        if (state.project) state.project.uiState.selectedCutId = id;
      });
    },

    addCharacterSheet: (sheet) => {
      set((state) => {
        if (state.project && state.project.globalAssets) {
          state.project.globalAssets.characterSheets.push(sheet);
        }
      });
    }
  }))
);

// P0-02 Completed
