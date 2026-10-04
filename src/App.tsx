import { AppShell } from '@/components/layout/AppShell';
import { useStoryFrameStore } from '@/store';
import { ProjectHubPage } from '@/views/ProjectHubPage';
import { EditorPage } from '@/views/EditorPage';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import { sfMotion } from '@/lib/motion';

function App() {
  const project = useStoryFrameStore((state) => state.project);
  
  return (
    <ErrorBoundary>
      <AppShell>
        <AnimatePresence mode="wait">
          {project ? (
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
      <Toaster theme="dark" position="bottom-right" />
    </ErrorBoundary>
  );
}

export default App;
