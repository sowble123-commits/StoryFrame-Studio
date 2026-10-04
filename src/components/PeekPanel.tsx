import { motion, AnimatePresence } from 'framer-motion';
import { useStoryFrameStore } from '@/store';
import { X } from 'lucide-react';

export function PeekPanel() {
  const { project, setSelectedCutId } = useStoryFrameStore();
  
  const selectedCutId = project?.uiState?.selectedCutId;
  const cut = project?.cuts?.find(c => c.id === selectedCutId);

  return (
    <AnimatePresence>
      {cut && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 right-0 w-80 h-full bg-slate-900 border-l border-slate-800 shadow-2xl z-40 flex flex-col"
        >
          <div className="flex justify-between items-center p-4 border-b border-slate-800">
            <h3 className="text-lg font-medium text-slate-200">
              Cut {String(cut.index).padStart(3, '0')}
            </h3>
            <button 
              onClick={() => setSelectedCutId(null)}
              className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-6">
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">Description</h4>
              <p className="text-sm text-slate-200 bg-slate-950 p-3 rounded border border-slate-800">
                {cut.story.description || 'No description provided.'}
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-2">Details</h4>
              <div className="bg-slate-950 rounded border border-slate-800 p-3 text-sm flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <span className="text-slate-300">{cut.timeline.effectiveDurationSec}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Motion:</span>
                  <span className="text-slate-300 capitalize">{cut.video.motionDifficulty || 'none'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Illustration:</span>
                  <span className="text-slate-300 capitalize">{cut.illustration.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Video:</span>
                  <span className="text-slate-300 capitalize">{cut.video.status}</span>
                </div>
              </div>
            </div>

            {cut.illustration.primaryImagePath && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-2">Primary Image</h4>
                <div className="rounded overflow-hidden border border-slate-800 bg-slate-950">
                  <img src={cut.illustration.primaryImagePath} alt="Primary" className="w-full object-contain" />
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
