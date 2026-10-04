import { useEffect } from 'react';
import { useStoryFrameStore } from '@/store';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const store = useStoryFrameStore.getState();

      switch(e.code) {
        case 'Space':
          e.preventDefault();
          store.setIsPlaying(!store.isPlaying);
          break;
        case 'KeyJ':
          store.setCurrentTime(Math.max(0, store.currentTime - 1));
          break;
        case 'KeyL':
          store.setCurrentTime(store.currentTime + 1);
          break;
        case 'KeyK':
          store.setIsPlaying(false);
          break;
        case 'KeyI': {
          // Set In point for selected clip
          const selectedId = store.project?.uiState?.selectedCutId;
          if (selectedId) {
             const cut = store.project?.cuts.find(c => c.id === selectedId);
             if (cut) {
                 store.updateCutTimeline(selectedId, { inPointSec: store.currentTime });
             }
          }
          break;
        }
        case 'KeyO': {
          // Set Out point for selected clip
          const selectedId = store.project?.uiState?.selectedCutId;
          if (selectedId) {
             const cut = store.project?.cuts.find(c => c.id === selectedId);
             if (cut) {
                 store.updateCutTimeline(selectedId, { outPointSec: store.currentTime });
             }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
