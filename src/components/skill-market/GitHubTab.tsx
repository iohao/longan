import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download, AlertCircle, FolderGit2 } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Card from "../ui/Card";
import GithubIcon from "../icons/GithubIcon";
import { parseGitHubInput } from "../../utils/url";

interface GitHubTabProps {
  urlInput: string;
  setUrlInput: (value: string) => void;
  onInstall: () => void;
}

/**
 * GitHub 导入标签页 - URL 解析预览 + 直接安装
 */
export default function GitHubTab({
  urlInput,
  setUrlInput,
  onInstall,
}: GitHubTabProps) {
  const { t } = useTranslation();

  // 🔥 PERFORMANCE: 每次 render 只解析一次输入
  const parsed = useMemo(() => parseGitHubInput(urlInput), [urlInput]);

  return (
    <div className="space-y-6">
      <Card hoverEffect={false} className="p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
          <div className="p-2.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700/60 shrink-0">
            <GithubIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {t("install.githubTabTitle")}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("install.githubModalDesc")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Input
              icon={<GithubIcon className="w-4 h-4 text-slate-400" />}
              placeholder="https://github.com/owner/repo/tree/main/skill-id"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && parsed?.isValid) {
                  onInstall();
                }
              }}
              autoFocus
            />
            <Button
              variant="primary"
              disabled={!parsed?.isValid}
              onClick={onInstall}
              icon={<Download className="w-4 h-4" />}
            >
              {t("common.install")}
            </Button>
          </div>

          {urlInput.trim() && !parsed?.isValid && (
            <div className="text-xs text-amber-400/90 flex items-center gap-1.5 pt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{t("install.invalidGithubUrl")}</span>
            </div>
          )}

          {parsed?.isValid && (
            <div className="relative p-4 rounded-xl overflow-hidden group">
              {/* Background gradient shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Actual content with backdrop blur */}
              <div className="relative p-4 rounded-xl bg-slate-900/95 border border-emerald-500/30 backdrop-blur-xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <FolderGit2 className="w-4 h-4" />
                  <span>{t("install.parsedPreview")}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block">Owner</span>
                    <span className="text-slate-200 font-mono font-medium truncate block">
                      {parsed.owner}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Repository</span>
                    <span className="text-slate-200 font-mono font-medium truncate block">
                      {parsed.repo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Skill ID</span>
                    <span className="text-emerald-300 font-mono font-medium truncate block">
                      {parsed.skillId}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </Card>
    </div>
  );
}
