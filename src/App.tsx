import { AppShell } from '@/components/layout/AppShell';
import { useStoryFrameStore } from '@/store';
import { ProjectHubPage } from '@/views/ProjectHubPage';
import { EditorPage } from '@/views/EditorPage';

function App() {
  const project = useStoryFrameStore((state) => state.project);
  
  return (
    <AppShell>
      {project ? <EditorPage /> : <ProjectHubPage />}
    </AppShell>
  );
}

export default App;
