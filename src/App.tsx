import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TitleBar } from '@/components/layout/TitleBar';
import { useStoryFrameStore } from '@/store';
import { ProjectHubPage } from '@/views/ProjectHubPage';
import { EditorPage } from '@/views/EditorPage';
import { AudioPage } from '@/views/AudioPage';
import { SettingsPage } from '@/views/SettingsPage';
import { CharactersPage } from '@/views/CharactersPage';
import { LocationsPage } from '@/views/LocationsPage';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

function App() {
  const hasProject = useStoryFrameStore((state) => !!state.project);
  const currentTab = useStoryFrameStore((state) => state.currentTab);
  // 에러 후 복구: key를 바꿔 ErrorBoundary 서브트리를 새로 마운트 (앱 전체 리로드 불필요)
  const [resetKey, setResetKey] = useState(0);
  const handleReset = useCallback(() => setResetKey((k) => k + 1), []);

  return (
    <>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
        <TitleBar />
        <ErrorBoundary key={resetKey} onReset={handleReset}>
          <AppShell>
            <AnimatePresence mode="wait">
              {hasProject ? (
                <motion.div key="editor" {...sfMotion.fade} className="w-full h-full flex flex-col overflow-hidden relative">
                  {/* Keep-alive 라우팅: 상태 유지를 위해 언마운트하지 않고 display로 제어 */}
                  <div className={currentTab === 'cuts' ? 'flex-1 overflow-hidden' : 'hidden'}>
                    <EditorPage />
                  </div>
                  <div className={currentTab === 'characters' ? 'flex-1 overflow-hidden' : 'hidden'}>
                    <CharactersPage />
                  </div>
                  <div className={currentTab === 'locations' ? 'flex-1 overflow-hidden' : 'hidden'}>
                    <LocationsPage />
                  </div>
                  <div className={currentTab === 'audio' ? 'flex-1 overflow-hidden' : 'hidden'}>
                    <AudioPage />
                  </div>
                  <div className={currentTab === 'settings' ? 'flex-1 overflow-hidden' : 'hidden'}>
                    <SettingsPage />
                  </div>
                </motion.div>
              ) : (
                <motion.div key="hub" {...sfMotion.fade} className="w-full h-full flex flex-col overflow-hidden">
                  <ProjectHubPage />
                </motion.div>
              )}
            </AnimatePresence>
          </AppShell>
        </ErrorBoundary>
      </div>

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
