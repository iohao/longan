<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ArchiveRestore, Layers, FolderGit2 } from "lucide-vue-next";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import type { Skill } from "@/types";

export interface DeleteConfirmModalProps {
  skill: Skill | null;
  deleteRefs: [string[], string[]] | null;
}

const props = defineProps<DeleteConfirmModalProps>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm"): void;
}>();

const { t } = useI18n();

const isOpen = computed(() => props.skill !== null);
const title = computed(() =>
  props.skill ? t("library.deleteTitle", { name: props.skill.name }) : "",
);
</script>

<template>
  <Dialog :open="isOpen" :title="title" @close="emit('close')">
    <div class="space-y-3">
      <div
        v-if="skill?.source_type === 'local'"
        class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-slate-950/60 p-3 text-sm text-slate-200"
      >
        <ArchiveRestore class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p class="leading-relaxed">{{ t("library.deleteLocalTrashNotice") }}</p>
      </div>

      <p v-if="deleteRefs === null" class="text-sm text-slate-400 animate-pulse">
        {{ t("common.loading") }}
      </p>
      <p
        v-else-if="deleteRefs[0].length === 0 && deleteRefs[1].length === 0"
        class="text-sm text-slate-300"
      >
        {{ t("library.deleteNoRefs") }}
      </p>
      <div v-else class="space-y-3 text-sm text-slate-300">
        <p class="font-medium text-slate-200">{{ t("library.deleteRefs") }}</p>
        <div
          v-if="deleteRefs[0].length > 0"
          class="flex items-start gap-2 p-3 rounded-lg bg-slate-900/80 border border-slate-800"
        >
          <Layers class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span class="text-xs text-slate-400 block font-medium">
              {{ t("library.deleteRefPresets", { names: deleteRefs[0].join(", ") }) }}
            </span>
          </div>
        </div>
        <div
          v-if="deleteRefs[1].length > 0"
          class="flex items-start gap-2 p-3 rounded-lg bg-slate-900/80 border border-slate-800"
        >
          <FolderGit2 class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span class="text-xs text-slate-400 block font-medium">
              {{ t("library.deleteRefProjects", { names: deleteRefs[1].join(", ") }) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">
        {{ t("common.cancel") }}
      </Button>
      <Button variant="danger" @click="emit('confirm')">
        {{ t("common.confirm") }}
      </Button>
    </template>
  </Dialog>
</template>
