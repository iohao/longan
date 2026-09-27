import { defineStore } from "pinia";
import { ref } from "vue";

const STORAGE_KEY = "dev_debug_mode";

export const useDebugModeStore = defineStore("debugMode", () => {
  const debugMode = ref<boolean>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) === "true"
      : false,
  );
  const listenerInitialized = ref<boolean>(false);

  function toggleDebugMode(enabled: boolean): void {
    debugMode.value = enabled;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    }
  }

  function initStorageListener(): () => void {
    if (listenerInitialized.value || typeof window === "undefined") {
      return () => {};
    }
    listenerInitialized.value = true;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue !== null) {
        debugMode.value = event.newValue === "true";
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }

  return {
    // State
    debugMode,
    listenerInitialized,
    // Actions
    toggleDebugMode,
    initStorageListener,
  };
});
