import { useEffect, useRef } from 'react';
import { useStoryFrameStore } from '@/store';
import debounce from 'lodash.debounce';

export function useAutoSave() {
  const { project, saveProject } = useStoryFrameStore();
  const saveProjectRef = useRef(saveProject);

  useEffect(() => {
    saveProjectRef.current = saveProject;
  }, [saveProject]);

  useEffect(() => {
    if (!project || !project.projectPath) return;
    
    const debouncedSave = debounce(() => {
      saveProjectRef.current(project.projectPath!);
      
    }, 500);

    debouncedSave();

    return () => {
      debouncedSave.cancel();
    };
  }, [project]); // Triggered whenever project state changes
}
