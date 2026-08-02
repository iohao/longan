import { useTranslation } from "react-i18next";
import { Download, FolderOpen, FolderGit2, AlertTriangle, HardDrive } from "lucide-react";
import type { LocalSkillPreview } from "../../types";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Alert from "../ui/Alert";

interface LocalImportTabProps {
  localPath: string | null;
  localPreview: LocalSkillPreview | null;
  importing: boolean;
  error: string | null;
  success: string | null;
  onClearError: () => void;
  onClearSuccess: () => void;
  onPickFolder: () => void;
  onImport: () => void;
}

/**
 * 路径面包屑展示：最后一段高亮为 emerald
 */
function formatPathBreadcrumbs(path: string) {
  const parts = path.split("/");
  return parts.map((part, idx, arr) => (
    <span key={idx} className="inline-flex items-center">
      {idx === arr.length - 1 ? (
        <span className="text-emerald-400">{part}</span>
      ) : (
        <>
          {part}
          <span className="mx-1 text-slate-600">/</span>
        </>
      )}
    </span>
  ));
}

/**
 * 本地导入标签页 - 选择本地目录、预览技能信息并导入
 */
export default function LocalImportTab({
  localPath,
  localPreview,
  importing,
  error,
  success,
  onClearError,
  onClearSuccess,
  onPickFolder,
  onImport,
}: LocalImportTabProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <Card hoverEffect={false} className="p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
          <div className="p-2.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700/60 shrink-0">
            <HardDrive className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {t("install.localTabTitle")}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("install.localTabDesc")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 flex items-center gap-2 px-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
              <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
              <span className={`truncate ${localPath ? "text-slate-200" : "text-slate-500"}`}>
                {localPath ?? t("install.localNoFolder")}
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={onPickFolder}
              icon={<FolderOpen className="w-4 h-4" />}
            >
              {t("install.localPickFolder")}
            </Button>
            <Button
              variant="primary"
              disabled={!localPreview || localPreview.conflict}
              loading={importing}
              onClick={onImport}
              icon={<Download className="w-4 h-4" />}
            >
              {t("install.localImportAction")}
            </Button>
          </div>

          {localPath && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <FolderOpen className="w-4 h-4" />
                <span>{t("install.breadcrumbTitle")}</span>
              </div>
              <div className="text-xs text-slate-300 pt-1">
                {formatPathBreadcrumbs(localPath)}
              </div>
            </div>
          )}

          {localPreview && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <FolderGit2 className="w-4 h-4" />
                <span>{t("install.parsedPreview")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-500 block">{t("install.localFieldName")}</span>
                  <span className="text-emerald-300 font-mono font-medium truncate block">
                    {localPreview.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t("install.localFieldKind")}</span>
                  <span className="text-slate-200 font-medium truncate block">
                    {localPreview.kind === "collection"
                      ? t("install.localKindCollection", { count: localPreview.sub_skills.length })
                      : t("install.localKindSkill")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t("install.localFieldDesc")}</span>
                  <span className="text-slate-200 truncate block">
                    {localPreview.description ?? "—"}
                  </span>
                </div>
              </div>
              {localPreview.conflict && (
                <div className="text-xs text-amber-400/90 flex items-center gap-1.5 pt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("install.localConflict", { name: localPreview.dir_name })}</span>
                </div>
              )}
            </div>
          )}

          {success && (
            <Alert type="success" message={success} onClose={onClearSuccess} duration={4000} />
          )}

          {error && <Alert type="error" message={error} onClose={onClearError} />}
        </div>
      </Card>
    </div>
  );
}
