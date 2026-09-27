<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Download, FolderOpen, FolderGit2, AlertTriangle, HardDrive } from "lucide-vue-next";
import type { LocalSkillPreview } from "@/types";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Alert from "@/components/ui/Alert.vue";

export interface LocalImportTabProps {
  localPath: string | null;
  localPreview: LocalSkillPreview | null;
  importing: boolean;
  error: string | null;
  success: string | null;
}

const props = defineProps<LocalImportTabProps>();

const emit = defineEmits<{
  (e: "clearError"): void;
  (e: "clearSuccess"): void;
  (e: "pickFolder"): void;
  (e: "import"): void;
}>();

const { t } = useI18n();

const breadcrumbParts = computed(() => {
  if (!props.localPath) return [];
  return props.localPath.split("/");
});
</script>

<template>
  <div class="space-y-6">
    <Card :hover-effect="false" class="p-6 space-y-5">
      <div class="flex items-center gap-3 border-b border-slate-800/80 pb-4">
        <div
          class="p-2.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700/60 shrink-0"
        >
          <HardDrive class="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-slate-100">
            {{ t("install.localTabTitle") }}
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            {{ t("install.localTabDesc") }}
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="flex gap-3">
          <div
            class="flex-1 min-w-0 flex items-center gap-2 px-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono"
          >
            <FolderOpen class="w-4 h-4 text-slate-400 shrink-0" />
            <span
              :class="['truncate', localPath ? 'text-slate-200' : 'text-slate-500']"
            >
              {{ localPath ?? t("install.localNoFolder") }}
            </span>
          </div>

          <Button
            variant="secondary"
            @click="emit('pickFolder')"
          >
            <FolderOpen class="w-4 h-4" />
            <span>{{ t("install.localPickFolder") }}</span>
          </Button>

          <Button
            variant="primary"
            :disabled="!localPreview || localPreview.conflict"
            :loading="importing"
            @click="emit('import')"
          >
            <Download class="w-4 h-4" />
            <span>{{ t("install.localImportAction") }}</span>
          </Button>
        </div>

        <!-- Breadcrumb box -->
        <div
          v-if="localPath"
          class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 animate-in fade-in duration-150"
        >
          <div class="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <FolderOpen class="w-4 h-4" />
            <span>{{ t("install.breadcrumbTitle") }}</span>
          </div>
          <div class="text-xs text-slate-300 pt-1">
            <span
              v-for="(part, idx) in breadcrumbParts"
              :key="idx"
              class="inline-flex items-center"
            >
              <span v-if="idx === breadcrumbParts.length - 1" class="text-emerald-400">
                {{ part }}
              </span>
              <template v-else>
                <span>{{ part }}</span>
                <span class="mx-1 text-slate-600">/</span>
              </template>
            </span>
          </div>
        </div>

        <!-- Local Preview box -->
        <div
          v-if="localPreview"
          class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 animate-in fade-in duration-150"
        >
          <div class="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <FolderGit2 class="w-4 h-4" />
            <span>{{ t("install.parsedPreview") }}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <span class="text-slate-500 block">{{ t("install.localFieldName") }}</span>
              <span class="text-emerald-300 font-mono font-medium truncate block">
                {{ localPreview.name }}
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">{{ t("install.localFieldKind") }}</span>
              <span class="text-slate-200 font-medium truncate block">
                {{
                  localPreview.kind === "collection"
                    ? t("install.localKindCollection", {
                        count: localPreview.sub_skills.length,
                      })
                    : t("install.localKindSkill")
                }}
              </span>
            </div>
            <div>
              <span class="text-slate-500 block">{{ t("install.localFieldDesc") }}</span>
              <span class="text-slate-200 truncate block">
                {{ localPreview.description ?? "—" }}
              </span>
            </div>
          </div>
          <div
            v-if="localPreview.conflict"
            class="text-xs text-amber-400/90 flex items-center gap-1.5 pt-1"
          >
            <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
            <span>{{ t("install.localConflict", { name: localPreview.dir_name }) }}</span>
          </div>
        </div>

        <!-- Success & Error Alerts -->
        <Alert
          v-if="success"
          type="success"
          :message="success"
          :duration="4000"
          @close="emit('clearSuccess')"
        />

        <Alert
          v-if="error"
          type="error"
          :message="error"
          @close="emit('clearError')"
        />
      </div>
    </Card>
  </div>
</template>
