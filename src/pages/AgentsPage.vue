<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Globe,
  FolderGit2,
  Search,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { Agent, Project } from "@/types";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Badge from "@/components/ui/Badge.vue";
import Dialog from "@/components/ui/Dialog.vue";
import Input from "@/components/ui/Input.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Alert from "@/components/ui/Alert.vue";

export interface AgentsPageProps {
  onAgentsChanged?: () => void;
}

const props = withDefaults(defineProps<AgentsPageProps>(), {
  onAgentsChanged: undefined,
});

const emit = defineEmits<{
  (e: "agentsChanged"): void;
}>();

const { t } = useI18n();
const router = useRouter();

const SUGGESTIONS = [{ name: "claude", dir: ".claude/skills" }];

const agents = ref<Agent[]>([]);
const projects = ref<Project[]>([]);
const error = ref<string | null>(null);
const modalOpen = ref(false);
const deleteTarget = ref<Agent | null>(null);
const editTarget = ref<Agent | null>(null);
const linkedTarget = ref<Agent | null>(null);
const selectedProjectId = ref<number | null>(null);
const searchQuery = ref("");

// Form state
const formName = ref("");
const formDir = ref("");
const formGlobal = ref(false);

async function reload() {
  try {
    const [agentList, projectList] = await Promise.all([
      api.listAgents(),
      api.listProjects(),
    ]);
    agents.value = agentList;
    projects.value = projectList;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

onMounted(() => {
  void reload();
});

function openCreate() {
  editTarget.value = null;
  formName.value = "";
  formDir.value = "";
  formGlobal.value = false;
  modalOpen.value = true;
}

function openEdit(agent: Agent) {
  editTarget.value = agent;
  formName.value = agent.name;
  formDir.value = agent.target_dir;
  formGlobal.value = agent.global_enabled;
  modalOpen.value = true;
}

async function handleSubmit() {
  error.value = null;
  try {
    if (editTarget.value) {
      await api.updateAgent(
        editTarget.value.id,
        formName.value,
        formDir.value,
        formGlobal.value,
      );
    } else {
      await api.createAgent(formName.value, formDir.value, formGlobal.value);
    }
    modalOpen.value = false;
    await reload();
    props.onAgentsChanged?.();
    emit("agentsChanged");
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  error.value = null;
  try {
    await api.deleteAgent(deleteTarget.value.id);
    deleteTarget.value = null;
    await reload();
    props.onAgentsChanged?.();
    emit("agentsChanged");
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function toggleGlobal(agent: Agent) {
  error.value = null;
  try {
    await api.updateAgent(
      agent.id,
      agent.name,
      agent.target_dir,
      !agent.global_enabled,
    );
    await reload();
    props.onAgentsChanged?.();
    emit("agentsChanged");
  } catch (e) {
    error.value = errorMessage(e);
  }
}

function applySuggestion(s: { name: string; dir: string }) {
  formName.value = s.name;
  formDir.value = s.dir;
}

const filteredAgents = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return agents.value;
  return agents.value.filter(
    (agent) =>
      agent.name.toLowerCase().includes(query) ||
      agent.target_dir.toLowerCase().includes(query),
  );
});

function linkedProjectsOf(agent: Agent): Project[] {
  return projects.value.filter((p) => p.agent_ids.includes(agent.id));
}

const linkedProjects = computed(() =>
  linkedTarget.value ? linkedProjectsOf(linkedTarget.value) : [],
);

function navigateToProject(projectId: number) {
  selectedProjectId.value = projectId;
  linkedTarget.value = null;
  window.dispatchEvent(
    new CustomEvent("navigateToProject", { detail: projectId }),
  );
  router.push({ name: "project-detail", params: { id: projectId } }).catch(() => {});
}
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-slate-100 flex items-center gap-3">
        <Bot class="w-6 h-6 text-emerald-400" />
        {{ t("agents.header") }}
      </h1>
      <p class="text-sm text-slate-400 mt-2">{{ t("agents.pageDesc") }}</p>
    </div>

    <!-- Info Banner -->
    <Alert type="info" :message="t('agents.infoBannerMessage')" />

    <!-- Action Bar -->
    <div
      class="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50"
    >
      <div class="flex items-center gap-2">
        <div class="w-full sm:w-64">
          <Input
            v-model="searchQuery"
            :placeholder="t('agents.searchPlaceholder') || '搜索 Agent...'"
          >
            <template #icon>
              <Search class="w-4 h-4 text-slate-500" />
            </template>
          </Input>
        </div>
        <Badge v-if="agents.length > 0" variant="neutral" class="px-2.5 py-1">
          {{ filteredAgents.length }} / {{ agents.length }}
        </Badge>
      </div>
      <Button
        variant="primary"
        size="sm"
        class="w-full sm:w-auto"
        @click="openCreate"
      >
        <template #icon>
          <Plus class="w-4 h-4" />
        </template>
        <span>{{ t("agents.create") }}</span>
      </Button>
    </div>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2"
    >
      {{ error }}
    </div>

    <!-- Agent List -->
    <EmptyState
      v-if="agents.length === 0"
      :title="t('agents.createFirst')"
    >
      <template #icon>
        <Bot class="w-8 h-8 text-slate-500" />
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="filteredAgents.length === 0"
      :title="t('agents.noResults')"
      :description="t('agents.noResultsDesc')"
    >
      <template #icon>
        <Globe class="w-8 h-8 text-slate-500" />
      </template>
    </EmptyState>

    <div v-else class="space-y-3">
      <Card
        v-for="agent in filteredAgents"
        :key="agent.id"
        :hover-effect="false"
        class="group p-4 transition-all hover:bg-slate-800/30"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div
              :class="[
                'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                agent.global_enabled ? 'bg-emerald-500/10' : 'bg-slate-800',
              ]"
            >
              <Bot
                :class="[
                  'w-5 h-5',
                  agent.global_enabled ? 'text-emerald-400' : 'text-slate-400',
                ]"
              />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-base font-semibold text-slate-100">
                  {{ agent.name }}
                </span>
                <Badge
                  v-if="agent.global_enabled"
                  variant="success"
                  class="text-[10px] font-medium px-2 py-0.5"
                >
                  {{ t("projects.agentGlobal") }}
                </Badge>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <code
                  class="text-xs bg-slate-900/50 text-slate-400 px-2 py-0.5 rounded border border-slate-700/50 font-mono"
                >
                  {{ agent.target_dir }}
                </code>
              </div>
            </div>
          </div>

          <div
            class="flex items-center gap-1 ml-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              type="button"
              :title="t('agents.viewLinkedProjects')"
              class="flex cursor-pointer items-center gap-1 p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              @click="linkedTarget = agent"
            >
              <FolderGit2 class="w-4 h-4" />
              <span class="text-xs font-medium tabular-nums">
                {{ agent.global_enabled ? projects.length : linkedProjectsOf(agent).length }}
              </span>
            </button>
            <button
              type="button"
              :title="agent.global_enabled ? t('agents.disableGlobal') : t('agents.enableGlobal')"
              :class="[
                'p-2 rounded-lg transition-all cursor-pointer',
                agent.global_enabled
                  ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                  : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10',
              ]"
              @click="toggleGlobal(agent)"
            >
              <Globe class="w-4 h-4" />
            </button>
            <button
              type="button"
              :title="t('common.edit')"
              class="p-2 cursor-pointer rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              @click="openEdit(agent)"
            >
              <Pencil class="w-4 h-4" />
            </button>
            <button
              type="button"
              :title="t('common.delete')"
              class="p-2 cursor-pointer rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              @click="deleteTarget = agent"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>

    <!-- Create/Edit Modal -->
    <Dialog
      :open="modalOpen"
      :title="editTarget ? t('agents.editTitle') : t('agents.createTitle')"
      @close="modalOpen = false"
    >
      <div class="space-y-4">
        <!-- Suggestions -->
        <div v-if="!editTarget">
          <label class="text-xs text-slate-400 mb-1.5 block">
            {{ t("agents.suggestions") }}
          </label>
          <div class="flex gap-2">
            <button
              v-for="s in SUGGESTIONS"
              :key="s.name"
              type="button"
              class="text-xs px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-all cursor-pointer"
              @click="applySuggestion(s)"
            >
              {{ s.name }} → {{ s.dir }}
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-300 mb-1.5 block">
            {{ t("agents.name") }}
          </label>
          <Input
            v-model="formName"
            :placeholder="t('agents.namePlaceholder')"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-slate-300 mb-1.5 block">
            {{ t("agents.targetDir") }}
          </label>
          <Input
            v-model="formDir"
            :placeholder="t('agents.targetDirPlaceholder')"
          />
          <p class="text-xs text-slate-500 mt-1">{{ t("agents.targetDirHint") }}</p>
        </div>

        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            v-model="formGlobal"
            type="checkbox"
            class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
          />
          <span class="text-sm text-slate-200">{{ t("agents.globalEnabled") }}</span>
        </label>
        <p class="text-xs text-slate-500 ml-6 -mt-2">
          {{ t("agents.globalEnabledHint") }}
        </p>
      </div>

      <template #footer>
        <Button variant="ghost" size="sm" @click="modalOpen = false">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="primary"
          size="sm"
          :disabled="!formName.trim() || !formDir.trim()"
          @click="handleSubmit"
        >
          {{ t("common.save") }}
        </Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Modal -->
    <Dialog
      :open="deleteTarget !== null"
      :title="t('agents.deleteTitle')"
      @close="deleteTarget = null"
    >
      <p class="text-sm text-slate-300">
        {{ t("agents.deleteConfirm", { name: deleteTarget?.name }) }}
      </p>
      <p class="text-xs text-slate-500 mt-2">{{ t("agents.deleteNote") }}</p>

      <template #footer>
        <Button variant="ghost" size="sm" @click="deleteTarget = null">
          {{ t("common.cancel") }}
        </Button>
        <Button variant="danger" size="sm" @click="handleDelete">
          {{ t("common.delete") }}
        </Button>
      </template>
    </Dialog>

    <!-- Linked Projects Modal -->
    <Dialog
      :open="linkedTarget !== null && selectedProjectId === null"
      :title="t('agents.linkedProjectsTitle', { name: linkedTarget?.name })"
      @close="
        linkedTarget = null;
        selectedProjectId = null;
      "
    >
      <Alert
        v-if="linkedTarget?.global_enabled"
        type="info"
        :message="t('agents.linkedGlobalNote')"
      />
      <EmptyState
        v-else-if="linkedProjects.length === 0"
        :title="t('agents.linkedEmpty')"
        :description="t('agents.linkedEmptyDesc')"
      >
        <template #icon>
          <FolderGit2 class="w-8 h-8 text-slate-500" />
        </template>
      </EmptyState>
      <div v-else class="space-y-3">
        <p class="text-xs text-slate-400">
          {{ t("agents.linkedCount", { count: linkedProjects.length }) }}
        </p>
        <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
          <button
            v-for="project in linkedProjects"
            :key="project.id"
            type="button"
            class="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-emerald-500/40 hover:shadow-lg transition-all duration-200 text-left cursor-pointer group"
            @click="navigateToProject(project.id)"
          >
            <FolderGit2
              class="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors"
            />
            <div class="min-w-0 flex-1">
              <div
                class="text-sm font-medium text-slate-100 group-hover:text-emerald-400 transition-colors truncate"
              >
                {{ project.name }}
              </div>
              <div
                class="text-xs text-slate-500 font-mono truncate group-hover:text-slate-300 transition-colors"
              >
                {{ project.path }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          size="sm"
          @click="
            linkedTarget = null;
            selectedProjectId = null;
          "
        >
          {{ t("common.close") }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>
