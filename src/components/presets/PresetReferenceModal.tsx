import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, FolderOpen, Loader2 } from "lucide-react";

import { api, errorMessage } from "../../api";
import type { Preset, PresetProjectReference } from "../../types";
import Modal from "../ui/Modal";

interface PresetReferenceModalProps {
  preset: Preset | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function PresetReferenceModal({
  preset,
  isOpen,
  onClose,
}: PresetReferenceModalProps) {
  const { t } = useTranslation();
  const [references, setReferences] = useState<PresetProjectReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presetId = preset?.id;

  useEffect(() => {
    if (!isOpen || presetId === undefined) return;

    let active = true;
    setLoading(true);
    setError(null);

    void api.presetProjectReferences(presetId)
      .then((loadedReferences) => {
        if (active) setReferences(loadedReferences);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setReferences([]);
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, presetId]);

  if (!preset) return null;

  return (
    <Modal
      title={t("presets.referenceModalTitle", { name: preset.name })}
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {loading ? (
          <div
            role="status"
            className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-400"
          >
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            <span>{t("common.loading")}</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">
              {t("presets.referenceLoadFailed", { error })}
            </span>
          </div>
        ) : references.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-slate-700/80 px-6 text-center">
            <p className="text-sm text-slate-500">{t("presets.noProjectReferences")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                <FolderOpen className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{t("presets.referencedProjects")}</span>
              </div>
              <span className="shrink-0 font-mono text-xs font-semibold text-emerald-400">
                {references.length}
              </span>
            </div>

            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {references.map((reference) => (
                <div
                  key={reference.id}
                  className="rounded-lg border border-slate-700/60 bg-slate-800/35 px-3 py-2.5 transition-colors hover:border-emerald-500/30"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span className="truncate text-sm font-medium text-slate-200" title={reference.name}>
                      {reference.name}
                    </span>
                  </div>
                  <p
                    className="mt-1 truncate pl-5.5 font-mono text-xs text-slate-500"
                    title={reference.path}
                  >
                    {reference.path}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500">
              {t("presets.referenceSummary", { count: references.length })}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
