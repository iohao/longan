<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { AlertTriangle, Trash2 } from "lucide-vue-next";
import type { ListedSkill, Skill, SkillUpdateTask } from "@/types";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import ReferenceCount from "@/components/ui/ReferenceCount.vue";
import SkillSourceActions from "@/components/skills/SkillSourceActions.vue";

export interface SkillActionsProps {
  skill: ListedSkill;
  updateTask?: SkillUpdateTask;
  updateDisabled: boolean;
  hideRepoActions?: boolean;
}

const props = withDefaults(defineProps<SkillActionsProps>(), {
  updateTask: undefined,
  hideRepoActions: false,
});

const emit = defineEmits<{
  (e: "update", skill: Skill): void;
  (e: "delete", skill: Skill): void;
  (e: "viewReferences", skill: Skill): void;
  (e: "actionError", message: string): void;
}>();

const { t } = useI18n();

const isUpdateAvailable = computed(() => props.skill.status === "update_available");
const isMissing = computed(() => props.skill.status === "missing");
const updateInProgress = computed(
  () => props.updateTask?.status === "queued" || props.updateTask?.status === "updating",
);
</script>

<template>
  <div class="flex shrink-0 items-center gap-2">
    <!-- Missing status badge -->
    <Badge v-if="isMissing" variant="danger">
      <AlertTriangle class="w-3 h-3" />
      <span>{{ t("library.status.missing") }}</span>
    </Badge>

    <!-- Update button -->
    <Button
      v-if="isUpdateAvailable && skill.source_type === 'net'"
      size="sm"
      variant="amber"
      :loading="updateTask?.status === 'updating'"
      :disabled="updateInProgress || updateDisabled"
      @click="emit('update', skill)"
    >
      {{
        updateTask?.status === "queued"
          ? t("library.updateQueued")
          : updateInProgress
            ? t("library.updating")
            : t("library.update")
      }}
    </Button>

    <SkillSourceActions
      :skill="skill"
      :hide-repo-actions="hideRepoActions"
      @error="(msg) => emit('actionError', msg)"
    >
      <Button
        type="button"
        size="sm"
        variant="danger"
        :disabled="updateInProgress"
        :title="t('common.delete')"
        :aria-label="t('common.delete')"
        @click="emit('delete', skill)"
      >
        <Trash2 class="w-3.5 h-3.5" />
      </Button>
    </SkillSourceActions>

    <ReferenceCount
      :count="skill.reference_count"
      :count-label="
        t('library.referenceCount', {
          count: skill.reference_count ?? 0,
        })
      "
      :view-label="t('library.viewReferences', { name: skill.name })"
      @view="emit('viewReferences', skill)"
    />
  </div>
</template>
