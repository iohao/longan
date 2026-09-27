<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { ExportProfile } from "@/types";
import Button from "@/components/ui/Button.vue";
import TransferManifest from "./TransferManifest.vue";

const { t } = useI18n();

const exportFilename = () =>
  `longan-profile-${new Date().toISOString().split("T")[0]}.json`;

const snapshot = ref<string | null>(null);
const profile = ref<ExportProfile | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const revealing = ref(false);
const savedPath = ref<string | null>(null);
const actionError = ref<string | null>(null);
const filename = ref(exportFilename());

async function loadSnapshot() {
  loading.value = true;
  error.value = null;
  savedPath.value = null;
  actionError.value = null;
  try {
    const profileJson = await api.exportProfile();
    snapshot.value = profileJson;
    profile.value = JSON.parse(profileJson) as ExportProfile;
  } catch (cause) {
    snapshot.value = null;
    profile.value = null;
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadSnapshot();
});

async function handleExport() {
  if (!snapshot.value || saving.value) return;
  saving.value = true;
  actionError.value = null;
  try {
    const path = await api.saveFileDialog({
      title: t("migration.saveDialogTitle"),
      defaultPath: filename.value,
      filters: [{ name: t("migration.jsonFileType"), extensions: ["json"] }],
    });
    if (!path) return;
    savedPath.value = null;
    await api.saveProfileFile(path, snapshot.value);
    savedPath.value = path;
  } catch (cause) {
    actionError.value = errorMessage(cause);
  } finally {
    saving.value = false;
  }
}

async function handleReveal() {
  if (!savedPath.value || revealing.value) return;
  revealing.value = true;
  actionError.value = null;
  try {
    await api.revealFile(savedPath.value);
  } catch (cause) {
    actionError.value = errorMessage(cause);
  } finally {
    revealing.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="export-panel-title">
    <TransferManifest direction="export" :filename="filename" />

    <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <!-- Left panel -->
      <div class="p-5 sm:p-6 lg:border-r lg:border-slate-800">
        <div class="mb-6">
          <h2 id="export-panel-title" class="text-lg font-semibold text-slate-100">
            {{ t("migration.exportHeading") }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-slate-400">
            {{ t("migration.exportSummary") }}
          </p>
        </div>

        <div
          v-if="loading"
          class="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-400"
          role="status"
        >
          <Loader2 class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {{ t("migration.preparingSnapshot") }}
        </div>

        <div
          v-else-if="error"
          class="flex min-h-32 flex-col items-start justify-center gap-3"
          role="alert"
        >
          <p class="text-sm text-rose-400">{{ error }}</p>
          <Button
            variant="secondary"
            size="sm"
            class="min-h-11"
            @click="loadSnapshot"
          >
            <template #icon>
              <RefreshCw class="size-4" />
            </template>
            {{ t("migration.retry") }}
          </Button>
        </div>

        <template v-else>
          <div class="grid grid-cols-2 border-y border-slate-800 [&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0">
            <div class="min-w-0 border-slate-800 px-3 py-4">
              <p class="truncate text-xs text-slate-500">{{ t("migration.skillsLabel") }}</p>
              <p class="mt-1 truncate font-mono text-base font-semibold text-slate-100">
                {{ profile?.skills.length ?? 0 }}
              </p>
            </div>
            <div class="min-w-0 border-slate-800 px-3 py-4 border-l">
              <p class="truncate text-xs text-slate-500">{{ t("migration.presetsLabel") }}</p>
              <p class="mt-1 truncate font-mono text-base font-semibold text-slate-100">
                {{ profile?.presets.length ?? 0 }}
              </p>
            </div>
            <div class="min-w-0 border-slate-800 px-3 py-4 lg:border-l">
              <p class="truncate text-xs text-slate-500">{{ t("migration.localFilesLabel") }}</p>
              <p class="mt-1 truncate font-mono text-base font-semibold text-slate-100">
                {{ t("migration.notIncluded") }}
              </p>
            </div>
            <div class="min-w-0 border-slate-800 px-3 py-4 border-l">
              <p class="truncate text-xs text-slate-500">{{ t("migration.projectsAgentsLabel") }}</p>
              <p class="mt-1 truncate font-mono text-base font-semibold text-slate-100">
                {{ t("migration.notIncluded") }}
              </p>
            </div>
          </div>

          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <div class="flex items-start gap-2 text-sm leading-5 text-slate-400">
              <span class="mt-0.5 shrink-0 text-emerald-400">
                <Archive class="size-4" />
              </span>
              <span>{{ t("migration.exportIncludes") }}</span>
            </div>
            <div class="flex items-start gap-2 text-sm leading-5 text-slate-400">
              <span class="mt-0.5 shrink-0 text-emerald-400">
                <ShieldCheck class="size-4" />
              </span>
              <span>{{ t("migration.exportPortableNote") }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Right panel -->
      <div class="flex flex-col justify-between gap-6 border-t border-slate-800 bg-slate-950/20 p-5 sm:p-6 lg:border-t-0">
        <div>
          <p class="text-xs font-medium text-slate-500">{{ t("migration.readyFile") }}</p>
          <p class="mt-2 truncate font-mono text-xs text-slate-200" :title="filename">
            {{ filename }}
          </p>
        </div>

        <div>
          <Button
            variant="primary"
            size="lg"
            class="w-full"
            :disabled="loading || !snapshot || revealing"
            :loading="saving"
            @click="handleExport"
          >
            <template #icon>
              <Save class="size-4" />
            </template>
            {{ saving ? t("migration.saving") : t("migration.exportAction") }}
          </Button>

          <!-- Saved Path Information -->
          <div v-if="savedPath" class="mt-4 border-t border-slate-800 pt-4" aria-live="polite">
            <div class="flex items-start gap-2 text-xs text-emerald-400">
              <CheckCircle2 class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <div class="min-w-0">
                <p class="font-medium">{{ t("migration.exportComplete") }}</p>
                <p class="mt-1 break-all font-mono leading-5 text-slate-400" :title="savedPath">
                  {{ savedPath }}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              class="mt-3 min-h-11 w-full"
              :loading="revealing"
              @click="handleReveal"
            >
              <template #icon>
                <FolderOpen class="size-4" />
              </template>
              {{ t("migration.showInFolder") }}
            </Button>
          </div>

          <!-- Action Error -->
          <div
            v-if="actionError"
            class="mt-3 flex items-start gap-2 text-left text-xs leading-5 text-rose-400"
            role="alert"
          >
            <AlertTriangle class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span class="break-words">{{ actionError }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
