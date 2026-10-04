import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useStoryFrameStore } from '@/store';
import { ProjectHubPage } from '@/views/ProjectHubPage';
import { EditorPage } from '@/views/EditorPage';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

function App() {
  const hasProject = useStoryFrameStore((state) => !!state.project);
  // 에러 후 복구: key를 바꿔 ErrorBoundary 서브트리를 새로 마운트 (앱 전체 리로드 불필요)
  const [resetKey, setResetKey] = useState(0);
  const handleReset = useCallback(() => setResetKey((k) => k + 1), []);

  return (
    <>
      <ErrorBoundary key={resetKey} onReset={handleReset}>
        <AppShell>
          <AnimatePresence mode="wait">
            {hasProject ? (
              <motion.div key="editor" {...sfMotion.fade} className="w-full h-full flex flex-col overflow-hidden">
                <EditorPage />
              </motion.div>
            ) : (
              <motion.div key="hub" {...sfMotion.fade} className="w-full h-full flex flex-col overflow-hidden">
                <ProjectHubPage />
              </motion.div>
            )}
          </AnimatePresence>
        </AppShell>
      </ErrorBoundary>

      {/* 경계 밖에 배치: 렌더 크래시 중에도 토스트(에러 안내) 유지 */}
      <Toaster
        theme="dark"
        position="bottom-right"
        closeButton
        visibleToasts={4}
        containerAriaLabel="알림"
        toastOptions={{ duration: 4000, closeButton: true }}
      />
    </>
  );
}

export default App;
