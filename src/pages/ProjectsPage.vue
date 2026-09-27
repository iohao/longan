<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderGit2,
  FolderInput,
  FolderOpen,
  FolderTree,
  FolderX,
  LayoutList,
  ListTree,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import ProjectGroupsPage from "./ProjectGroupsPage.vue";
import type { Preset, Project, ProjectGroup } from "@/types";
import { getProjectSkillCount } from "@/types";
import {
  buildProjectGroupSections,
} from "@/utils/projectOrder";
import { useProjectStore } from "@/stores/project";

export interface ProjectsPageProps {
  projects?: Project[];
  projectGroups?: ProjectGroup[];
  presets?: Preset[];
  showHiddenProjectsInSidebar?: boolean;
  onSelectProject?: (id: number | null) => void;
  onReloadProjects?: () => Promise<void>;
  onAddProject?: () => Promise<void>;
  onSetHiddenProjectsPreview?: (show: boolean) => Promise<void>;
}

const props = withDefaults(defineProps<ProjectsPageProps>(), {
  projects: undefined,
  projectGroups: undefined,
  presets: undefined,
  showHiddenProjectsInSidebar: undefined,
  onSelectProject: undefined,
  onReloadProjects: undefined,
  onAddProject: undefined,
  onSetHiddenProjectsPreview: undefined,
});

const emit = defineEmits<{
  (e: "selectProject", id: number | null): void;
  (e: "reloadProjects"): void;
}>();

const { t } = useI18n();
const router = useRouter();
const projectStore = useProjectStore();

type ProjectsView = "overview" | "groups";

const activeView = ref<ProjectsView>("overview");
const error = ref<string | null>(null);
const pendingAction = ref<string | null>(null);
const assignmentTarget = ref<Project | null>(null);
const assignmentGroupId = ref(0);
const deleteProjectTarget = ref<Project | null>(null);

const projects = computed(() => props.projects ?? projectStore.projects);
const projectGroups = computed(() => props.projectGroups ?? projectStore.projectGroups);
const presets = computed(() => props.presets ?? projectStore.presets);
const showHiddenPreview = computed(
  () => props.showHiddenProjectsInSidebar ?? projectStore.showHiddenProjectsInSidebar,
);

async function reload() {
  try {
    if (props.onReloadProjects) {
      await props.onReloadProjects();
    } else {
      await projectStore.reloadProjects();
    }
    emit("reloadProjects");
  } catch (reloadError) {
    error.value = errorMessage(reloadError);
  }
}

onMounted(() => {
  if (
    props.projects === undefined ||
    props.projectGroups === undefined ||
    props.presets === undefined
  ) {
    void reload();
  }
});

const sections = computed(() =>
  buildProjectGroupSections(projectGroups.value, projects.value),
);

const firstHiddenGroupIndex = computed(() =>
  sections.value.findIndex(({ group }) => group.hidden),
);

const hasHiddenItems = computed(() =>
  sections.value.some(
    ({ group, hiddenProjects }) => group.hidden || hiddenProjects.length > 0,
  ),
);

function groupLabel(group: ProjectGroup): string {
  return group.is_system ? t("projectGroups.ungrouped") : group.name ?? "";
}

async function runAction(
  key: string,
  action: () => Promise<unknown>,
  refresh = true,
): Promise<boolean> {
  if (pendingAction.value !== null) return false;
  error.value = null;
  pendingAction.value = key;
  try {
    await action();
    if (refresh) await reload();
    return true;
  } catch (actionError) {
    error.value = errorMessage(actionError);
    return false;
  } finally {
    pendingAction.value = null;
  }
}

function handleSelectProject(id: number | null) {
  if (props.onSelectProject) {
    props.onSelectProject(id);
  }
  emit("selectProject", id);
  if (id !== null) {
    router.push({ name: "project-detail", params: { id } }).catch(() => {});
  }
}

async function assignProject() {
  if (!assignmentTarget.value) return;
  const targetId = assignmentTarget.value.id;
  const targetGroupId = assignmentGroupId.value;
  const success = await runAction("assign-project", () =>
    api.setProjectGroup(targetId, targetGroupId),
  );
  if (success) assignmentTarget.value = null;
}

async function deleteProject() {
  if (!deleteProjectTarget.value) return;
  const targetId = deleteProjectTarget.value.id;
  const success = await runAction("delete-project", () =>
    api.deleteProject(targetId),
  );
  if (success) deleteProjectTarget.value = null;
}

async function toggleHiddenPreview() {
  const next = !showHiddenPreview.value;
  await runAction(
    "hidden-preview",
    async () => {
      if (props.onSetHiddenProjectsPreview) {
        await props.onSetHiddenProjectsPreview(next);
      } else {
        await projectStore.setHiddenProjectsPreview(next);
      }
    },
    false,
  );
}

async function openProjectDirectory(path: string) {
  await runAction("open-project", () => api.openPath(path), false);
}

async function addProject() {
  if (props.onAddProject) {
    await runAction("add-project", props.onAddProject, false);
    return;
  }
  try {
    const path = await open({ directory: true, multiple: false });
    if (typeof path !== "string") return;
    let projectId: number | null = null;
    const success = await runAction("add-project", async () => {
      projectId = await api.addProject(path);
    });
    if (success && projectId !== null) handleSelectProject(projectId);
  } catch (openError) {
    error.value = errorMessage(openError);
  }
}

const actionButtonClass =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800/80 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 motion-reduce:transition-none md:h-8 md:w-8";

const dangerActionButtonClass =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-rose-400 transition-colors duration-150 hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500/60 motion-reduce:transition-none md:h-8 md:w-8";
</script>

<template>
  <div class="w-full max-w-7xl space-y-6">
    <!-- Header -->
    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <div class="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
          <FolderGit2 class="h-3.5 w-3.5" />
          <span>Workspace Sync</span>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-100">
          {{ t("nav.projects") }}
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          {{ t("projects.pageDescription") }}
        </p>
      </div>

      <div v-if="activeView === 'overview'" class="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          v-if="hasHiddenItems || showHiddenPreview"
          variant="outline"
          size="sm"
          :loading="pendingAction === 'hidden-preview'"
          :aria-pressed="showHiddenPreview"
          :aria-label="t(showHiddenPreview ? 'projects.endHiddenProjectsPreview' : 'projectGroups.showHiddenItems')"
          :title="t(showHiddenPreview ? 'projects.endHiddenProjectsPreview' : 'projectGroups.showHiddenItems')"
          class="h-9 w-9 p-0"
          @click="toggleHiddenPreview"
        >
          <template #icon>
            <Eye v-if="showHiddenPreview" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </template>
        </Button>
        <Button
          variant="primary"
          :loading="pendingAction === 'add-project'"
          @click="addProject"
        >
          <template #icon>
            <Plus class="h-4 w-4" />
          </template>
          {{ t("projects.add") }}
        </Button>
      </div>
    </div>

    <!-- View Switcher Tabs -->
    <div
      role="tablist"
      :aria-label="t('projectGroups.viewLabel')"
      class="inline-flex border border-slate-800/80 bg-slate-950/35 p-1"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'overview'"
        :class="[
          'flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 motion-reduce:transition-none',
          activeView === 'overview'
            ? 'bg-slate-800 text-slate-100'
            : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200',
        ]"
        @click="activeView = 'overview'"
      >
        <LayoutList class="h-4 w-4" />
        <span>{{ t("projectGroups.overviewTab") }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'groups'"
        :class="[
          'flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 motion-reduce:transition-none',
          activeView === 'groups'
            ? 'bg-slate-800 text-slate-100'
            : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200',
        ]"
        @click="activeView = 'groups'"
      >
        <ListTree class="h-4 w-4" />
        <span>{{ t("projectGroups.manageTab") }}</span>
      </button>
    </div>

    <!-- Groups View -->
    <ProjectGroupsPage
      v-if="activeView === 'groups'"
      :projects="projects"
      :project-groups="projectGroups"
      @reload-projects="reload"
    />

    <!-- Overview View -->
    <div v-else class="space-y-5">
      <div
        v-if="error"
        role="alert"
        class="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400"
      >
        <AlertCircle class="h-4 w-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <template
        v-for="({ group, visibleProjects, hiddenProjects }, sectionIndex) in sections"
        :key="group.id"
      >
        <!-- Separator for hidden groups -->
        <div
          v-if="sectionIndex === firstHiddenGroupIndex && group.hidden"
          role="separator"
          :aria-label="t('projectGroups.hiddenGroups')"
          class="flex items-center gap-2 py-1 text-xs font-medium text-slate-500 after:h-px after:flex-1 after:bg-slate-800/80"
        >
          <EyeOff class="h-3.5 w-3.5" />
          <span>{{ t("projectGroups.hiddenGroups") }}</span>
        </div>

        <section
          :aria-labelledby="`project-group-${group.id}`"
          :class="[
            'group/project-group overflow-hidden border-y border-r border-slate-800/70 border-l-2',
            group.hidden ? 'border-l-slate-700' : 'border-l-emerald-600/60',
          ]"
        >
          <div class="flex min-h-12 items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-900/25 px-3 sm:px-4">
            <div class="flex min-w-0 items-center gap-2">
              <EyeOff v-if="group.hidden" class="h-4 w-4 shrink-0 text-slate-500" />
              <FolderTree v-else class="h-4 w-4 shrink-0 text-emerald-400" />
              <h2 :id="`project-group-${group.id}`" class="truncate text-sm font-semibold text-slate-200">
                {{ groupLabel(group) }}
              </h2>
              <Badge v-if="group.hidden" variant="neutral">
                {{ t("projectGroups.hiddenFromSidebar") }}
              </Badge>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="!group.is_system"
                type="button"
                :title="t(group.hidden ? 'projectGroups.showInSidebar' : 'projectGroups.hideFromSidebar')"
                :aria-label="t(group.hidden ? 'projectGroups.showInSidebar' : 'projectGroups.hideFromSidebar')"
                :disabled="pendingAction !== null"
                :class="[
                  actionButtonClass,
                  'opacity-0 transition-opacity group-hover/project-group:opacity-100 group-focus-within/project-group:opacity-100',
                ]"
                @click="void runAction('hide-group', () => api.setProjectGroupHidden(group.id, !group.hidden))"
              >
                <EyeOff v-if="group.hidden" class="h-4 w-4" />
                <Eye v-else class="h-4 w-4" />
              </button>
              <span class="text-xs tabular-nums text-slate-500">
                {{ t("projectGroups.projectCount", { count: visibleProjects.length + hiddenProjects.length }) }}
              </span>
            </div>
          </div>

          <p
            v-if="visibleProjects.length + hiddenProjects.length === 0"
            class="px-4 py-4 text-xs text-slate-500"
          >
            {{ t("projectGroups.empty") }}
          </p>

          <ul v-else>
            <!-- Visible and Hidden Projects list -->
            <li
              v-for="project in [...visibleProjects, ...hiddenProjects]"
              :key="project.id"
              :class="[
                'group/project relative border-b border-slate-800/70 transition-colors duration-150 last:border-b-0 hover:bg-slate-900/55 focus-within:bg-slate-900/55 motion-reduce:transition-none',
                project.hidden ? 'bg-slate-950/20' : '',
              ]"
            >
              <button
                type="button"
                :aria-label="project.name"
                class="absolute inset-0 z-0 cursor-pointer rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
                @click="handleSelectProject(project.id)"
              />

              <div class="pointer-events-none relative z-10 flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 class="min-w-0 truncate text-sm font-semibold text-slate-100">
                      {{ project.name }}
                    </h3>
                    <Badge v-if="project.hidden" variant="neutral">
                      {{ t("projects.hiddenFromSidebar") }}
                    </Badge>
                    <Badge v-if="!project.path_exists" variant="danger">
                      <FolderX class="h-3 w-3" />
                      <span>{{ t("projects.pathMissing") }}</span>
                    </Badge>
                  </div>
                  <p class="mt-1 truncate font-mono text-xs text-slate-500" :title="project.path">
                    {{ project.path }}
                  </p>
                </div>

                <div class="relative flex min-h-9 w-full shrink-0 items-center justify-end sm:w-72 md:min-h-8">
                  <!-- Skill Count Preview (hidden on hover) -->
                  <div class="flex flex-wrap items-center justify-end gap-x-2 text-xs tabular-nums text-slate-500 transition-opacity duration-150 group-hover/project:opacity-0 group-focus-within/project:opacity-0 motion-reduce:transition-none [@media(hover:none)]:opacity-0">
                    <span>{{ t("projects.skillsCount", { count: getProjectSkillCount(project, presets) }) }}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {{
                        t("projects.assignmentSummary", {
                          presets: project.preset_ids.length,
                          direct: project.skill_ids.length,
                        })
                      }}
                    </span>
                  </div>

                  <!-- Project Actions (visible on hover) -->
                  <div
                    role="group"
                    :aria-label="t('projects.operations')"
                    class="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 motion-reduce:transition-none [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                  >
                    <button
                      type="button"
                      :title="t('projects.moveUp')"
                      :aria-label="t('projects.moveUp')"
                      :disabled="
                        (project.hidden
                          ? hiddenProjects.findIndex((pr) => pr.id === project.id)
                          : visibleProjects.findIndex((pr) => pr.id === project.id)) <= 0 ||
                        pendingAction !== null
                      "
                      :class="actionButtonClass"
                      @click="void runAction('move-project', () => api.moveProject(project.id, 'up'))"
                    >
                      <ChevronUp class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      :title="t('projects.moveDown')"
                      :aria-label="t('projects.moveDown')"
                      :disabled="
                        (project.hidden
                          ? hiddenProjects.findIndex((pr) => pr.id === project.id) === hiddenProjects.length - 1
                          : visibleProjects.findIndex((pr) => pr.id === project.id) === visibleProjects.length - 1) ||
                        pendingAction !== null
                      "
                      :class="actionButtonClass"
                      @click="void runAction('move-project', () => api.moveProject(project.id, 'down'))"
                    >
                      <ChevronDown class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      :title="t('projectGroups.changeGroup')"
                      :aria-label="t('projectGroups.changeGroup')"
                      :class="actionButtonClass"
                      @click="
                        assignmentGroupId = project.group_id;
                        assignmentTarget = project;
                      "
                    >
                      <FolderInput class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      :title="t('projects.openDir')"
                      :aria-label="t('projects.openDir')"
                      :class="actionButtonClass"
                      @click="void openProjectDirectory(project.path)"
                    >
                      <FolderOpen class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      :title="t(project.hidden ? 'projects.showInSidebar' : 'projects.hideFromSidebar')"
                      :aria-label="t(project.hidden ? 'projects.showInSidebar' : 'projects.hideFromSidebar')"
                      :disabled="pendingAction !== null"
                      :class="actionButtonClass"
                      @click="void runAction('hide-project', () => api.setProjectHidden(project.id, !project.hidden))"
                    >
                      <EyeOff v-if="project.hidden" class="h-4 w-4" />
                      <Eye v-else class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      :title="t('common.delete')"
                      :aria-label="t('common.delete')"
                      :class="dangerActionButtonClass"
                      @click="deleteProjectTarget = project"
                    >
                      <Trash2 class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <!-- Change Group Dialog -->
    <Dialog
      :open="assignmentTarget !== null"
      :title="t('projectGroups.changeGroupTitle')"
      @close="assignmentTarget = null"
    >
      <div class="space-y-3">
        <label for="project-group-assignment" class="block text-xs font-medium text-slate-400">
          {{ t("projectGroups.groupForProject", { name: assignmentTarget?.name ?? "" }) }}
        </label>
        <select
          id="project-group-assignment"
          v-model="assignmentGroupId"
          class="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 focus:border-emerald-500/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        >
          <option
            v-for="{ group } in sections"
            :key="group.id"
            :value="group.id"
          >
            {{ groupLabel(group) }}
          </option>
        </select>
      </div>

      <template #footer>
        <Button variant="ghost" @click="assignmentTarget = null">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="primary"
          :loading="pendingAction === 'assign-project'"
          :disabled="assignmentTarget?.group_id === assignmentGroupId"
          @click="assignProject"
        >
          {{ t("common.save") }}
        </Button>
      </template>
    </Dialog>

    <!-- Delete Project Dialog -->
    <Dialog
      :open="deleteProjectTarget !== null"
      :title="t('projects.deleteTitle')"
      @close="deleteProjectTarget = null"
    >
      <p v-if="deleteProjectTarget" class="text-sm leading-relaxed text-slate-300">
        {{ t("projects.deleteConfirm", { name: deleteProjectTarget.name }) }}
      </p>

      <template #footer>
        <Button variant="ghost" size="sm" @click="deleteProjectTarget = null">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="danger"
          size="sm"
          :loading="pendingAction === 'delete-project'"
          @click="deleteProject"
        >
          <template #icon>
            <Trash2 class="h-4 w-4" />
          </template>
          {{ t("common.delete") }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>
