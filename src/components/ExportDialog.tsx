import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clips: string[]; // clip paths
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose, clips }) => {
  const [exportType, setExportType] = useState<'roughcut' | 'fcpxml' | 'capcut'>('roughcut');
  const [progress, setProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isExporting) {
      const setupListener = async () => {
        unlisten = await listen<number>('render-progress', (event) => {
          setProgress(event.payload);
        });
      };
      setupListener();
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [isExporting]);

  const handleExport = async () => {
    setIsExporting(true);
    setProgress(0);

    try {
      if (exportType === 'roughcut') {
        const filePath = await save({
          filters: [{ name: 'Video', extensions: ['mp4'] }],
          defaultPath: 'roughcut.mp4',
        });
        
        if (filePath) {
          await invoke('assemble_roughcut', { clips, outputPath: filePath });
          alert('Export Complete!');
        }
      } else if (exportType === 'fcpxml') {
        const filePath = await save({
          filters: [{ name: 'FCPXML', extensions: ['fcpxml'] }],
          defaultPath: 'project.fcpxml',
        });
        
        if (filePath) {
          await invoke('export_fcpxml', { clips, outputPath: filePath });
          alert('FCPXML Export Complete!');
        }
      } else if (exportType === 'capcut') {
        const filePath = await save({
          filters: [{ name: 'JSON', extensions: ['json'] }],
          defaultPath: 'draft_content.json',
        });
        
        if (filePath) {
          await invoke('export_capcut', { clips, outputPath: filePath });
          alert('CapCut Export Complete!');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Export Failed: ' + err);
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 text-black shadow-lg">
        <h2 className="text-xl font-bold mb-4">Export Project</h2>
        
        <div className="flex flex-col gap-3 mb-6">
          <label className="flex items-center gap-2">
            <input 
              type="radio" 
              name="exportType" 
              value="roughcut" 
              checked={exportType === 'roughcut'} 
              onChange={() => setExportType('roughcut')} 
            />
            Roughcut Video (.mp4)
          </label>
          <label className="flex items-center gap-2">
            <input 
              type="radio" 
              name="exportType" 
              value="fcpxml" 
              checked={exportType === 'fcpxml'} 
              onChange={() => setExportType('fcpxml')} 
            />
            FCPXML
          </label>
          <label className="flex items-center gap-2">
            <input 
              type="radio" 
              name="exportType" 
              value="capcut" 
              checked={exportType === 'capcut'} 
              onChange={() => setExportType('capcut')} 
            />
            CapCut
          </label>
        </div>

        {isExporting && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm mt-1 text-center">{progress}%</p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button 
            className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
