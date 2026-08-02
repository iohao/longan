import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Settings,
  Languages,
  Key,
  FolderOpen,
  Stethoscope,
  Code2,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Palette,
  Sun,
  Moon,
  Monitor,
  Loader2,
  XCircle,
  Info,
  GitFork,
  Share2,
  ExternalLink,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { BrokenLink, StorageInfo } from "../types";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import AnchoredSectionTabs from "../components/ui/AnchoredSectionTabs";
import { ThemeMode, getStoredTheme, applyTheme } from "../utils/theme";
import { useDebugMode } from "../context/DebugModeContext";
import { useAppUpdate } from "../context/UpdateContext";

const GITHUB_REPOSITORY_URL = "https://github.com/iohao/longan";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { debugMode, toggleDebugMode } = useDebugMode();
  const { currentVersion, availableUpdate } = useAppUpdate();

  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [broken, setBroken] = useState<BrokenLink[] | null>(null);
  const [fixedCount, setFixedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [customStoragePath, setCustomStoragePath] = useState("");
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isSettingStorageDir, setIsSettingStorageDir] = useState(false);
  const [repositoryCopied, setRepositoryCopied] = useState(false);

  const latestVersion = availableUpdate?.version ?? currentVersion ?? "-";
  const latestVersionPublishedAt = availableUpdate?.date
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language).format(
        new Date(availableUpdate.date)
      )
    : "-";

  async function shareRepository() {
    try {
      await navigator.clipboard.writeText(
        t("settings.repositoryShareMessage", { url: GITHUB_REPOSITORY_URL })
      );
      setRepositoryCopied(true);
      setTimeout(() => setRepositoryCopied(false), 2000);
    } catch {
      setError(t("settings.repositoryCopyFailed"));
      setTimeout(() => setError(null), 3000);
    }
  }

  async function applyStoragePath() {
    setError(null);
    
    try {
      setIsSettingStorageDir(true);
      const info = await api.setStorageDir(customStoragePath);
      setStorageInfo(info);
      setNotice(t("settings.storageRestartNotice"));
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSettingStorageDir(false);
    }
  }

  async function resetToDefault() {
    if (!confirm(t("settings.confirmResetStorage"))) {
      return;
    }
    
    setError(null);
    try {
      setIsSettingStorageDir(true);
      const info = await api.setStorageDir("");
      setStorageInfo(info);
      setCustomStoragePath("");
      setNotice(t("settings.storageRestartNotice"));
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSettingStorageDir(false);
    }
  }

  useEffect(() => {
    api.getStorageDir().then((info) => {
      setStorageInfo(info);
      setCustomStoragePath(info.isDefault ? "" : info.configuredDir);
    }).catch(() => {});
  }, []);

  const toggleDebugModeSetting = (checked: boolean) => {
    toggleDebugMode(checked);
  };

  useEffect(() => {
    api
      .getSetting("github_token")
      .then((v) => setToken(v ?? ""))
      .catch(() => {});

    api
      .getSetting("theme")
      .then((v) => {
        if (v === "dark" || v === "light" || v === "system") {
          setTheme(v);
          applyTheme(v);
        }
      })
      .catch(() => {});
  }, []);

  async function changeLanguage(lang: string) {
    setError(null);
    try {
      await i18n.changeLanguage(lang);
      localStorage.setItem("app_language", lang);
      await api.setSetting("language", lang);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function changeTheme(nextTheme: ThemeMode) {
    setError(null);
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      await api.setSetting("theme", nextTheme);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveToken() {
    const normalizedToken = token.trim();

    setError(null);
    setValidationError(null);
    setTokenValid(null);

    if (!normalizedToken) {
      try {
        await api.setSetting("github_token", "");
        setTokenSaved(true);
        setTimeout(() => setTokenSaved(false), 2000);
      } catch (e) {
        setError(errorMessage(e));
      }
      return;
    }

    setTokenValidating(true);
    try {
      try {
        const result = await api.verifyGithubToken(normalizedToken);
        setTokenValid(result);
        if (!result) {
          setValidationError(t("settings.tokenInvalid"));
          return;
        }
      } catch (e) {
        setValidationError(errorMessage(e));
        setTokenValid(false);
        return;
      }

      try {
        await api.setSetting("github_token", normalizedToken);
        setTokenSaved(true);
        setTimeout(() => setTokenSaved(false), 2000);
      } catch (e) {
        setError(errorMessage(e));
      }
    } finally {
      setTokenValidating(false);
    }
  }

  async function scan() {
    setError(null);
    setFixedCount(null);
    try {
      setBroken(await api.doctorScan());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function fix() {
    setError(null);
    try {
      setFixedCount(await api.doctorFix());
      setBroken(await api.doctorScan());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Settings className="w-3.5 h-3.5" />
          <span>Console Configuration</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          {t("nav.settings")}
        </h1>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 侧边导航 + 滚动内容区:tab 与 section 由同一份配置渲染,天然一一对应 */}
      <AnchoredSectionTabs
        sections={[
          // 1. Language Preferences
          {
            id: "language",
            label: t("settings.language"),
            icon: Languages,
            content: (
            <Card hoverEffect={false}>
              <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Languages className="w-4 h-4 text-emerald-400" />
                <span>{t("settings.language")}</span>
              </h2>
              <div className="flex gap-2">
                {[
                  { key: "zh", label: "中文 (Chinese)" },
                  { key: "en", label: "English" },
                ].map((l) => {
                  const active = i18n.language === l.key;
                  return (
                    <button
                      key={l.key}
                      onClick={() => changeLanguage(l.key)}
                      className={`text-xs px-4 py-2 rounded-xl font-medium border transition-all ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </Card>
            ),
          },

          // 2. Theme Preferences
          {
            id: "theme",
            label: t("settings.theme"),
            icon: Palette,
            content: (
            <Card hoverEffect={false}>
              <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" />
                <span>{t("settings.theme")}</span>
              </h2>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                {t("settings.themeHint")}
              </p>
              <div className="flex gap-2">
                {[
                  { key: "dark", label: t("settings.themeDark"), icon: Moon },
                  { key: "light", label: t("settings.themeLight"), icon: Sun },
                  { key: "system", label: t("settings.themeSystem"), icon: Monitor },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = theme === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => changeTheme(item.key as ThemeMode)}
                      className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium border transition-all ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
            ),
          },

          // 3. GitHub API Token
          {
            id: "githubToken",
            label: t("settings.githubToken"),
            icon: Key,
            content: (
            <Card hoverEffect={false}>
              <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>{t("settings.githubToken")}</span>
              </h2>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                {t("settings.githubTokenHint")}
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setTokenSaved(false);
                      setTokenValid(null);
                      setValidationError(null);
                    }}
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={t(showPassword ? "settings.hideToken" : "settings.showToken")}
                        title={t(showPassword ? "settings.hideToken" : "settings.showToken")}
                        className="text-slate-500 hover:text-slate-300 focus:outline-none"
                      >
                        {showPassword ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                    }
                  />
                </div>
                <Button
                  variant={tokenSaved ? "primary" : "secondary"}
                  onClick={saveToken}
                  disabled={tokenValidating}
                  icon={
                    tokenValidating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : tokenSaved ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : undefined
                  }
                >
                  {tokenValidating
                    ? t("settings.validating")
                    : tokenSaved
                      ? "Saved"
                      : t("common.save")}
                </Button>
              </div>

              {/* Validation status */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {tokenValid === true && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t("settings.tokenValid")}</span>
                  </div>
                )}

                {tokenValid === false && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {validationError ?? t("settings.tokenInvalid")}
                    </span>
                  </div>
                )}

                {/* Help Link */}
                {!tokenValid && (
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors text-xs"
                  >
                    <span>{t("settings.githubTokenGetLink")}</span>
                    <span className="font-medium">{t("settings.githubTokenLearnMore")}</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3 h-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M6.293 9.293A1 1 0 017 9h4v3H8V9H6.293z" />
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.5-13a.5.5 0 01.5.5v5.586l3.793 3.793a.5.5 0 11-.708.708l-4-4a.5.5 0 01-.146-.354V5.5a.5.5 0 01.5-.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                )}
              </div>
            </Card>
            ),
          },

          // 4. Storage Directory
          {
            id: "storage",
            label: t("settings.storageTitle"),
            icon: FolderOpen,
            content: (
            <Card hoverEffect={false}>
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">
                    {t("settings.storageTitle")}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("settings.customStorageHint")}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400">
                    {t("settings.storagePathLabel")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="/path/to/storage"
                      value={customStoragePath}
                      onChange={(_) => {
                        // 禁止手动输入，清空内容
                        setCustomStoragePath("");
                        setError(t("settings.manualInputNotAllowed"));
                        setTimeout(() => setError(null), 3000);
                      }}
                      disabled={true}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        api.selectDirectory().then((path) => {
                          if (path) {
                            setCustomStoragePath(path);
                          }
                        }).catch((e) => {
                          if (typeof e === "string") {
                            setError(e);
                          } else if (e && typeof e === "object" && "message" in e) {
                            setError(String((e as { message: unknown }).message));
                          }
                        });
                      }}
                      icon={<FolderOpen className="w-3.5 h-3.5" />}
                      disabled={isSettingStorageDir}
                    >
                      {t("settings.browse")}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={applyStoragePath}
                      disabled={!customStoragePath || isSettingStorageDir}
                      icon={
                        isSettingStorageDir ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : undefined
                      }
                    >
                      {t("settings.applyStoragePath")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetToDefault}
                      disabled={isSettingStorageDir || storageInfo?.isDefault}
                    >
                      {t("settings.resetToDefault")}
                    </Button>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <div className="break-all font-mono">
                      {t("settings.currentStoragePath")}: {storageInfo?.currentDir ?? t("common.loading")}
                    </div>
                    {storageInfo?.restartRequired && (
                      <div className="break-all font-mono text-amber-400">
                        {t("settings.nextStoragePath")}: {storageInfo.configuredDir}
                      </div>
                    )}
                  </div>

                  {storageInfo?.restartRequired && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                      {t("settings.storageRestartHint")}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        api.openConsoleDir().catch((e) => setError(errorMessage(e)))
                      }
                      icon={<FolderOpen className="w-3.5 h-3.5" />}
                    >
                      {t("settings.openStorageDir")}
                    </Button>
                  </div>

                </div>
              </div>
            </Card>
            ),
          },

          // 5. Developer Mode
          {
            id: "developer",
            label: t("settings.developer"),
            icon: Code2,
            content: (
            <Card hoverEffect={false}>
              <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-sky-400" />
                <span>{t("settings.developer")}</span>
              </h2>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-emerald-600 rounded bg-slate-900 border-slate-700 focus:ring-emerald-500"
                    checked={debugMode}
                    onChange={(e) => toggleDebugModeSetting(e.target.checked)}
                  />
                  <div className="flex flex-col ml-2">
                    <span className="text-sm font-medium text-slate-200">
                      Debug Mode
                    </span>
                  </div>
                </label>
                <div className="border-t border-slate-800 pt-4">
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-emerald-400" />
                    <span>{t("settings.doctor")}</span>
                  </h3>
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={scan}
                      icon={<Stethoscope className="w-3.5 h-3.5" />}
                    >
                      {t("settings.doctorScan")}
                    </Button>
                    {broken !== null && broken.length > 0 && (
                      <Button variant="amber" size="sm" onClick={fix}>
                        {t("settings.doctorFix")}
                      </Button>
                    )}
                  </div>

                  {fixedCount !== null && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{t("settings.doctorFixed", { count: fixedCount })}</span>
                    </div>
                  )}

                  {broken !== null && (
                    <>
                      {broken.length === 0 ? (
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{t("settings.doctorNone")}</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Badge variant="warning">
                            <AlertTriangle className="w-3 h-3" />
                            <span>
                              {t("settings.doctorFound", { count: broken.length })}
                            </span>
                          </Badge>
                          <ul className="text-xs font-mono text-slate-400 bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1 overflow-x-auto">
                            {broken.map((b) => (
                              <li key={b.link_path} className="truncate">
                                <span className="text-slate-300 font-semibold">
                                  {b.project_name}
                                </span>
                                : {b.link_path} →{" "}
                                <span className="text-rose-400">{b.target}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
            ),
          },

          // 6. About
          {
            id: "about",
            label: t("settings.aboutTitle"),
            icon: Info,
            content: (
            <Card hoverEffect={false}>
              <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <span>{t("settings.aboutTitle")}</span>
              </h2>

              <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/60">
                <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      {t("settings.currentVersion")}
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-slate-200">
                      {currentVersion ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      {t("settings.latestVersion")}
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-emerald-400">
                      {latestVersion}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500">
                      {t("settings.publishedAt")}
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-slate-300">
                      {latestVersionPublishedAt}
                    </dd>
                  </div>
                </dl>

                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <GitFork className="h-4 w-4 text-slate-400" />
                    <span>{t("settings.sourceRepository")}</span>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 break-all font-mono text-xs text-slate-300">
                      {GITHUB_REPOSITORY_URL}
                    </span>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          openUrl(GITHUB_REPOSITORY_URL).catch((e) =>
                            setError(errorMessage(e))
                          )
                        }
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                      >
                        {t("settings.openRepository")}
                      </Button>
                      <Button
                        variant={repositoryCopied ? "primary" : "secondary"}
                        size="sm"
                        onClick={shareRepository}
                        icon={
                          repositoryCopied ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Share2 className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        {repositoryCopied
                          ? t("settings.repositoryCopied")
                          : t("settings.shareRepository")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
