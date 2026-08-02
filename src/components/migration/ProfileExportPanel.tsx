import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../../api";
import type { ExportProfile } from "../../types";
import Button from "../ui/Button";
import TransferManifest from "./TransferManifest";

const exportFilename = () => `longan-profile-${new Date().toISOString().split("T")[0]}.json`;

export default function ProfileExportPanel() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [profile, setProfile] = useState<ExportProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filename = exportFilename();

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedPath(null);
    setActionError(null);
    try {
      const profileJson = await api.exportProfile();
      setSnapshot(profileJson);
      setProfile(JSON.parse(profileJson) as ExportProfile);
    } catch (cause) {
      setSnapshot(null);
      setProfile(null);
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const handleExport = async () => {
    if (!snapshot || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const path = await api.saveFileDialog({
        title: t("migration.saveDialogTitle"),
        defaultPath: filename,
        filters: [{ name: t("migration.jsonFileType"), extensions: ["json"] }],
      });
      if (!path) return;
      setSavedPath(null);
      await api.saveProfileFile(path, snapshot);
      setSavedPath(path);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async () => {
    if (!savedPath || revealing) return;
    setRevealing(true);
    setActionError(null);
    try {
      await api.revealFile(savedPath);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setRevealing(false);
    }
  };

  return (
    <section aria-labelledby="export-panel-title">
      <TransferManifest direction="export" filename={filename} />
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="p-5 sm:p-6 lg:border-r lg:border-slate-800">
          <div className="mb-6">
            <h2 id="export-panel-title" className="text-lg font-semibold text-slate-100">
              {t("migration.exportHeading")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {t("migration.exportSummary")}
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-400" role="status">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t("migration.preparingSnapshot")}
            </div>
          ) : error ? (
            <div className="flex min-h-32 flex-col items-start justify-center gap-3" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => void loadSnapshot()} icon={<RefreshCw className="size-4" />}>
                {t("migration.retry")}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 border-y border-slate-800 [&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0">
                <Metric label={t("migration.skillsLabel")} value={profile?.skills.length ?? 0} />
                <Metric label={t("migration.presetsLabel")} value={profile?.presets.length ?? 0} />
                <Metric label={t("migration.localFilesLabel")} value={t("migration.notIncluded")} />
                <Metric label={t("migration.projectsAgentsLabel")} value={t("migration.notIncluded")} />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ScopeRow icon={<Archive className="size-4" />} text={t("migration.exportIncludes")} />
                <ScopeRow icon={<ShieldCheck className="size-4" />} text={t("migration.exportPortableNote")} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col justify-between gap-6 border-t border-slate-800 bg-slate-950/20 p-5 sm:p-6 lg:border-t-0">
          <div>
            <p className="text-xs font-medium text-slate-500">{t("migration.readyFile")}</p>
            <p className="mt-2 truncate font-mono text-xs text-slate-200" title={filename}>{filename}</p>
          </div>
          <div>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading || !snapshot || revealing}
              loading={saving}
              onClick={() => void handleExport()}
              icon={<Save className="size-4" />}
            >
              {saving ? t("migration.saving") : t("migration.exportAction")}
            </Button>
            {savedPath ? (
              <div className="mt-4 border-t border-slate-800 pt-4" aria-live="polite">
                <div className="flex items-start gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium">{t("migration.exportComplete")}</p>
                    <p className="mt-1 break-all font-mono leading-5 text-slate-400" title={savedPath}>
                      {savedPath}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 min-h-11 w-full"
                  loading={revealing}
                  onClick={() => void handleReveal()}
                  icon={<FolderOpen className="size-4" />}
                >
                  {t("migration.showInFolder")}
                </Button>
              </div>
            ) : null}
            {actionError ? (
              <div className="mt-3 flex items-start gap-2 text-left text-xs leading-5 text-rose-400" role="alert">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="break-words">{actionError}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-slate-800 px-3 py-4 even:border-l lg:border-l lg:first:border-l-0">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-base font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ScopeRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-5 text-slate-400">
      <span className="mt-0.5 shrink-0 text-emerald-400">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
