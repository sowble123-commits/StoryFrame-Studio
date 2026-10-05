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
  /** 외부 변경 감지 시 병합을 위한 액션 */
  mergeProject: (path: string) => Promise<void>;
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
          // Fallbacks for legacy/incomplete project.json
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
          if (!data.cuts) data.cuts = [];
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };

          if (!data.uiState) {
            data.uiState = { sidebarCollapsed: false, timelineZoom: 100, selectedCutId: null, gridColumns: 3, timelineVisible: false } as any;
          } else {
            data.uiState.sidebarCollapsed = data.uiState.sidebarCollapsed ?? false;
            data.uiState.timelineZoom = data.uiState.timelineZoom ?? 100;
            data.uiState.selectedCutId = data.uiState.selectedCutId ?? null;
            data.uiState.gridColumns = data.uiState.gridColumns ?? 3;
            (data.uiState as any).timelineVisible = (data.uiState as any).timelineVisible ?? false;
          }
          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        if ((data as any).projectPath) {
            await invoke('watch_project', { path: (data as any).projectPath }).catch(console.error);
        }
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
          if (!data.meta) data.meta = { id: '', title: name, genre: '', createdAt: '', updatedAt: '', synopsis: '', targetDurationSec: 0, thumbnailPath: '' };
          if (!data.globalAssets) data.globalAssets = { characterSheets: [], moodboards: [] };
          if (!data.music) data.music = { filePath: '', durationSec: 0, bpm: 120, waveformCachePath: '', beatMarkers: [], sections: [] };
          if (!data.progress) data.progress = { phase: '', totalCuts: 0, completedCuts: 0, pendingTasks: [] };
          if (!data.cuts) data.cuts = [];
          if (!data.roughCut) data.roughCut = { lastAssembledAt: '', outputPath: '', totalDurationSec: 0, cutOrder: [] };
          if (!data.uiState) {
            data.uiState = { sidebarCollapsed: false, timelineZoom: 100, selectedCutId: null, gridColumns: 3, timelineVisible: false } as any;
          } else {
            data.uiState.sidebarCollapsed = data.uiState.sidebarCollapsed ?? false;
            data.uiState.timelineZoom = data.uiState.timelineZoom ?? 100;
            data.uiState.selectedCutId = data.uiState.selectedCutId ?? null;
            data.uiState.gridColumns = data.uiState.gridColumns ?? 3;
            (data.uiState as any).timelineVisible = (data.uiState as any).timelineVisible ?? false;
          }

          state.project = data;
          state.isLoading = false;
        });
        get().loadRecentProjects();
        if ((data as any).projectPath) {
            await invoke('watch_project', { path: (data as any).projectPath }).catch(console.error);
        }
      } catch (err: any) {
        set((state) => {
          state.error = err.toString();
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
            // Ensure selectedCutId still exists
            if (state.project.uiState.selectedCutId) {
              const exists = state.project.cuts.some(c => c.id === state.project!.uiState.selectedCutId);
              if (!exists) state.project.uiState.selectedCutId = null;
            }
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
    toggleTimeline: () => {
      set((state) => {
        if (state.project) {
          (state.project.uiState as any).timelineVisible = !(state.project.uiState as any).timelineVisible;
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
