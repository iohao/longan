import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Package, Trash2, Plus } from "lucide-react";
import type { Skill } from "../../types";
import Badge from "../ui/Badge";
import SkillSourceActions from "../skills/SkillSourceActions";

interface SkillItemProps {
  skill: Skill;
  /** attached: 已关联（点击移除）；available: 可添加（点击关联） */
  variant: "attached" | "available";
  onToggle: (skillId: number) => void;
  onError: (message: string) => void;
}

/**
 * 预设技能行 - 关联/可用两列共用，点击整行切换关联状态
 * 使用 memo 避免切换单个技能时整列无关重渲染
 */
const SkillItem = memo(function SkillItem({
  skill,
  variant,
  onToggle,
  onError,
}: SkillItemProps) {
  const { t } = useTranslation();

  const isAttached = variant === "attached";
  const isNet = skill.source_type === "net" && Boolean(skill.owner && skill.repo);
  const address = isNet ? `${skill.owner}/${skill.repo}` : skill.dir_path;

  const handleToggle = useCallback(() => onToggle(skill.id), [skill.id, onToggle]);

  return (
    <div
      role="button"
      tabIndex={0}
      title={isAttached ? t("presets.removeSkill") : t("presets.addSkill")}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      }}
      className={`group group/row flex items-center justify-between p-2.5 rounded-lg text-xs border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 ${
        isAttached
          ? "bg-emerald-950/20 border-emerald-500/30 text-slate-200 hover:border-rose-500/40 hover:bg-rose-950/15 focus-visible:ring-rose-500/50"
          : "bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-emerald-500/40 hover:bg-emerald-950/15 focus-visible:ring-emerald-500/50"
      }`}
    >
      <div className="min-w-0 flex-1 mr-2">
        <div
          className={`flex items-center gap-1.5 min-w-0 ${
            isAttached ? "font-semibold text-emerald-200" : "font-medium text-slate-300"
          }`}
        >
          {isAttached ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Package className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span className="truncate" title={skill.name}>{skill.name}</span>
        </div>
        <p
          className={`text-[11px] font-mono truncate mt-0.5 ${
            isAttached ? "text-slate-400" : "text-slate-500"
          }`}
          title={`${address}${skill.description ? ` • ${skill.description}` : ""}`}
        >
          {address}
          {skill.description ? ` • ${skill.description}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <SkillSourceActions skill={skill} onError={onError} />
        <Badge variant="neutral" className="text-[10px]">
          {t(`library.source.${skill.source_type}`)}
        </Badge>
        {/* Remove/Add hint, highlighted on row hover */}
        <span
          aria-hidden="true"
          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
            isAttached
              ? "text-rose-400/60 group-hover/row:text-rose-300 group-hover/row:bg-rose-500/15"
              : "text-emerald-400/60 group-hover/row:text-emerald-300 group-hover/row:bg-emerald-500/15"
          }`}
        >
          {isAttached ? <Trash2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </span>
      </div>
    </div>
  );
});

export default SkillItem;
