import { useState } from "react";
import { ArrowLeftRight, Download, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import ProfileExportPanel from "../components/migration/ProfileExportPanel";
import ProfileImportPanel from "../components/migration/ProfileImportPanel";

type TransferMode = "export" | "import";

interface MigrationPageProps {
  onProfileImported?: () => void | Promise<void>;
  onGoToPresets?: () => void;
}

export default function MigrationPage({ onProfileImported, onGoToPresets }: MigrationPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TransferMode>("export");
  const [importBusy, setImportBusy] = useState(false);

  return (
    <div className="w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <ArrowLeftRight className="size-5" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold text-slate-100">{t("nav.migration")}</h1>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{t("migration.pageDesc")}</p>
        </div>

        <div
          className="grid min-h-11 shrink-0 grid-cols-2 rounded-lg border border-slate-700 bg-slate-900/70 p-1"
          role="group"
          aria-label={t("migration.modeLabel")}
        >
          <ModeButton
            active={mode === "export"}
            disabled={importBusy}
            controls="migration-export-panel"
            onClick={() => setMode("export")}
            icon={<Download className="size-4" />}
          >
            {t("migration.exportMode")}
          </ModeButton>
          <ModeButton
            active={mode === "import"}
            disabled={importBusy}
            controls="migration-import-panel"
            onClick={() => setMode("import")}
            icon={<Upload className="size-4" />}
          >
            {t("migration.importMode")}
          </ModeButton>
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 shadow-sm">
        <div id="migration-export-panel" hidden={mode !== "export"}>
          <ProfileExportPanel />
        </div>
        <div id="migration-import-panel" hidden={mode !== "import"}>
          <ProfileImportPanel
            onBusyChange={setImportBusy}
            onProfileImported={onProfileImported}
            onGoToPresets={onGoToPresets}
          />
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  controls,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  disabled: boolean;
  controls: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
        active
          ? "bg-slate-700 text-slate-50 shadow-sm"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </button>
  );
}
