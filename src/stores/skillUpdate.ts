import { defineStore } from "pinia";
import { ref } from "vue";
import { api, listenForSkillsChanged, listenForSkillUpdateChecking } from "@/api";
import { reportFrontendError } from "@/logging";
import type { Skill } from "@/types";

export const useSkillUpdateStore = defineStore("skillUpdate", () => {
  const updatableCount = ref<number>(0);
  const isChecking = ref<boolean>(false);
  const isUpdating = ref<boolean>(false);
  const updatingSkillIds = ref<number[]>([]);
  const listenerInitialized = ref<boolean>(false);

  function setUpdatableCount(count: number): void {
    updatableCount.value = count;
  }

  async function refreshUpdatableCount(): Promise<void> {
    try {
      const skills = await api.listSkills();
      updatableCount.value = skills.filter((s) => s.status === "update_available").length;
    } catch {
      // Silently ignore - badge is a non-critical hint
    }
  }

  async function checkUpdates(): Promise<number> {
    isChecking.value = true;
    try {
      const count = await api.checkUpdates();
      await refreshUpdatableCount();
      return count;
    } catch (error) {
      reportFrontendError("Failed to check skill updates", error, "useSkillUpdateStore");
      return 0;
    } finally {
      isChecking.value = false;
    }
  }

  async function updateSkill(skillId: number): Promise<Skill | null> {
    if (updatingSkillIds.value.includes(skillId)) return null;
    updatingSkillIds.value.push(skillId);

    try {
      const updated = await api.updateSkill(skillId);
      await refreshUpdatableCount();
      return updated;
    } catch (error) {
      reportFrontendError(`Failed to update skill ${skillId}`, error, "useSkillUpdateStore");
      return null;
    } finally {
      updatingSkillIds.value = updatingSkillIds.value.filter((id) => id !== skillId);
    }
  }

  async function updateSkills(skillIds: number[]): Promise<Skill[]> {
    isUpdating.value = true;
    const addedIds = skillIds.filter((id) => !updatingSkillIds.value.includes(id));
    updatingSkillIds.value.push(...addedIds);

    try {
      const updated = await api.updateSkills(skillIds);
      await refreshUpdatableCount();
      return updated;
    } catch (error) {
      reportFrontendError("Failed to update skills batch", error, "useSkillUpdateStore");
      return [];
    } finally {
      updatingSkillIds.value = updatingSkillIds.value.filter(
        (id) => !skillIds.includes(id),
      );
      isUpdating.value = false;
    }
  }

  function initEventListener(): void {
    if (listenerInitialized.value) return;
    listenerInitialized.value = true;

    void refreshUpdatableCount();

    void listenForSkillsChanged(() => {
      void refreshUpdatableCount();
    }).catch((error) => {
      reportFrontendError(
        "Failed to listen for skills changed",
        error,
        "useSkillUpdateStore",
      );
    });

    void listenForSkillUpdateChecking((checking) => {
      isChecking.value = checking;
    }).catch((error) => {
      reportFrontendError(
        "Failed to listen for skill update checking",
        error,
        "useSkillUpdateStore",
      );
    });
  }

  return {
    // State
    updatableCount,
    isChecking,
    isUpdating,
    updatingSkillIds,
    listenerInitialized,
    // Actions
    setUpdatableCount,
    refreshUpdatableCount,
    checkUpdates,
    updateSkill,
    updateSkills,
    initEventListener,
  };
});
