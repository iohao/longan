import { ArrowRight, Database, FileJson } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TransferManifestProps {
  direction: "export" | "import";
  filename: string;
}

export default function TransferManifest({ direction, filename }: TransferManifestProps) {
  const { t } = useTranslation();
  const library = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
        <Database className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{t("migration.libraryLabel")}</p>
        <p className="truncate text-sm font-medium text-slate-100">Longan</p>
      </div>
    </div>
  );
  const file = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400">
        <FileJson className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{t("migration.profileFileLabel")}</p>
        <p className="truncate font-mono text-sm text-slate-100">{filename}</p>
      </div>
    </div>
  );

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-800 bg-slate-950/30 px-5 py-4 sm:gap-5 sm:px-6">
      {direction === "export" ? library : file}
      <ArrowRight className="size-4 shrink-0 text-slate-600" aria-hidden="true" />
      {direction === "export" ? file : library}
    </div>
  );
}
