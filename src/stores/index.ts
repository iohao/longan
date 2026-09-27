import { createPinia } from "pinia";

export const pinia = createPinia();

export { useProjectStore } from "./project";
export { useSkillInstallStore } from "./skillInstall";
export { useAppUpdateStore } from "./appUpdate";
export { useSkillUpdateStore } from "./skillUpdate";
export { useDebugModeStore } from "./debugMode";
