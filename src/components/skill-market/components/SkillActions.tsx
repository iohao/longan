import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Trash2,
} from "lucide-react";
import type { ListedSkill, Skill, SkillUpdateTask } from "../../../types";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import ReferenceCount from "../../ui/ReferenceCount";
import SkillSourceActions from "../../skills/SkillSourceActions";

interface SkillActionsProps {
  skill: ListedSkill;
  updateTask?: SkillUpdateTask;
  updateDisabled: boolean;
  onUpdate: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onViewReferences: (skill: Skill) => void;
  onActionError: (message: string) => void;
}

/**
 * 已安装技能卡片右侧操作区：状态徽章 + GitHub/本地目录/更新/删除按钮
 */
export default function SkillActions({
  skill,
  updateTask,
  updateDisabled,
  onUpdate,
  onDelete,
  onViewReferences,
  onActionError,
}: SkillActionsProps) {
  const { t } = useTranslation();

  const isUpdateAvailable = skill.status === "update_available";
  const isMissing = skill.status === "missing";
  const updateInProgress = updateTask?.status === "queued" || updateTask?.status === "updating";

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* 仅异常态显示徽章；正常/可更新不再展示标签（可更新信息由更新按钮传达） */}
      {isMissing && (
        <Badge variant="danger">
          <AlertTriangle className="w-3 h-3" />
          <span>{t("library.status.missing")}</span>
        </Badge>
      )}

      {isUpdateAvailable && skill.source_type === "net" && (
        <Button
          size="sm"
          variant="amber"
          loading={updateTask?.status === "updating"}
          disabled={updateInProgress || updateDisabled}
          onClick={() => onUpdate(skill)}
        >
          {updateTask?.status === "queued"
            ? t("library.updateQueued")
            : updateInProgress
              ? t("library.updating")
              : t("library.update")}
        </Button>
      )}

      <SkillSourceActions skill={skill} onError={onActionError}>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={updateInProgress}
          onClick={() => onDelete(skill)}
          title={t("common.delete")}
          aria-label={t("common.delete")}
          icon={<Trash2 className="w-3.5 h-3.5" />}
        />
      </SkillSourceActions>

      <ReferenceCount
        count={skill.reference_count}
        countLabel={t("library.referenceCount", {
          count: skill.reference_count ?? 0,
        })}
        viewLabel={t("library.viewReferences", { name: skill.name })}
        onView={() => onViewReferences(skill)}
      />
    </div>
  );
}
