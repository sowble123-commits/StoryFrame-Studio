import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStoryFrameStore } from '@/store';
import debounce from 'lodash/debounce';

export function useExternalSync() {
  const { mergeProject, project } = useStoryFrameStore();
  
  // Use a ref to keep track of the latest mergeProject and projectPath
  // to avoid re-creating the debounce function on every render
  const mergeRef = useRef(mergeProject);
  const pathRef = useRef(project?.projectPath);

  useEffect(() => {
    mergeRef.current = mergeProject;
    pathRef.current = project?.projectPath;
  }, [mergeProject, project?.projectPath]);

  useEffect(() => {
    const debouncedMerge = debounce(() => {
      const path = pathRef.current;
      if (path) {
        console.log('External change detected, merging project...');
        mergeRef.current(path);
      }
    }, 500);

    // Listen for file system changes emitted by Tauri backend
    const unlistenPromise = listen('project-state-changed', (_event) => {
      debouncedMerge();
    });

    return () => {
      debouncedMerge.cancel();
      unlistenPromise.then(f => f());
    };
  }, []);
}
