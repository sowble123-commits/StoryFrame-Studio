import { useState, useCallback, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sfMotion } from "@/lib/motion";
import { useStoryFrameStore } from "@/store";
import { Moodboard } from "@/types/project";
import { Plus, Copy, Check, X, Image as ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

export function LocationsPage() {
  const project = useStoryFrameStore((state) => state.project);
  const addMoodboard = useStoryFrameStore((state) => state.addMoodboard);
  const deleteMoodboard = useStoryFrameStore((state) => state.deleteMoodboard);

  const moodboards = project?.globalAssets?.moodboards || [];
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const handleAddDummy = () => {
    const dummyBoard: Moodboard = {
      id: `mood_${Date.now()}`,
      label: `새 장소 ${moodboards.length + 1}`,
      imagePaths: [],
      notes: "",
    };
    addMoodboard(dummyBoard);
    setSelectedBoardId(dummyBoard.id);
  };

  const selectedBoard = moodboards.find((b) => b.id === selectedBoardId);

  return (
    <div className="w-full h-full flex bg-canvas overflow-hidden">
      <motion.div
        {...sfMotion.fade}
        className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-primary">장소 보드</h1>
            <p className="text-secondary mt-1 text-sm">
              작품의 주요 배경과 로케이션, 무드보드를 관리합니다.
            </p>
          </div>
          <button
            onClick={handleAddDummy}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-blue-500/20"
          >
            <Plus size={16} />새 장소
          </button>
        </div>

        {moodboards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 text-tertiary">
            <p>등록된 장소가 없습니다.</p>
            <p className="text-sm mt-2">
              우측 상단의 버튼을 눌러 장소를 추가해보세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 content-start pb-20">
            {moodboards.map((board) => (
              <MoodboardCard
                key={board.id}
                board={board}
                isSelected={selectedBoardId === board.id}
                onClick={() => setSelectedBoardId(board.id)}
              />
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedBoard && (
          <LocationEditorPanel
            key="editor"
            board={selectedBoard}
            onClose={() => setSelectedBoardId(null)}
            onDelete={() => {
              deleteMoodboard(selectedBoard.id);
              setSelectedBoardId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const MoodboardCard = memo(function MoodboardCard({
  board,
  isSelected,
  onClick,
}: {
  board: Moodboard;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!board.notes) {
        toast.error("복사할 장소 노트가 없습니다.");
        return;
      }
      navigator.clipboard.writeText(board.notes);
      setCopied(true);
      toast.success("프롬프트가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    },
    [board.notes],
  );

  const primaryImage = board.imagePaths?.[0];

  return (
    <div
      onClick={onClick}
      className={`flex flex-col bg-surface-0 border rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer ${
        isSelected
          ? "border-accent shadow-blue-500/10"
          : "border-border hover:border-slate-600"
      }`}
    >
      <div className="relative aspect-[3/2] bg-surface-1/50 group overflow-hidden flex items-center justify-center">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={board.label}
            className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-700"
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", primaryImage);
              e.dataTransfer.setData("text/uri-list", primaryImage);
            }}
          />
        ) : (
          <ImageIcon size={32} className="text-slate-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent opacity-60 pointer-events-none" />

        {/* Hover drag indicator */}
        {primaryImage && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            드래그 가능
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1 relative z-10 bg-surface-0">
        <h3
          className="font-bold text-primary truncate text-lg"
          title={board.label}
        >
          {board.label}
        </h3>

        <div
          className="text-xs text-secondary bg-canvas p-3 rounded-lg border border-border flex-1 line-clamp-3 leading-relaxed"
          title={board.notes}
        >
          {board.notes || (
            <span className="italic opacity-40">
              설정된 프롬프트가 없습니다.
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-surface-1 hover:bg-accent text-secondary hover:text-white rounded-lg text-sm font-medium transition-colors mt-2"
        >
          {copied ? (
            <>
              <Check size={16} className="text-emerald-400" />
              <span className="text-emerald-400">복사 완료</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              <span>프롬프트 복사</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});

const LocationEditorPanel = memo(function LocationEditorPanel({
  board,
  onClose,
  onDelete,
}: {
  board: Moodboard;
  onClose: () => void;
  onDelete: () => void;
}) {
  const updateMoodboard = useStoryFrameStore((s) => s.updateMoodboard);

  const [localLabel, setLocalLabel] = useState(board.label);
  const [localNotes, setLocalNotes] = useState(board.notes);

  useEffect(() => {
    setLocalLabel(board.label);
    setLocalNotes(board.notes);
  }, [board.id, board.label, board.notes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localLabel !== board.label || localNotes !== board.notes) {
        updateMoodboard(board.id, {
          label: localLabel,
          notes: localNotes,
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localLabel, localNotes, board.id, board.label, board.notes, updateMoodboard]);

  const handleImageSelect = async () => {
    try {
      const selected = await open({
        multiple: true, // 여러 장소 이미지 허용
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newPaths = [
          ...(board.imagePaths || []),
          ...paths.map((p) => convertFileSrc(p)),
        ];
        updateMoodboard(board.id, { imagePaths: newPaths });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeImage = (indexToRemove: number) => {
    if (!board.imagePaths) return;
    const newPaths = board.imagePaths.filter((_, idx) => idx !== indexToRemove);
    updateMoodboard(board.id, { imagePaths: newPaths });
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-l border-border bg-surface-0 flex flex-col shrink-0"
    >
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <h3 className="font-bold text-primary">장소 설정</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-secondary hover:text-white hover:bg-surface-1 rounded-md transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
            장소 이름
          </label>
          <input
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            className="bg-canvas border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
            placeholder="장소 이름을 입력하세요"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider flex justify-between">
            <span>무드보드 이미지</span>
            <span className="text-tertiary">
              {(board.imagePaths || []).length}장
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(board.imagePaths || []).map((path, idx) => (
              <div
                key={idx}
                className="relative aspect-video rounded-lg overflow-hidden border border-border group"
              >
                <img src={path} className="w-full h-full object-cover" alt="" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 p-1 bg-black/60 rounded text-secondary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={handleImageSelect}
              className="aspect-video rounded-lg border-2 border-dashed border-border-subtle bg-canvas/50 hover:bg-surface-1 hover:border-slate-500 transition-colors flex items-center justify-center text-tertiary hover:text-secondary"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
            배경 프롬프트 (Atmosphere)
          </label>
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            className="bg-canvas border border-border rounded-lg px-3 py-3 text-primary text-sm focus:outline-none focus:border-accent transition-colors min-h-[160px] resize-y"
            placeholder="조명, 시간대, 날씨, 분위기 등 씬에 일관되게 주입할 프롬프트를 적어주세요."
          />
        </div>
      </div>

      <div className="p-4 border-t border-border shrink-0">
        <button
          onClick={() => {
            if (confirm("이 장소를 정말 삭제하시겠습니까?")) {
              onDelete();
            }
          }}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-danger hover:text-white hover:bg-danger/80 rounded-lg text-sm font-medium transition-colors"
        >
          <Trash2 size={16} />
          <span>장소 삭제</span>
        </button>
      </div>
    </motion.div>
  );
});
