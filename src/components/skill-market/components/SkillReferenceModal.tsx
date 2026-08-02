import { useEffect, useState } from "react";
import { Tag, FolderOpen } from "lucide-react";
import type { Skill, ReferenceDetail } from "../../../types";
import Modal from "../../ui/Modal";
import Badge from "../../ui/Badge";
import { api } from "../../../api";

interface SkillReferenceModalProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function SkillReferenceModal({ skill, isOpen, onClose }: SkillReferenceModalProps) {
  const [details, setDetails] = useState<ReferenceDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && skill) {
      loadReferences();
    }
  }, [isOpen, skill]);

  const loadReferences = async () => {
    if (!skill) return;
    setLoading(true);
    setError(null);
    try {
      const refDetails = await api.skillReferenceDetails(skill.id);
      setDetails(refDetails);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!skill) return null;

  const presetRefs = details.filter((d) => d.type_ === "preset");
  const projectRefs = details.filter((d) => d.type_ === "project");

  return (
    <Modal
      title={`引用详情：${skill.name}`}
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-emerald-400">{details.length}</span>
            {" "}个位置引用了这个技能
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">加载失败：{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-slate-400">加载中...</div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <div className="grid grid-cols-2 gap-4">
            {/* Preset References */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>Preset 引用 ({presetRefs.length})</span>
              </div>
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {presetRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-emerald-500/40 transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5 shrink-0 text-emerald-400/70" />
                    <span className="flex-1 text-sm text-slate-200 truncate">{ref.name}</span>
                  </div>
                ))}
                {presetRefs.length === 0 && (
                  <div className="text-center py-6 px-3">
                    <p className="text-xs text-slate-500">暂无引用</p>
                  </div>
                )}
              </div>
            </div>

            {/* Project References */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <FolderOpen className="w-4 h-4 text-blue-400" />
                <span>项目引用 ({projectRefs.length})</span>
              </div>
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {projectRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-1.5 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-blue-500/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">
                        <FolderOpen className="w-3 h-3" />
                        项目
                      </Badge>
                      <span className="text-sm font-medium text-slate-200">{ref.name}</span>
                    </div>
                    {ref.path && (
                      <p className="text-xs text-slate-400 truncate pl-8" title={ref.path}>
                        {ref.path}
                      </p>
                    )}
                  </div>
                ))}
                {projectRefs.length === 0 && (
                  <div className="text-center py-6 px-3">
                    <p className="text-xs text-slate-500">暂无引用</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
