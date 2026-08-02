import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FolderOpen,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../../api";
import type { ImportResult, ProfileImportPreview, ProfileImportSkill } from "../../types";
import Button from "../ui/Button";
import TransferManifest from "./TransferManifest";

interface ProfileImportPanelProps {
  onBusyChange: (busy: boolean) => void;
  onProfileImported?: () => void | Promise<void>;
  onGoToPresets?: () => void;
}

export default function ProfileImportPanel({
  onBusyChange,
  onProfileImported,
  onGoToPresets,
}: ProfileImportPanelProps) {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [profileJson, setProfileJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProfileImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [stage, setStage] = useState<"reading" | "previewing" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const busy = stage !== null;
  const presetCount = preview ? preview.new_presets.length + preview.replaced_presets.length : 0;

  const reset = () => {
    setSelectedFile(null);
    setProfileJson(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setStage(null);
    if (inputRef.current) inputRef.current.value = "";
    onBusyChange(false);
  };

  const inspectFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError(t("migration.invalidFileType"));
      setPreview(null);
      return;
    }

    setSelectedFile(file);
    setPreview(null);
    setResult(null);
    setError(null);
    setStage("reading");
    onBusyChange(true);
    try {
      const content = await file.text();
      setProfileJson(content);
      setStage("previewing");
      const nextPreview = await api.previewProfileImport(content);
      setPreview(nextPreview);
    } catch (cause) {
      setProfileJson(null);
      setError(errorMessage(cause));
    } finally {
      setStage(null);
      onBusyChange(false);
    }
  };

  const handleImport = async () => {
    if (!profileJson || !preview || busy) return;
    setStage("importing");
    setError(null);
    onBusyChange(true);
    try {
      const importResult = await api.importProfile(profileJson);
      setResult(importResult);
      await onProfileImported?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setStage(null);
      onBusyChange(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void inspectFile(file);
  };

  return (
    <section aria-labelledby="import-panel-title">
      <TransferManifest direction="import" filename={selectedFile?.name ?? "longan-profile.json"} />
      <div className="p-5 sm:p-6">
        <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 id="import-panel-title" className="text-lg font-semibold text-slate-100">
              {result ? t("migration.importResultHeading") : t("migration.importHeading")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {result ? t("migration.importResultSummary") : t("migration.importSummary")}
            </p>
          </div>
          {selectedFile && !result ? (
            <Button variant="ghost" size="sm" className="min-h-11 self-start" disabled={busy} onClick={reset} icon={<RotateCcw className="size-4" />}>
              {t("migration.chooseAnother")}
            </Button>
          ) : null}
        </div>

        {result ? (
          <ImportResultView result={result} onReset={reset} onGoToPresets={onGoToPresets} />
        ) : preview ? (
          <ImportPreviewView
            preview={preview}
            filename={selectedFile?.name ?? ""}
            locale={i18n.language}
            importing={stage === "importing"}
            error={error}
            presetCount={presetCount}
            onImport={() => void handleImport()}
          />
        ) : (
          <div>
            <input
              ref={inputRef}
              id="profile-import-file"
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label={t("migration.browseFile")}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void inspectFile(file);
              }}
            />
            <div
              className={`flex min-h-56 flex-col items-center justify-center border border-dashed px-6 py-10 text-center transition-colors duration-150 ${
                dragActive
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-slate-700 bg-slate-950/20"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
            >
              {busy ? (
                <>
                  <Loader2 className="size-8 animate-spin text-emerald-400 motion-reduce:animate-none" aria-hidden="true" />
                  <p className="mt-4 text-sm font-medium text-slate-200" role="status">
                    {stage === "reading" ? t("migration.readingFile") : t("migration.previewingFile")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{selectedFile?.name}</p>
                </>
              ) : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400">
                    <FileJson className="size-6" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-medium text-slate-200">{t("migration.dropFileTitle")}</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{t("migration.dropFileHint")}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-5 min-h-11"
                    onClick={() => inputRef.current?.click()}
                    icon={<FolderOpen className="size-4" />}
                  >
                    {t("migration.browseFile")}
                  </Button>
                </>
              )}
            </div>
            {error ? (
              <div className="mt-4 flex items-start gap-2 border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

interface ImportPreviewViewProps {
  preview: ProfileImportPreview;
  filename: string;
  locale: string;
  importing: boolean;
  error: string | null;
  presetCount: number;
  onImport: () => void;
}

function ImportPreviewView({
  preview,
  filename,
  locale,
  importing,
  error,
  presetCount,
  onImport,
}: ImportPreviewViewProps) {
  const { t } = useTranslation();
  const hasWarnings = preview.missing_skills.length > 0 || preview.unresolved_preset_skills.length > 0;
  const replacesPresets = preview.replaced_presets.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-800 py-3 text-xs text-slate-400">
        <span className="font-mono text-slate-200">{filename}</span>
        <span>{t("migration.versionValue", { version: preview.version })}</span>
        <span>{t("migration.exportedAt", { date: formatProfileDate(preview.export_date, locale) })}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 border border-slate-800 [&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0">
        <ImpactMetric tone="success" label={t("migration.matchedSkills")} value={preview.matched_skills.length} />
        <ImpactMetric tone="warning" label={t("migration.missingSkills")} value={preview.missing_skills.length} />
        <ImpactMetric tone="info" label={t("migration.newPresets")} value={preview.new_presets.length} />
        <ImpactMetric tone="warning" label={t("migration.replacedPresets")} value={preview.replaced_presets.length} />
      </div>

      {replacesPresets ? (
        <div className="mt-5 flex items-start gap-3 border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("migration.overwriteWarning", { count: preview.replaced_presets.length })}</span>
        </div>
      ) : null}
      {hasWarnings ? (
        <div className="mt-3 flex items-start gap-3 border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>{t("migration.missingWarning")}</span>
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-slate-800 border-y border-slate-800">
        <PreviewDetails title={t("migration.matchedSkills")} items={preview.matched_skills} />
        <PreviewDetails title={t("migration.missingSkills")} items={preview.missing_skills} />
        <NameDetails title={t("migration.newPresets")} items={preview.new_presets} />
        <NameDetails title={t("migration.replacedPresets")} items={preview.replaced_presets} />
        <IssueDetails preview={preview} />
      </div>

      {error ? (
        <div className="mt-4 text-sm text-rose-400" role="alert">{error}</div>
      ) : null}
      <div className="mt-6 flex justify-end">
        <Button
          variant="primary"
          size="lg"
          disabled={importing || presetCount === 0}
          loading={importing}
          onClick={onImport}
          icon={<Upload className="size-4" />}
        >
          {importing
            ? t("migration.importing")
            : preview.replaced_presets.length > 0
              ? t("migration.importAndOverwrite", { count: presetCount })
              : t("migration.importAction", { count: presetCount })}
        </Button>
      </div>
    </div>
  );
}

function ImportResultView({
  result,
  onReset,
  onGoToPresets,
}: {
  result: ImportResult;
  onReset: () => void;
  onGoToPresets?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-start gap-4 border-y border-emerald-500/20 bg-emerald-500/5 px-4 py-5" role="status">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-slate-100">{t("migration.importComplete")}</p>
          <p className="mt-1 text-sm text-slate-400">
            {t("migration.importCompleteSummary", {
              presets: result.created_presets.length,
              skills: result.skipped_skills.length,
            })}
          </p>
        </div>
      </div>
      {result.unresolved_preset_skills.length > 0 ? (
        <details className="mt-5 border-y border-slate-800 py-3">
          <summary className="cursor-pointer text-sm font-medium text-amber-300">
            {t("migration.unresolvedCount", { count: result.unresolved_preset_skills.length })}
          </summary>
          <ul className="mt-3 space-y-1.5 pl-5 font-mono text-xs text-slate-400">
            {result.unresolved_preset_skills.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="min-h-11" onClick={onReset} icon={<RotateCcw className="size-4" />}>
          {t("migration.importAnother")}
        </Button>
        {onGoToPresets ? (
          <Button variant="primary" className="min-h-11" onClick={onGoToPresets}>
            {t("migration.viewPresets")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ImpactMetric({
  tone,
  label,
  value,
}: {
  tone: "success" | "warning" | "info";
  label: string;
  value: number;
}) {
  const toneClass = tone === "success" ? "text-emerald-400" : tone === "warning" ? "text-amber-400" : "text-sky-400";
  return (
    <div className="border-slate-800 px-4 py-4 even:border-l lg:border-l lg:first:border-l-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function PreviewDetails({ title, items }: { title: string; items: ProfileImportSkill[] }) {
  if (items.length === 0) return null;
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">{title} <span className="ml-1 font-mono text-slate-500">{items.length}</span></summary>
      <ul className="mt-3 space-y-2 pl-4">
        {items.map((item) => (
          <li key={item.dir_path} className="min-w-0 text-xs text-slate-400">
            <span className="text-slate-200">{item.name}</span>
            <span className="ml-2 break-all font-mono text-slate-500">{item.dir_path}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function NameDetails({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">{title} <span className="ml-1 font-mono text-slate-500">{items.length}</span></summary>
      <p className="mt-3 pl-4 text-xs text-slate-400">{items.join(", ")}</p>
    </details>
  );
}

function IssueDetails({ preview }: { preview: ProfileImportPreview }) {
  const { t } = useTranslation();
  const items = preview.unresolved_preset_skills;
  if (items.length === 0) return null;
  return (
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-amber-300">{t("migration.unresolvedAssignments")} <span className="ml-1 font-mono">{items.length}</span></summary>
      <ul className="mt-3 space-y-2 pl-4 font-mono text-xs text-slate-400">
        {items.map((item) => <li key={`${item.preset_name}:${item.skill_ref}`}>{item.preset_name}: {item.skill_ref}</li>)}
      </ul>
    </details>
  );
}

function formatProfileDate(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}
