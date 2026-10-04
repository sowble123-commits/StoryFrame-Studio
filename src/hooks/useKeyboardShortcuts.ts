import { useEffect } from 'react';
import { useStoryFrameStore } from '@/store';
import { playbackClock, seekTo } from '@/lib/playbackClock';

/** 재생 중에는 스토어 값이 낡았으므로 마스터 클락이 진실의 원천 */
function now() {
  const s = useStoryFrameStore.getState();
  return s.isPlaying ? playbackClock.time : s.currentTime;
}

function seekBy(delta: number) {
  const t = Math.max(0, now() + delta);
  seekTo(t);
  if (!useStoryFrameStore.getState().isPlaying) {
    useStoryFrameStore.getState().setCurrentTime(t);
  }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) return;

      const store = useStoryFrameStore.getState();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          store.setIsPlaying(!store.isPlaying);
          break;
        case 'KeyJ':
          seekBy(-1);
          break;
        case 'KeyL':
          seekBy(1);
          break;
        case 'KeyK':
          store.setIsPlaying(false);
          break;
        case 'KeyI':
        case 'KeyO': {
          const selectedId = store.project?.uiState?.selectedCutId;
          const cut = selectedId ? store.project?.cuts.find((c) => c.id === selectedId) : undefined;
          if (!cut) break;
          const t = now();
          if (e.code === 'KeyI') {
            if (t < cut.timeline.outPointSec) store.updateCutTimeline(cut.id, { inPointSec: Math.max(0, t) });
          } else if (t > cut.timeline.inPointSec) {
            store.updateCutTimeline(cut.id, { outPointSec: t });
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
