import { useState, useCallback, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sfMotion } from "@/lib/motion";
import { useStoryFrameStore } from "@/store";
import { CharacterSheet } from "@/types/project";
import { Plus, Copy, Check, X, Image as ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";

export function CharactersPage() {
  const project = useStoryFrameStore((state) => state.project);
  const addCharacterSheet = useStoryFrameStore(
    (state) => state.addCharacterSheet,
  );
  const deleteCharacterSheet = useStoryFrameStore(
    (state) => state.deleteCharacterSheet,
  );

  const characterSheets = project?.globalAssets?.characterSheets || [];
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);

  const handleAddDummy = () => {
    const dummySheet: CharacterSheet = {
      id: `char_${Date.now()}`,
      name: `새 캐릭터 ${characterSheets.length + 1}`,
      frontRefPath: "",
      sideRefPath: "",
      styleNotes: "",
    };
    addCharacterSheet(dummySheet);
    setSelectedCharId(dummySheet.id);
  };

  const selectedChar = characterSheets.find((c) => c.id === selectedCharId);

  return (
    <div className="w-full h-full flex bg-canvas overflow-hidden">
      <motion.div
        {...sfMotion.fade}
        className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar"
      >
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-primary">캐릭터 보드</h1>
            <p className="text-secondary mt-1 text-sm">
              작품에 등장하는 캐릭터들의 메타데이터와 레퍼런스를 통합
              관리합니다.
            </p>
          </div>
          <button
            onClick={handleAddDummy}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent text-white rounded-lg transition-colors font-medium text-sm shadow-lg shadow-blue-500/20"
          >
            <Plus size={16} />새 캐릭터
          </button>
        </div>

        {characterSheets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 text-tertiary">
            <p>등록된 캐릭터가 없습니다.</p>
            <p className="text-sm mt-2">
              우측 상단의 버튼을 눌러 캐릭터를 추가해보세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 content-start pb-20">
            {characterSheets.map((sheet) => (
              <CharacterCard
                key={sheet.id}
                sheet={sheet}
                isSelected={selectedCharId === sheet.id}
                onClick={() => setSelectedCharId(sheet.id)}
              />
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedChar && (
          <CharacterEditorPanel
            key="editor"
            sheet={selectedChar}
            onClose={() => setSelectedCharId(null)}
            onDelete={() => {
              deleteCharacterSheet(selectedChar.id);
              setSelectedCharId(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const CharacterCard = memo(function CharacterCard({
  sheet,
  isSelected,
  onClick,
}: {
  sheet: CharacterSheet;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!sheet.styleNotes) {
        toast.error("복사할 스타일 노트가 없습니다.");
        return;
      }
      navigator.clipboard.writeText(sheet.styleNotes);
      setCopied(true);
      toast.success("프롬프트가 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2000);
    },
    [sheet.styleNotes],
  );

  return (
    <div
      onClick={onClick}
      className={`flex flex-col bg-surface-0 border rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer ${
        isSelected
          ? "border-accent shadow-blue-500/10"
          : "border-border hover:border-slate-600"
      }`}
    >
      <div className="relative aspect-[3/4] bg-surface-1/50 group overflow-hidden flex items-center justify-center">
        {sheet.frontRefPath ? (
          <img
            src={sheet.frontRefPath}
            alt={sheet.name}
            className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-700"
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", sheet.frontRefPath);
              e.dataTransfer.setData("text/uri-list", sheet.frontRefPath);
            }}
          />
        ) : (
          <ImageIcon size={32} className="text-slate-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent opacity-60 pointer-events-none" />

        {/* Hover drag indicator */}
        {sheet.frontRefPath && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            드래그 가능
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1 relative z-10 bg-surface-0">
        <h3
          className="font-bold text-primary truncate text-lg"
          title={sheet.name}
        >
          {sheet.name}
        </h3>

        <div
          className="text-xs text-secondary bg-canvas p-3 rounded-lg border border-border flex-1 line-clamp-3 leading-relaxed"
          title={sheet.styleNotes}
        >
          {sheet.styleNotes || (
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

const CharacterEditorPanel = memo(function CharacterEditorPanel({
  sheet,
  onClose,
  onDelete,
}: {
  sheet: CharacterSheet;
  onClose: () => void;
  onDelete: () => void;
}) {
  const updateCharacterSheet = useStoryFrameStore(
    (s) => s.updateCharacterSheet,
  );

  const [localName, setLocalName] = useState(sheet.name);
  const [localStyleNotes, setLocalStyleNotes] = useState(sheet.styleNotes);

  useEffect(() => {
    setLocalName(sheet.name);
    setLocalStyleNotes(sheet.styleNotes);
  }, [sheet.id, sheet.name, sheet.styleNotes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localName !== sheet.name || localStyleNotes !== sheet.styleNotes) {
        updateCharacterSheet(sheet.id, {
          name: localName,
          styleNotes: localStyleNotes,
        });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localName, localStyleNotes, sheet.id, sheet.name, sheet.styleNotes, updateCharacterSheet]);

  const handleImageSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (selected && typeof selected === "string") {
        updateCharacterSheet(sheet.id, {
          frontRefPath: convertFileSrc(selected),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-l border-border bg-surface-0 flex flex-col shrink-0"
    >
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <h3 className="font-bold text-primary">캐릭터 설정</h3>
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
            캐릭터 이름
          </label>
          <input
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="bg-canvas border border-border rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent transition-colors"
            placeholder="캐릭터 이름을 입력하세요"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
            대표 이미지 (메인 레퍼런스)
          </label>
          <div
            onClick={handleImageSelect}
            className="aspect-square rounded-xl border-2 border-dashed border-border-subtle bg-canvas/50 hover:bg-surface-1 hover:border-slate-500 transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden group"
          >
            {sheet.frontRefPath ? (
              <img
                src={sheet.frontRefPath}
                className="w-full h-full object-cover"
                alt=""
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-tertiary group-hover:text-secondary">
                <ImageIcon size={32} />
                <span className="text-xs font-medium">
                  클릭하여 이미지 선택
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
            외형 프롬프트 (Style Notes)
          </label>
          <textarea
            value={localStyleNotes}
            onChange={(e) => setLocalStyleNotes(e.target.value)}
            className="bg-canvas border border-border rounded-lg px-3 py-3 text-primary text-sm focus:outline-none focus:border-accent transition-colors min-h-[160px] resize-y"
            placeholder="AI 생성 시 주입할 캐릭터 외형, 의상, 특징 프롬프트를 상세히 적어주세요."
          />
        </div>
      </div>

      <div className="p-4 border-t border-border shrink-0">
        <button
          onClick={() => {
            if (confirm("이 캐릭터를 정말 삭제하시겠습니까?")) {
              onDelete();
            }
          }}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-danger hover:text-white hover:bg-danger/80 rounded-lg text-sm font-medium transition-colors"
        >
          <Trash2 size={16} />
          <span>캐릭터 삭제</span>
        </button>
      </div>
    </motion.div>
  );
});

// verified P2-02
