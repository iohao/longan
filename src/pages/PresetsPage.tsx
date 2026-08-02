import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Package,
  Search,
  CheckCircle2,
  PlusCircle,
  ChevronUp,
  ChevronDown,
  Pencil,
  X,
  Link2,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { Preset, PresetReuseMode, Skill } from "../types";
import { useDebounce } from "../utils/debounce";
import { buildInheritedSkillGroups, replacePresetDirectSkills } from "../utils/presets";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import ReferenceCount from "../components/ui/ReferenceCount";
import Modal from "../components/ui/Modal";
import SkillItem from "../components/presets/SkillItem";
import SkillSourceActions from "../components/skills/SkillSourceActions";
import PresetSummaryPanel from "../components/presets/PresetSummaryPanel";
import PresetReuseSelector from "../components/presets/PresetReuseSelector";
import PresetReferenceModal from "../components/presets/PresetReferenceModal";

const PRESET_ORDER_SETTING_KEY = "preset_order";

interface PresetsPageProps {
  onPresetsChanged?: () => void;
}

export default function PresetsPage({ onPresetsChanged }: PresetsPageProps) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  
  // Search query for Preset List
  const [presetSearchQuery, setPresetSearchQuery] = useState("");
  // Search query for Skill Grid
  const [skillSearchQuery, setSkillSearchQuery] = useState("");

  // Preset order array of IDs
  const [presetOrder, setPresetOrder] = useState<number[]>([]);

  // Modal States
  const [presetModal, setPresetModal] = useState<
    { mode: "create" } | { mode: "edit"; preset: Preset } | null
  >(null);
  const [deletingPreset, setDeletingPreset] = useState<Preset | null>(null);
  const [viewingReferences, setViewingReferences] = useState<Preset | null>(null);
  const [reuseModalOpen, setReuseModalOpen] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formReuseMode, setFormReuseMode] = useState<PresetReuseMode>("link");
  const [formSourcePresetIds, setFormSourcePresetIds] = useState<number[]>([]);
  const [reuseMode, setReuseMode] = useState<PresetReuseMode>("link");
  const [reuseSourcePresetIds, setReuseSourcePresetIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load presets, skills (rescans local skills on initial load), and saved order
  const reload = useCallback(async () => {
    try {
      const [ps, ss, savedOrderStr] = await Promise.all([
        api.listPresets(),
        api.rescanLocal(),
        api.getSetting(PRESET_ORDER_SETTING_KEY),
      ]);
      setPresets(ps);
      setSkills(ss);

      let savedOrder: number[] = [];
      if (savedOrderStr) {
        try {
          savedOrder = JSON.parse(savedOrderStr);
        } catch {
          savedOrder = [];
        }
      }
      // Drop stale IDs of deleted presets; the next reorder persists the clean list
      setPresetOrder(savedOrder.filter((id) => ps.some((p) => p.id === id)));

      // Keep current active preset if valid, or default to first preset
      setActivePresetId((currentId) => {
        if (currentId !== null && ps.some((p) => p.id === currentId)) {
          return currentId;
        }
        return ps.length > 0 ? ps[0].id : null;
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Performance optimization: Use object lookup instead of new Map() to reduce prototype overhead
  const sortedPresets = useMemo(() => {
    if (presetOrder.length === 0) return presets;
    
    const orderMap: Record<number, number> = {};
    presetOrder.forEach((id, index) => {
      orderMap[id] = index;
    });
    
    return [...presets].sort((a, b) => {
      const orderA = orderMap.hasOwnProperty(a.id) ? orderMap[a.id] : Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.hasOwnProperty(b.id) ? orderMap[b.id] : Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [presets, presetOrder]);

  // Filtered Presets by Search Query
  const filteredPresets = useMemo(() => {
    if (!presetSearchQuery.trim()) return sortedPresets;
    const q = presetSearchQuery.toLowerCase();
    return sortedPresets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [sortedPresets, presetSearchQuery]);

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId) || null,
    [presets, activePresetId]
  );

  // Persistence for Preset Order
  const savePresetOrder = async (newOrder: number[]) => {
    setPresetOrder(newOrder);
    try {
      await api.setSetting(PRESET_ORDER_SETTING_KEY, JSON.stringify(newOrder));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const movePreset = async (presetId: number, direction: "up" | "down") => {
    const currentList = sortedPresets.map((p) => p.id);
    const index = currentList.indexOf(presetId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;

    // Swap IDs
    const newOrder = [...currentList];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    await savePresetOrder(newOrder);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setFormName("");
    setFormDesc("");
    setFormReuseMode("link");
    setFormSourcePresetIds([]);
    setError(null);
    setPresetModal({ mode: "create" });
  };

  // Open Edit Modal
  const openEditModal = (p: Preset) => {
    setFormName(p.name);
    setFormDesc(p.description || "");
    setError(null);
    setPresetModal({ mode: "edit", preset: p });
  };

  // Create or update depending on modal mode
  async function submitPresetForm() {
    if (!presetModal) return;
    const n = formName.trim();
    if (!n) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (presetModal.mode === "create") {
        const newId = await api.createPreset(
          n,
          formDesc.trim() || undefined,
          formSourcePresetIds,
          formSourcePresetIds.length > 0 ? formReuseMode : undefined,
        );
        setPresetModal(null);
        setFormName("");
        setFormDesc("");
        await reload();
        setActivePresetId(newId);
      } else {
        await api.updatePreset(presetModal.preset.id, n, formDesc.trim() || undefined);
        setPresetModal(null);
        setFormName("");
        setFormDesc("");
        await reload();
      }
      onPresetsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removePreset() {
    if (!deletingPreset) return;
    setError(null);
    try {
      await api.deletePreset(deletingPreset.id);
      setDeletingPreset(null);
      await reload();
      onPresetsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleSkill(p: Preset, skillId: number) {
    const next = p.direct_skill_ids.includes(skillId)
      ? p.direct_skill_ids.filter((id) => id !== skillId)
      : [...p.direct_skill_ids, skillId];

    // Optimistic UI update to prevent lag and page jumps
    setPresets((prev) => replacePresetDirectSkills(prev, p.id, next));
    setError(null);
    try {
      await api.setPresetSkills(p.id, next);
      onPresetsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
      await reload();
    }
  }

  function openReuseModal() {
    setReuseMode("link");
    setReuseSourcePresetIds([]);
    setReuseModalOpen(true);
  }

  async function applyPresetReuse() {
    if (!activePreset || reuseSourcePresetIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.reusePreset(activePreset.id, reuseSourcePresetIds, reuseMode);
      setReuseModalOpen(false);
      await reload();
      onPresetsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeIncludedPreset(includedPresetId: number) {
    if (!activePreset || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api.setPresetIncludes(
        activePreset.id,
        activePreset.included_preset_ids.filter((id) => id !== includedPresetId),
      );
      await reload();
      onPresetsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSkillActionError = useCallback((message: string) => {
    setError(message);
  }, []);

  const debouncedSkillSearch = useDebounce(skillSearchQuery, 300);
  const presetsById = useMemo(
    () => new Map(presets.map((preset) => [preset.id, preset])),
    [presets],
  );
  const activeSourcePresets = useMemo(() => {
    if (!activePreset) return [];
    return activePreset.included_preset_ids.flatMap((id) => {
      const preset = presetsById.get(id);
      return preset ? [preset] : [];
    });
  }, [activePreset, presetsById]);

  // Filter skills based on debounced search query
  const filteredSkills = useMemo(() => {
    if (!debouncedSkillSearch.trim()) return skills;
    const q = debouncedSkillSearch.toLowerCase().trim();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.dir_path.toLowerCase().includes(q) ||
        (s.owner && s.owner.toLowerCase().includes(q)) ||
        (s.repo && s.repo.toLowerCase().includes(q))
    );
  }, [skills, debouncedSkillSearch]);

  const directSkills = useMemo(() => {
    if (!activePreset) return [];
    return filteredSkills.filter((skill) => activePreset.direct_skill_ids.includes(skill.id));
  }, [filteredSkills, activePreset]);

  const inheritedSkills = useMemo(() => {
    if (!activePreset) return [];
    const directIds = new Set(activePreset.direct_skill_ids);
    return filteredSkills.filter(
      (skill) => activePreset.skill_ids.includes(skill.id) && !directIds.has(skill.id),
    );
  }, [filteredSkills, activePreset]);

  const availableSkills = useMemo(() => {
    if (!activePreset) return [];
    return filteredSkills.filter((s) => !activePreset.skill_ids.includes(s.id));
  }, [filteredSkills, activePreset]);

  // Unfiltered totals so search never makes counts look like data loss
  const isFilteringSkills = debouncedSkillSearch.trim().length > 0;
  const effectiveTotal = useMemo(() => {
    if (!activePreset) return 0;
    return skills.filter((s) => activePreset.skill_ids.includes(s.id)).length;
  }, [skills, activePreset]);
  const directTotal = useMemo(() => {
    if (!activePreset) return 0;
    return skills.filter((skill) => activePreset.direct_skill_ids.includes(skill.id)).length;
  }, [skills, activePreset]);
  const inheritedTotal = effectiveTotal - directTotal;
  const availableTotal = skills.length - effectiveTotal;

  const inheritedSkillGroups = useMemo(() => {
    if (!activePreset) return [];

    const visibleSkillIds = new Set(inheritedSkills.map((skill) => skill.id));
    return buildInheritedSkillGroups(sortedPresets, activePreset.id)
      .map((group) => {
        const groupSkillIds = new Set(group.skillIds);
        const groupSkills = skills.filter((skill) => groupSkillIds.has(skill.id));
        return {
          ...group,
          total: groupSkills.length,
          skills: groupSkills.filter((skill) => visibleSkillIds.has(skill.id)),
        };
      })
      .filter((group) => group.skills.length > 0);
  }, [activePreset, inheritedSkills, skills, sortedPresets]);

  const deletingDependents = useMemo(() => {
    if (!deletingPreset) return [];
    const dependentIds = new Set<number>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const preset of presets) {
        if (preset.id === deletingPreset.id || dependentIds.has(preset.id)) continue;
        if (preset.included_preset_ids.some(
          (id) => id === deletingPreset.id || dependentIds.has(id),
        )) {
          dependentIds.add(preset.id);
          changed = true;
        }
      }
    }
    return presets.filter((preset) => dependentIds.has(preset.id));
  }, [deletingPreset, presets]);

  return (
    <div className="w-full flex-1 flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Layers className="w-3.5 h-3.5" />
          <span>{t("presets.eyebrow")}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          {t("nav.presets")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("presets.pageDesc")}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0 break-words">{error}</span>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setError(null)}
            className="p-1 rounded shrink-0 hover:text-rose-300 hover:bg-rose-500/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Layout: Master-Detail */}
      <div className="grid grid-cols-12 gap-6 flex-1">
        {/* Left Master Column: Preset List & Quick Actions */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3 min-h-0">
          {/* Top Section: Create Button & Search */}
          <div className="space-y-2">
            {/* Create Button - Primary Action */}
            <Button
              variant="primary"
              onClick={openCreateModal}
              icon={<Plus className="w-4 h-4" />}
              className="w-full"
            >
              {t("common.create")}
            </Button>

            {/* Search Input - Secondary Action */}
            <Input
              placeholder={t("presets.searchPlaceholder")}
              value={presetSearchQuery}
              onChange={(e) => setPresetSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
              className="w-full"
            />
          </div>

          {/* Preset List Container */}
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
            {filteredPresets.length === 0 ? (
              <Card hoverEffect={false} className="p-6 text-center">
                <p className="text-xs text-slate-500">
                  {presets.length === 0 ? t("presets.empty") : t("install.noResults")}
                </p>
              </Card>
            ) : (
              filteredPresets.map((p, idx) => {
                const isActive = p.id === activePresetId;
                const isFirst = idx === 0;
                const isLast = idx === filteredPresets.length - 1;

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActivePresetId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActivePresetId(p.id);
                      }
                    }}
                    className={`group relative p-3.5 rounded-xl border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                      isActive
                        ? "bg-slate-900/60 border-emerald-500/30 text-slate-200 hover:border-emerald-500/40"
                        : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-900/60 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {/* Active Accent Bar */}
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-500/60 rounded-r-full" />
                    )}

                    {/* Skill Count Badge - Top Right Corner */}
                    <div className="absolute right-1.5 top-3">
                      <Badge
                        variant={isActive ? "info" : "neutral"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {p.skill_ids.length}
                      </Badge>
                    </div>

                    {/* Main Content & Actions Container */}
                    <div className="flex flex-col items-start min-w-0 px-1.5 mt-1">
                      {/* Preset Name & Description */}
                      <div className="min-w-0 flex-1 pl-2">
                        <div className="flex items-center mb-1">
                          <span 
                            className="font-semibold text-sm whitespace-normal break-words"
                            style={{ wordBreak: 'break-word' }}
                          >{p.name}</span>
                        </div>
                        {p.description && (
                          <p className="text-xs text-slate-400 leading-tight">
                            {p.description}
                          </p>
                        )}
                      </div>

                      {/* Compact operation bar: controls stay in flow so hover never shifts layout. */}
                      <div className="mt-2 flex min-h-6 w-full items-center justify-between gap-2 pl-2">
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                          <button
                            type="button"
                            title={t("presets.moveUp")}
                            aria-label={t("presets.moveUp")}
                            disabled={isFirst}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePreset(p.id, "up");
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            title={t("presets.moveDown")}
                            aria-label={t("presets.moveDown")}
                            disabled={isLast}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePreset(p.id, "down");
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(p);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPreset(p);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-800/60 hover:text-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <ReferenceCount
                          count={p.reference_count}
                          countLabel={t("presets.referenceCount", {
                            count: p.reference_count,
                          })}
                          viewLabel={t("presets.viewReferences", { name: p.name })}
                          onView={() => setViewingReferences(p)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Column: Active Preset Overview & Skill Mapping */}
        <div className="col-span-12 lg:col-span-9 flex flex-col">
          {activePreset ? (
            <div className="flex-1 flex flex-col gap-5">
              <PresetSummaryPanel
                preset={activePreset}
                sourcePresets={activeSourcePresets}
                directCount={directTotal}
                inheritedCount={inheritedTotal}
                effectiveCount={effectiveTotal}
                isSubmitting={isSubmitting}
                onReuse={openReuseModal}
                onRemoveSource={removeIncludedPreset}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-slate-200">
                  {t("presets.skillWorkspace")}
                </h3>
                <div className="w-full sm:max-w-sm">
                  <Input
                    name="preset-skill-search"
                    aria-label={t("presets.skillSearchLabel")}
                    placeholder={t("library.searchPlaceholder")}
                    value={skillSearchQuery}
                    onChange={(e) => setSkillSearchQuery(e.target.value)}
                    icon={<Search aria-hidden="true" className="w-4 h-4 text-slate-400" />}
                    rightElement={
                      skillSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => setSkillSearchQuery("")}
                          aria-label={t("presets.clearSkillSearch")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-800/70 hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 motion-reduce:transition-none"
                        >
                          <X aria-hidden="true" className="w-4 h-4" />
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              </div>

              {/* Skill Association Grid */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Associated Skills Column */}
                <Card hoverEffect={false} className="p-4 flex flex-col min-h-[440px]">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80 shrink-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {t("presets.associatedTitle")} (
                        {isFilteringSkills
                          ? `${directSkills.length + inheritedSkills.length} / ${effectiveTotal}`
                          : effectiveTotal}
                        )
                      </span>
                    </h4>
                  </div>

                  {directSkills.length === 0 && inheritedSkills.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <p className="text-xs text-slate-500 text-center italic">
                        {isFilteringSkills && effectiveTotal > 0
                          ? t("install.noResults")
                          : t("presets.noAttached")}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-3 min-h-0">
                      {directSkills.length > 0 ? (
                        <section className="space-y-2" aria-labelledby="direct-skills-heading">
                          <h5 id="direct-skills-heading" className="text-xs font-semibold text-emerald-300">
                            {t("presets.directSkills")} ({isFilteringSkills ? directSkills.length : directTotal})
                          </h5>
                          {directSkills.map((skill) => (
                            <SkillItem
                              key={skill.id}
                              skill={skill}
                              variant="attached"
                              onToggle={() => toggleSkill(activePreset, skill.id)}
                              onError={handleSkillActionError}
                            />
                          ))}
                        </section>
                      ) : null}

                      {inheritedSkills.length > 0 ? (
                        <section className="space-y-2" aria-labelledby="inherited-skills-heading">
                          <h5 id="inherited-skills-heading" className="text-xs font-semibold text-sky-300">
                            {t("presets.inheritedSkills")} ({isFilteringSkills ? inheritedSkills.length : inheritedTotal})
                          </h5>
                          <div className="space-y-4">
                            {inheritedSkillGroups.map((group) => {
                              const headingId = `inherited-source-${activePreset.id}-${group.presetId}`;
                              return (
                                <section
                                  key={group.presetId}
                                  aria-labelledby={headingId}
                                  className="space-y-2"
                                >
                                  <div className="flex min-w-0 items-center gap-2 px-1">
                                    <h6
                                      id={headingId}
                                      className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-sky-300"
                                    >
                                      <Link2 className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                                      <span className="truncate" title={group.presetName}>
                                        {group.presetName}
                                      </span>
                                    </h6>
                                    <span className="shrink-0 font-mono text-[10px] text-slate-500">
                                      {isFilteringSkills
                                        ? `${group.skills.length} / ${group.total}`
                                        : group.total}
                                    </span>
                                  </div>
                                  <div className="space-y-2 border-l border-sky-500/25 pl-3">
                                    {group.skills.map((skill) => (
                                      <div
                                        key={`${group.presetId}:${skill.id}`}
                                        className="group flex min-h-14 items-center justify-between gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-2.5 text-xs"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium text-slate-300">
                                            <span className="block truncate" title={skill.name}>
                                              {skill.name}
                                            </span>
                                          </div>
                                          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                                            {skill.owner && skill.repo
                                              ? `${skill.owner}/${skill.repo}`
                                              : skill.dir_path}
                                          </p>
                                        </div>
                                        <SkillSourceActions skill={skill} onError={handleSkillActionError} />
                                      </div>
                                    ))}
                                  </div>
                                </section>
                              );
                            })}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  )}
                </Card>

                {/* Available Skills Column */}
                <Card hoverEffect={false} className="p-4 flex flex-col min-h-[440px]">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80 shrink-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                      <PlusCircle className="w-4 h-4 text-slate-500" />
                      <span>
                        {t("presets.availableTitle")} (
                        {isFilteringSkills
                          ? `${availableSkills.length} / ${availableTotal}`
                          : availableTotal}
                        )
                      </span>
                    </h4>
                  </div>

                  {availableSkills.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <p className="text-xs text-slate-500 text-center italic">
                        {skills.length === 0
                          ? t("common.empty")
                          : isFilteringSkills && availableTotal > 0
                            ? t("install.noResults")
                            : t("presets.allAdded")}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 space-y-2 overflow-y-auto pr-1 pb-3 min-h-0">
                      {availableSkills.map((s) => (
                        <SkillItem
                          key={s.id}
                          skill={s}
                          variant="available"
                          onToggle={() => toggleSkill(activePreset, s.id)}
                          onError={handleSkillActionError}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Layers className="w-8 h-8 text-slate-500" />}
              title={t("presets.noPresetSelected")}
              description={t("presets.selectPrompt")}
              action={
                <Button variant="primary" onClick={openCreateModal} icon={<Plus className="w-4 h-4" />}>
                  {t("presets.createModalTitle")}
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* Modal Dialog: Create / Edit Preset (shared form) */}
      <Modal
        isOpen={!!presetModal}
        onClose={() => setPresetModal(null)}
        size={presetModal?.mode === "create" && presets.length > 0 ? "lg" : "md"}
        title={
          presetModal?.mode === "edit"
            ? t("presets.editModalTitle")
            : t("presets.createModalTitle")
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPresetModal(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={submitPresetForm}
              disabled={!formName.trim() || isSubmitting}
            >
              {presetModal?.mode === "edit" ? t("common.save") : t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="preset-form-name"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              {t("presets.newName")}
            </label>
            <Input
              id="preset-form-name"
              placeholder={t("presets.namePlaceholder")}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPresetForm();
              }}
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="preset-form-desc"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              {t("presets.newDesc")}
            </label>
            <textarea
              id="preset-form-desc"
              rows={3}
              placeholder={t("presets.descPlaceholder")}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitPresetForm();
              }}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 focus:border-emerald-500/80 transition-all duration-150 px-3.5 py-2 resize-none"
            />
          </div>
          {presetModal?.mode === "create" && presets.length > 0 ? (
            <div className="space-y-2 border-t border-slate-800/80 pt-4">
              <h3 className="text-xs font-semibold text-slate-300">
                {t("presets.startFromPreset")}
              </h3>
              <PresetReuseSelector
                presets={presets}
                mode={formReuseMode}
                selectedIds={formSourcePresetIds}
                onModeChange={setFormReuseMode}
                onSelectedIdsChange={setFormSourcePresetIds}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={reuseModalOpen}
        onClose={() => setReuseModalOpen(false)}
        title={t("presets.reuseModalTitle", { name: activePreset?.name ?? "" })}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReuseModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={applyPresetReuse}
              disabled={reuseSourcePresetIds.length === 0 || isSubmitting}
              icon={reuseMode === "copy"
                ? <Package className="h-4 w-4" />
                : <Link2 className="h-4 w-4" />}
            >
              {t(`presets.reuseAction.${reuseMode}`)}
            </Button>
          </>
        }
      >
        {activePreset ? (
          <PresetReuseSelector
            presets={presets}
            targetPreset={activePreset}
            mode={reuseMode}
            selectedIds={reuseSourcePresetIds}
            onModeChange={setReuseMode}
            onSelectedIdsChange={setReuseSourcePresetIds}
          />
        ) : null}
      </Modal>

      <PresetReferenceModal
        preset={viewingReferences}
        isOpen={viewingReferences !== null}
        onClose={() => setViewingReferences(null)}
      />

      {/* Modal Dialog: Delete Preset Confirmation */}
      <Modal
        isOpen={!!deletingPreset}
        onClose={() => setDeletingPreset(null)}
        title={t("presets.deleteModalTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingPreset(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={removePreset}
              icon={<Trash2 className="w-4 h-4" />}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">
            {deletingPreset &&
              t("presets.deleteConfirm", { name: deletingPreset.name })}
          </p>
          {deletingDependents.length > 0 ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-xs font-medium text-amber-300">
                {t("presets.deleteAffects", { count: deletingDependents.length })}
              </p>
              <p className="mt-1 break-words text-xs text-amber-200/70">
                {deletingDependents.map((preset) => preset.name).join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
