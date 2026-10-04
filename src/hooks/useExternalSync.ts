import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStoryFrameStore } from '@/store';
import debounce from 'lodash/debounce';

/**
 * 외부(파일 시스템) 변경 감지 → 프로젝트 병합.
 * - 렌더에 쓰는 값이 없으므로 스토어를 구독하지 않는다 (getState()로 이벤트 시점에만 읽음)
 *   → 스토어 변경으로 인한 불필요한 리렌더링 0회.
 * - 언마운트/경쟁 상태(listen resolve 지연) 및 중복 merge 방지.
 */
export function useExternalSync() {
  useEffect(() => {
    let disposed = false;
    let merging = false;
    let pending = false;
    let unlisten: (() => void) | undefined;

    const runMerge = async () => {
      if (disposed) return;
      const { project, mergeProject } = useStoryFrameStore.getState();
      const path = project?.projectPath;
      if (!path) return;

      // 진행 중이면 끝난 뒤 한 번만 재실행 (trailing)
      if (merging) {
        pending = true;
        return;
      }
      merging = true;
      try {
        await mergeProject(path);
      } catch (err) {
        console.error('[useExternalSync] mergeProject failed:', err);
      } finally {
        merging = false;
        if (pending && !disposed) {
          pending = false;
          void runMerge();
        }
      }
    };

    const debouncedMerge = debounce(() => void runMerge(), 300, { maxWait: 1000 });

    listen('project-state-changed', () => debouncedMerge())
      .then((fn) => {
        // 이미 언마운트됐다면 즉시 해제 (리스너 누수 방지)
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error('[useExternalSync] listen failed:', err));

    return () => {
      disposed = true;
      debouncedMerge.cancel();
      unlisten?.();
    };
  }, []);
}
