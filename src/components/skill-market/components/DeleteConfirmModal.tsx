import { useTranslation } from "react-i18next";
import { ArchiveRestore, Layers, FolderGit2 } from "lucide-react";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import type { Skill } from "../../../types";

interface DeleteConfirmModalProps {
  skill: Skill | null;
  deleteRefs: [string[], string[]] | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * 删除技能确认弹窗 - 展示引用该技能的预设/项目
 */
export default function DeleteConfirmModal({
  skill,
  deleteRefs,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={skill !== null}
      onClose={onClose}
      title={skill ? t("library.deleteTitle", { name: skill.name }) : ""}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {skill?.source_type === "local" ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-slate-950/60 p-3 text-sm text-slate-200">
            <ArchiveRestore className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="leading-relaxed">{t("library.deleteLocalTrashNotice")}</p>
          </div>
        ) : null}

        {deleteRefs === null ? (
          <p className="text-sm text-slate-400 animate-pulse">{t("common.loading")}</p>
        ) : deleteRefs[0].length === 0 && deleteRefs[1].length === 0 ? (
          <p className="text-sm text-slate-300">{t("library.deleteNoRefs")}</p>
        ) : (
          <div className="space-y-3 text-sm text-slate-300">
            <p className="font-medium text-slate-200">{t("library.deleteRefs")}</p>
            {deleteRefs[0].length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <Layers className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">
                    {t("library.deleteRefPresets", { names: deleteRefs[0].join(", ") })}
                  </span>
                </div>
              </div>
            )}
            {deleteRefs[1].length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                <FolderGit2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs text-slate-400 block font-medium">
                    {t("library.deleteRefProjects", { names: deleteRefs[1].join(", ") })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
