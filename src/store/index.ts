import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ProjectState } from '@/types/project';
import { invoke } from '@tauri-apps/api/core';

interface StoryFrameStore {
  project: ProjectState | null;
  isLoading: boolean;
  error: string | null;
  setProject: (project: ProjectState) => void;
  loadProject: (path: string) => Promise<void>;
  saveProject: (path: string) => Promise<void>;
  toggleSidebar: () => void;
}

export const useStoryFrameStore = create<StoryFrameStore>()(
  immer((set, get) => ({
    project: null,
    isLoading: false,
    error: null,
    setProject: (project) => {
      set((state) => {
        state.project = project;
      });
    },
    loadProject: async (path) => {
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
  }))
);
