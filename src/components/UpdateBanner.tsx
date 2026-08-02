import { useTranslation } from "react-i18next";
import { Download, Loader2, ArrowUpCircle } from "lucide-react";
import { useAppUpdate } from "../context/UpdateContext";

function formatByteCount(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function UpdateBanner() {
  const { t } = useTranslation();
  const {
    availableUpdate,
    isInstallingUpdate,
    updateDownloadedBytes,
    updateContentLength,
    installUpdate,
  } = useAppUpdate();

  if (!availableUpdate) return null;

  const version = availableUpdate.version;
  const pubDate = availableUpdate.date
    ? new Date(availableUpdate.date).toLocaleDateString()
    : null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600/15 via-emerald-500/10 to-teal-500/15 border-b border-emerald-500/30 px-6 py-3 text-slate-100 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-30">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
          <ArrowUpCircle className="w-5 h-5 animate-pulse text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-100">
              {t("settings.appUpdateAvailableBanner", { version })}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
              New
            </span>
          </div>
          {pubDate && (
            <p className="text-xs text-slate-400 mt-0.5">
              {t("settings.publishedAt")}: {pubDate}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isInstallingUpdate && updateContentLength ? (
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <div className="w-32 bg-slate-900 rounded-full h-2 overflow-hidden border border-emerald-500/30">
              <div
                className="bg-emerald-400 h-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((updateDownloadedBytes / updateContentLength) * 100)
                  )}%`,
                }}
              />
            </div>
            <span>
              {formatByteCount(updateDownloadedBytes)} / {formatByteCount(updateContentLength)}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={installUpdate}
          disabled={isInstallingUpdate}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white shadow-md shadow-emerald-900/30 border border-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isInstallingUpdate ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t("settings.installingUpdate")}</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>{t("settings.downloadAndInstall")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
