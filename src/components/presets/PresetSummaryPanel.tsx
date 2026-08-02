import { GitMerge, Link2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Preset } from "../../types";
import Button from "../ui/Button";
import Card from "../ui/Card";

interface PresetSummaryPanelProps {
  preset: Preset;
  sourcePresets: Preset[];
  directCount: number;
  inheritedCount: number;
  effectiveCount: number;
  isSubmitting: boolean;
  onReuse: () => void;
  onRemoveSource: (presetId: number) => void;
}

export default function PresetSummaryPanel({
  preset,
  sourcePresets,
  directCount,
  inheritedCount,
  effectiveCount,
  isSubmitting,
  onReuse,
  onRemoveSource,
}: PresetSummaryPanelProps) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="active-preset-summary-title">
      <Card hoverEffect={false}>
        <div className="min-w-0">
          <h2
            id="active-preset-summary-title"
            className="text-xl font-bold text-slate-100 break-words"
          >
            {preset.name}
          </h2>
          {preset.description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400 break-words">
              {preset.description}
            </p>
          ) : (
            <p className="mt-1.5 text-xs italic text-slate-500">
              {t("presets.noDescription")}
            </p>
          )}
        </div>

        <div
          role="group"
          aria-label={t("presets.skillComposition")}
          className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-y border-slate-800/80 py-4"
        >
          <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
            <span className="order-2 text-[11px] font-medium text-slate-500">
              {t("presets.directSkills")}
            </span>
            <span className="order-1 font-mono text-lg font-semibold tabular-nums text-emerald-300">
              {directCount}
            </span>
          </div>
          <span aria-hidden="true" className="text-base font-medium text-slate-600">
            +
          </span>
          <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
            <span className="order-2 text-[11px] font-medium text-slate-500">
              {t("presets.inheritedSkills")}
            </span>
            <span className="order-1 font-mono text-lg font-semibold tabular-nums text-sky-300">
              {inheritedCount}
            </span>
          </div>
          <span aria-hidden="true" className="text-base font-medium text-slate-600">
            =
          </span>
          <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
            <span className="order-2 text-[11px] font-medium text-slate-400">
              {t("presets.effectiveSkills")}
            </span>
            <span className="order-1 font-mono text-lg font-semibold tabular-nums text-slate-100">
              {effectiveCount}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-300">
              {t("presets.composedFrom")}
            </p>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              {sourcePresets.length > 0 ? (
                sourcePresets.map((source) => (
                  <span
                    key={source.id}
                    className="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 pl-2.5 pr-1 text-xs text-sky-300"
                  >
                    <Link2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate" title={source.name}>
                      {source.name}
                    </span>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      title={t("presets.unlinkSource", { name: source.name })}
                      aria-label={t("presets.unlinkSource", { name: source.name })}
                      onClick={() => onRemoveSource(source.id)}
                      className="ml-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-sky-400 transition-colors hover:bg-sky-500/20 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">
                  {t("presets.noComposedSources")}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={onReuse}
            disabled={isSubmitting}
            icon={<GitMerge aria-hidden="true" className="h-3.5 w-3.5" />}
            className="w-full shrink-0 sm:w-auto"
          >
            {t("presets.reusePreset")}
          </Button>
        </div>
      </Card>
    </section>
  );
}
