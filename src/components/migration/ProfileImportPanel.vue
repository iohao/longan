<script setup lang="ts">
import { ref, computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  FolderOpen,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { ImportResult, ProfileImportPreview } from "@/types";
import Button from "@/components/ui/Button.vue";
import TransferManifest from "./TransferManifest.vue";

export interface ProfileImportPanelProps {
  onBusyChange?: (busy: boolean) => void;
  onProfileImported?: () => void | Promise<void>;
  onGoToPresets?: () => void;
}

const props = withDefaults(defineProps<ProfileImportPanelProps>(), {
  onBusyChange: undefined,
  onProfileImported: undefined,
  onGoToPresets: undefined,
});

const emit = defineEmits<{
  (e: "busyChange", busy: boolean): void;
  (e: "profileImported"): void;
  (e: "goToPresets"): void;
}>();

const { t, locale } = useI18n();

const inputRef = useTemplateRef<HTMLInputElement>("inputRef");
const selectedFile = ref<File | null>(null);
const profileJson = ref<string | null>(null);
const preview = ref<ProfileImportPreview | null>(null);
const result = ref<ImportResult | null>(null);
const stage = ref<"reading" | "previewing" | "importing" | null>(null);
const error = ref<string | null>(null);
const dragActive = ref(false);

const busy = computed(() => stage.value !== null);
const presetCount = computed(() =>
  preview.value
    ? preview.value.new_presets.length + preview.value.replaced_presets.length
    : 0,
);

function setBusy(val: boolean) {
  props.onBusyChange?.(val);
  emit("busyChange", val);
}

function reset() {
  selectedFile.value = null;
  profileJson.value = null;
  preview.value = null;
  result.value = null;
  error.value = null;
  stage.value = null;
  if (inputRef.value) inputRef.value.value = "";
  setBusy(false);
}

async function inspectFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".json")) {
    error.value = t("migration.invalidFileType");
    preview.value = null;
    return;
  }

  selectedFile.value = file;
  preview.value = null;
  result.value = null;
  error.value = null;
  stage.value = "reading";
  setBusy(true);

  try {
    const content = await file.text();
    profileJson.value = content;
    stage.value = "previewing";
    const nextPreview = await api.previewProfileImport(content);
    preview.value = nextPreview;
  } catch (cause) {
    profileJson.value = null;
    error.value = errorMessage(cause);
  } finally {
    stage.value = null;
    setBusy(false);
  }
}

async function handleImport() {
  if (!profileJson.value || !preview.value || busy.value) return;
  stage.value = "importing";
  error.value = null;
  setBusy(true);

  try {
    const importResult = await api.importProfile(profileJson.value);
    result.value = importResult;
    await props.onProfileImported?.();
    emit("profileImported");
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    stage.value = null;
    setBusy(false);
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  dragActive.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void inspectFile(file);
}

function handleDragLeave(e: DragEvent) {
  if (
    !(e.relatedTarget instanceof Node) ||
    !((e.currentTarget as HTMLElement)?.contains(e.relatedTarget as Node))
  ) {
    dragActive.value = false;
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void inspectFile(file);
}

function handleGoToPresets() {
  if (props.onGoToPresets) {
    props.onGoToPresets();
  }
  emit("goToPresets");
}

function formatProfileDate(value: string, loc: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(loc);
}
</script>

<template>
  <section aria-labelledby="import-panel-title">
    <TransferManifest
      direction="import"
      :filename="selectedFile?.name ?? 'longan-profile.json'"
    />

    <div class="p-5 sm:p-6">
      <div class="mb-6 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="import-panel-title" class="text-lg font-semibold text-slate-100">
            {{ result ? t("migration.importResultHeading") : t("migration.importHeading") }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-slate-400">
            {{ result ? t("migration.importResultSummary") : t("migration.importSummary") }}
          </p>
        </div>
        <Button
          v-if="selectedFile && !result"
          variant="ghost"
          size="sm"
          class="min-h-11 self-start"
          :disabled="busy"
          @click="reset"
        >
          <template #icon>
            <RotateCcw class="size-4" />
          </template>
          {{ t("migration.chooseAnother") }}
        </Button>
      </div>

      <!-- Result View -->
      <div v-if="result">
        <div
          class="flex items-start gap-4 border-y border-emerald-500/20 bg-emerald-500/5 px-4 py-5"
          role="status"
        >
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"
          >
            <CheckCircle2 class="size-5" aria-hidden="true" />
          </span>
          <div>
            <p class="font-medium text-slate-100">{{ t("migration.importComplete") }}</p>
            <p class="mt-1 text-sm text-slate-400">
              {{
                t("migration.importCompleteSummary", {
                  presets: result.created_presets.length,
                  skills: result.skipped_skills.length,
                })
              }}
            </p>
          </div>
        </div>

        <details
          v-if="result.unresolved_preset_skills.length > 0"
          class="mt-5 border-y border-slate-800 py-3"
        >
          <summary class="cursor-pointer text-sm font-medium text-amber-300">
            {{ t("migration.unresolvedCount", { count: result.unresolved_preset_skills.length }) }}
          </summary>
          <ul class="mt-3 space-y-1.5 pl-5 font-mono text-xs text-slate-400">
            <li v-for="item in result.unresolved_preset_skills" :key="item">
              {{ item }}
            </li>
          </ul>
        </details>

        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            class="min-h-11"
            @click="reset"
          >
            <template #icon>
              <RotateCcw class="size-4" />
            </template>
            {{ t("migration.importAnother") }}
          </Button>
          <Button
            variant="primary"
            class="min-h-11"
            @click="handleGoToPresets"
          >
            {{ t("migration.viewPresets") }}
          </Button>
        </div>
      </div>

      <!-- Preview View -->
      <div v-else-if="preview">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-800 py-3 text-xs text-slate-400">
          <span class="font-mono text-slate-200">{{ selectedFile?.name }}</span>
          <span>{{ t("migration.versionValue", { version: preview.version }) }}</span>
          <span>{{ t("migration.exportedAt", { date: formatProfileDate(preview.export_date, locale) }) }}</span>
        </div>

        <div class="mt-5 grid grid-cols-2 border border-slate-800 [&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0">
          <div class="border-slate-800 px-4 py-4">
            <p class="text-xs text-slate-500">{{ t("migration.matchedSkills") }}</p>
            <p class="mt-1 font-mono text-xl font-semibold text-emerald-400">
              {{ preview.matched_skills.length }}
            </p>
          </div>
          <div class="border-slate-800 px-4 py-4 border-l">
            <p class="text-xs text-slate-500">{{ t("migration.missingSkills") }}</p>
            <p class="mt-1 font-mono text-xl font-semibold text-amber-400">
              {{ preview.missing_skills.length }}
            </p>
          </div>
          <div class="border-slate-800 px-4 py-4 lg:border-l">
            <p class="text-xs text-slate-500">{{ t("migration.newPresets") }}</p>
            <p class="mt-1 font-mono text-xl font-semibold text-sky-400">
              {{ preview.new_presets.length }}
            </p>
          </div>
          <div class="border-slate-800 px-4 py-4 border-l">
            <p class="text-xs text-slate-500">{{ t("migration.replacedPresets") }}</p>
            <p class="mt-1 font-mono text-xl font-semibold text-amber-400">
              {{ preview.replaced_presets.length }}
            </p>
          </div>
        </div>

        <!-- Overwrite Warning -->
        <div
          v-if="preview.replaced_presets.length > 0"
          class="mt-5 flex items-start gap-3 border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
          role="status"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{{ t("migration.overwriteWarning", { count: preview.replaced_presets.length }) }}</span>
        </div>

        <!-- Missing Warning -->
        <div
          v-if="preview.missing_skills.length > 0 || preview.unresolved_preset_skills.length > 0"
          class="mt-3 flex items-start gap-3 border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-300"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>{{ t("migration.missingWarning") }}</span>
        </div>

        <!-- Accordion Details -->
        <div class="mt-5 divide-y divide-slate-800 border-y border-slate-800">
          <!-- Matched Skills -->
          <details v-if="preview.matched_skills.length > 0">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">
              {{ t("migration.matchedSkills") }}
              <span class="ml-1 font-mono text-slate-500">{{ preview.matched_skills.length }}</span>
            </summary>
            <ul class="mt-3 space-y-2 pl-4">
              <li
                v-for="item in preview.matched_skills"
                :key="item.dir_path"
                class="min-w-0 text-xs text-slate-400"
              >
                <span class="text-slate-200">{{ item.name }}</span>
                <span class="ml-2 break-all font-mono text-slate-500">{{ item.dir_path }}</span>
              </li>
            </ul>
          </details>

          <!-- Missing Skills -->
          <details v-if="preview.missing_skills.length > 0">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">
              {{ t("migration.missingSkills") }}
              <span class="ml-1 font-mono text-slate-500">{{ preview.missing_skills.length }}</span>
            </summary>
            <ul class="mt-3 space-y-2 pl-4">
              <li
                v-for="item in preview.missing_skills"
                :key="item.dir_path"
                class="min-w-0 text-xs text-slate-400"
              >
                <span class="text-slate-200">{{ item.name }}</span>
                <span class="ml-2 break-all font-mono text-slate-500">{{ item.dir_path }}</span>
              </li>
            </ul>
          </details>

          <!-- New Presets -->
          <details v-if="preview.new_presets.length > 0">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">
              {{ t("migration.newPresets") }}
              <span class="ml-1 font-mono text-slate-500">{{ preview.new_presets.length }}</span>
            </summary>
            <p class="mt-3 pl-4 text-xs text-slate-400">{{ preview.new_presets.join(", ") }}</p>
          </details>

          <!-- Replaced Presets -->
          <details v-if="preview.replaced_presets.length > 0">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm text-slate-300">
              {{ t("migration.replacedPresets") }}
              <span class="ml-1 font-mono text-slate-500">{{ preview.replaced_presets.length }}</span>
            </summary>
            <p class="mt-3 pl-4 text-xs text-slate-400">{{ preview.replaced_presets.join(", ") }}</p>
          </details>

          <!-- Unresolved Assignments -->
          <details v-if="preview.unresolved_preset_skills.length > 0">
            <summary class="flex min-h-11 cursor-pointer items-center text-sm text-amber-300">
              {{ t("migration.unresolvedAssignments") }}
              <span class="ml-1 font-mono">{{ preview.unresolved_preset_skills.length }}</span>
            </summary>
            <ul class="mt-3 space-y-2 pl-4 font-mono text-xs text-slate-400">
              <li
                v-for="item in preview.unresolved_preset_skills"
                :key="`${item.preset_name}:${item.skill_ref}`"
              >
                {{ item.preset_name }}: {{ item.skill_ref }}
              </li>
            </ul>
          </details>
        </div>

        <div v-if="error" class="mt-4 text-sm text-rose-400" role="alert">
          {{ error }}
        </div>

        <div class="mt-6 flex justify-end">
          <Button
            variant="primary"
            size="lg"
            :disabled="stage === 'importing' || presetCount === 0"
            :loading="stage === 'importing'"
            @click="handleImport"
          >
            <template #icon>
              <Upload class="size-4" />
            </template>
            {{
              stage === "importing"
                ? t("migration.importing")
                : preview.replaced_presets.length > 0
                  ? t("migration.importAndOverwrite", { count: presetCount })
                  : t("migration.importAction", { count: presetCount })
            }}
          </Button>
        </div>
      </div>

      <!-- File Picker Drop Zone -->
      <div v-else>
        <input
          ref="inputRef"
          id="profile-import-file"
          type="file"
          accept=".json,application/json"
          class="sr-only"
          :aria-label="t('migration.browseFile')"
          :disabled="busy"
          @change="handleFileSelect"
        />

        <div
          :class="[
            'flex min-h-56 flex-col items-center justify-center border border-dashed px-6 py-10 text-center transition-colors duration-150',
            dragActive
              ? 'border-emerald-500 bg-emerald-500/5'
              : 'border-slate-700 bg-slate-950/20',
          ]"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent
          @dragleave.prevent="handleDragLeave"
          @drop="handleDrop"
        >
          <template v-if="busy">
            <Loader2
              class="size-8 animate-spin text-emerald-400 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p class="mt-4 text-sm font-medium text-slate-200" role="status">
              {{ stage === "reading" ? t("migration.readingFile") : t("migration.previewingFile") }}
            </p>
            <p class="mt-1 text-xs text-slate-500">{{ selectedFile?.name }}</p>
          </template>

          <template v-else>
            <span
              class="flex size-12 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400"
            >
              <FileJson class="size-6" aria-hidden="true" />
            </span>
            <p class="mt-4 text-sm font-medium text-slate-200">
              {{ t("migration.dropFileTitle") }}
            </p>
            <p class="mt-1 max-w-md text-xs leading-5 text-slate-500">
              {{ t("migration.dropFileHint") }}
            </p>
            <Button
              variant="secondary"
              size="sm"
              class="mt-5 min-h-11"
              @click="inputRef?.click()"
            >
              <template #icon>
                <FolderOpen class="size-4" />
              </template>
              {{ t("migration.browseFile") }}
            </Button>
          </template>
        </div>

        <div
          v-if="error"
          class="mt-4 flex items-start gap-2 border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400"
          role="alert"
        >
          <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{{ error }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
