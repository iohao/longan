<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { CheckCircle2, Package, Trash2, Plus } from "lucide-vue-next";
import type { Skill } from "@/types";
import Badge from "@/components/ui/Badge.vue";
import SkillSourceActions from "@/components/skills/SkillSourceActions.vue";

export interface SkillItemProps {
  skill: Skill;
  variant: "attached" | "available";
}

const props = defineProps<SkillItemProps>();

const emit = defineEmits<{
  (e: "toggle", skillId: number): void;
  (e: "error", message: string): void;
}>();

const { t } = useI18n();

const isAttached = computed(() => props.variant === "attached");
const isNet = computed(
  () => props.skill.source_type === "net" && Boolean(props.skill.owner && props.skill.repo),
);
const address = computed(() =>
  isNet.value ? `${props.skill.owner}/${props.skill.repo}` : props.skill.dir_path,
);

function handleToggle() {
  emit("toggle", props.skill.id);
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :title="isAttached ? t('presets.removeSkill') : t('presets.addSkill')"
    :class="[
      'group group/row flex items-center justify-between p-2.5 rounded-lg text-xs border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2',
      isAttached
        ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200 hover:border-rose-500/40 hover:bg-rose-950/15 focus-visible:ring-rose-500/50'
        : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-emerald-500/40 hover:bg-emerald-950/15 focus-visible:ring-emerald-500/50',
    ]"
    @click="handleToggle"
    @keydown.enter.prevent="handleToggle"
    @keydown.space.prevent="handleToggle"
  >
    <div class="min-w-0 flex-1 mr-2">
      <div
        :class="[
          'flex items-center gap-1.5 min-w-0',
          isAttached ? 'font-semibold text-emerald-200' : 'font-medium text-slate-300',
        ]"
      >
        <CheckCircle2 v-if="isAttached" class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <Package v-else class="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span class="truncate" :title="skill.name">{{ skill.name }}</span>
      </div>
      <p
        :class="[
          'text-[11px] font-mono truncate mt-0.5',
          isAttached ? 'text-slate-400' : 'text-slate-500',
        ]"
        :title="`${address}${skill.description ? ` • ${skill.description}` : ''}`"
      >
        {{ address }}{{ skill.description ? ` • ${skill.description}` : "" }}
      </p>
    </div>

    <div class="flex items-center gap-1.5 shrink-0" @click.stop>
      <SkillSourceActions :skill="skill" @error="(msg) => emit('error', msg)" />
      <Badge variant="neutral" class="text-[10px]">
        {{ t(`library.source.${skill.source_type}`) }}
      </Badge>
      <span
        aria-hidden="true"
        :class="[
          'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer',
          isAttached
            ? 'text-rose-400/60 group-hover/row:text-rose-300 group-hover/row:bg-rose-500/15'
            : 'text-emerald-400/60 group-hover/row:text-emerald-300 group-hover/row:bg-emerald-500/15',
        ]"
        @click="handleToggle"
      >
        <Trash2 v-if="isAttached" class="w-3.5 h-3.5" />
        <Plus v-else class="w-3.5 h-3.5" />
      </span>
    </div>
  </div>
</template>
