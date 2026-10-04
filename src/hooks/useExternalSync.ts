import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStoryFrameStore } from '@/store';

export function useExternalSync() {
  const { loadProject, project } = useStoryFrameStore();

  useEffect(() => {
    // Listen for file system changes emitted by Tauri backend
    const unlisten = listen('project-file-changed', async (_event) => {
      console.log('External change detected, reloading project...');
      if (project?.projectPath) {
        // Disable auto-save momentarily while reloading to prevent race conditions
        await loadProject(project.projectPath);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [project?.projectPath, loadProject]);
}
