<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderOpen } from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import GithubIcon from "@/components/icons/GithubIcon.vue";
import SkillsShIcon from "@/components/icons/SkillsShIcon.vue";
import Button from "@/components/ui/Button.vue";
import HoverActionGroup from "@/components/ui/HoverActionGroup.vue";

export interface SkillActionTarget {
  id: number;
  source_type?: "net" | "local";
  owner?: string | null;
  repo?: string | null;
  source_url?: string | null;
  install_source?: "skills_sh" | "github" | "local_import" | "local" | null;
  source_path?: string | null;
}

export interface SkillSourceActionsProps {
  skill: SkillActionTarget;
  hideRepoActions?: boolean;
}

const props = withDefaults(defineProps<SkillSourceActionsProps>(), {
  hideRepoActions: false,
});

const emit = defineEmits<{
  (e: "error", message: string): void;
}>();

const { t } = useI18n();

const sourceUrl = computed(() => props.skill.source_url?.trim());
const isNet = computed(
  () => props.skill.source_type === "net" && Boolean(props.skill.owner && props.skill.repo),
);
const hasSkillsShPage = computed(
  () => Boolean(sourceUrl.value && props.skill.install_source !== "github"),
);

async function run(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    emit("error", errorMessage(error));
  }
}

function openSourcePage(event: MouseEvent) {
  event.stopPropagation();
  if (!sourceUrl.value) return;
  void run(() => openUrl(`https://skills.sh/${sourceUrl.value}`));
}

function openGithub(event: MouseEvent) {
  event.stopPropagation();
  if (!props.skill.owner || !props.skill.repo) return;
  const cleanPath = props.skill.source_path?.trim().replace(/^\/+|\/+$/g, "");
  const targetUrl = cleanPath
    ? `https://github.com/${props.skill.owner}/${props.skill.repo}/tree/HEAD/${cleanPath}`
    : `https://github.com/${props.skill.owner}/${props.skill.repo}`;
  void run(() => openUrl(targetUrl));
}

function openDirectory(event: MouseEvent) {
  event.stopPropagation();
  void run(() => api.openSkillDir(props.skill.id));
}
</script>

<template>
  <HoverActionGroup>
    <Button
      v-if="hasSkillsShPage"
      type="button"
      size="sm"
      variant="outline"
      :title="t('library.openSkillsSrcPage')"
      :aria-label="t('library.openSkillsSrcPage')"
      @click="openSourcePage"
    >
      <SkillsShIcon />
    </Button>

    <Button
      v-if="!hideRepoActions && isNet"
      type="button"
      size="sm"
      variant="outline"
      :title="t('library.openGithub')"
      :aria-label="t('library.openGithub')"
      @click="openGithub"
    >
      <GithubIcon class="h-3.5 w-3.5 text-slate-300" />
    </Button>

    <Button
      type="button"
      size="sm"
      variant="outline"
      :title="t('library.openLocalDir')"
      :aria-label="t('library.openLocalDir')"
      @click="openDirectory"
    >
      <FolderOpen class="h-3.5 w-3.5 text-slate-300" />
    </Button>

    <slot />
  </HoverActionGroup>
</template>
