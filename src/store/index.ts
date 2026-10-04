import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ProjectState } from '@/types/project';
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
  setViewMode: (mode: 'grid' | 'list') => void;
  setProject: (project: ProjectState | null) => void;
  loadProject: (path?: string) => Promise<void>;
  saveProject: (path: string) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  loadRecentProjects: () => Promise<void>;
  toggleSidebar: () => void;
  setSelectedCutId: (id: string | null) => void;
  moveCut: (oldIndex: number, newIndex: number) => void;
  deleteCut: (id: string) => void;
  duplicateCut: (id: string) => void;
  /** PeekPanel 양방향 바인딩: cut의 임의 필드를 부분 업데이트 */
  updateCut: (id: string, patch: Partial<import('@/types/project').Cut>) => void;
  /** 가챠 슬롯: 특정 컷의 비디오 버전 isSelected 스위칭 */
  switchVideoVersion: (cutId: string, versionId: string) => void;

  // Playback state
  currentTime: number;
  isPlaying: boolean;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTimelineZoom: (zoom: number) => void;
  updateCutTimeline: (cutId: string, patch: Partial<import('@/types/project').CutTimeline>) => void;
}

export const useStoryFrameStore = create<StoryFrameStore>()(
  immer((set, get) => ({
    project: null,
    isLoading: false,
    error: null,
    recentProjects: [],
    viewMode: 'grid',
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
      } catch (err: any) {
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
          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
      } catch (err: any) {
        set((state) => {
          state.error = err.toString();
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
          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
      } catch (err: any) {
        set((state) => {
          state.error = err.toString();
          state.isLoading = false;
        });
      }
    },
    saveProject: async (path) => {
      const project = get().project;
      if (!project) return;
      try {
        await invoke('save_project_state', { path, state: project });
      } catch (err: any) {
        set((state) => {
          state.error = err.toString();
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
    setSelectedCutId: (id) => {
      set((state) => {
        if (state.project) {
          state.project.uiState.selectedCutId = id;
        }
      });
    },
    moveCut: (oldIndex, newIndex) => {
      set((state) => {
        if (!state.project || !state.project.cuts) return;
        const cuts = state.project.cuts;
        if (oldIndex < 0 || oldIndex >= cuts.length || newIndex < 0 || newIndex >= cuts.length) return;
        const [movedItem] = cuts.splice(oldIndex, 1);
        cuts.splice(newIndex, 0, movedItem);
        // Update indices
        cuts.forEach((cut, i) => {
          cut.index = i + 1;
        });
      });
    },
    deleteCut: (id) => {
      set((state) => {
        if (!state.project || !state.project.cuts) return;
        state.project.cuts = state.project.cuts.filter(c => c.id !== id);
        if (state.project.uiState.selectedCutId === id) {
          state.project.uiState.selectedCutId = null;
        }
        // Update indices
        state.project.cuts.forEach((cut, i) => {
          cut.index = i + 1;
        });
      });
    },
    duplicateCut: (id) => {
      set((state) => {
        if (!state.project || !state.project.cuts) return;
        const cutIndex = state.project.cuts.findIndex(c => c.id === id);
        if (cutIndex === -1) return;
        
        const cutToDuplicate = state.project.cuts[cutIndex];
        const newCut = JSON.parse(JSON.stringify(cutToDuplicate)); // Deep copy
        newCut.id = `cut_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        state.project.cuts.splice(cutIndex + 1, 0, newCut);
        // Update indices
        state.project.cuts.forEach((cut, i) => {
          cut.index = i + 1;
        });
      });
    },

    updateCut: (id, patch) => {
      set((state) => {
        if (!state.project?.cuts) return;
        const cut = state.project.cuts.find((c) => c.id === id);
        if (!cut) return;
        // immer draft에 shallow merge (중첩 필드는 스프레드)
        Object.assign(cut, patch);
      });
    },

    switchVideoVersion: (cutId, versionId) => {
      set((state) => {
        if (!state.project?.cuts) return;
        const cut = state.project.cuts.find((c) => c.id === cutId);
        if (!cut?.video?.versions) return;
        cut.video.versions.forEach((v) => {
          v.isSelected = v.versionId === versionId;
        });
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
    updateCutTimeline: (cutId, patch) => {
      set((state) => {
        if (!state.project?.cuts) return;
        const cut = state.project.cuts.find((c) => c.id === cutId);
        if (!cut) return;
        Object.assign(cut.timeline, patch);
        if (patch.inPointSec !== undefined || patch.outPointSec !== undefined) {
          const dur = cut.timeline.outPointSec - cut.timeline.inPointSec;
          if (dur > 0) cut.timeline.effectiveDurationSec = dur;
        }
      });
    },
  }))
);
