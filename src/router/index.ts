import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: () => getInitialRoute(),
  },
  {
    path: "/market",
    name: "market",
    component: () => import("@/pages/SkillMarketPage.vue"),
  },
  {
    path: "/installed",
    name: "installed",
    component: () => import("@/pages/InstalledPage.vue"),
  },
  {
    path: "/presets",
    name: "presets",
    component: () => import("@/pages/PresetsPage.vue"),
  },
  {
    path: "/projects",
    name: "projects",
    component: () => import("@/pages/ProjectsPage.vue"),
  },
  {
    path: "/projects/:id",
    name: "project-detail",
    component: () => import("@/pages/ProjectDetailPage.vue"),
    props: (route) => ({ projectId: Number(route.params.id) }),
  },
  {
    path: "/project-groups",
    name: "project-groups",
    component: () => import("@/pages/ProjectGroupsPage.vue"),
  },
  {
    path: "/agents",
    name: "agents",
    component: () => import("@/pages/AgentsPage.vue"),
  },
  {
    path: "/migration",
    name: "migration",
    component: () => import("@/pages/MigrationPage.vue"),
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/pages/SettingsPage.vue"),
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Listen to routes for persistent navigation state
const LAST_ROUTE_KEY = "app_last_route";
router.afterEach((to) => {
  if (to.path && to.path !== "/") {
    try {
      localStorage.setItem(LAST_ROUTE_KEY, to.fullPath);
    } catch {
      // Ignore localStorage errors
    }
  }
});

export function getInitialRoute(): string {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY) || "/market";
  } catch {
    return "/market";
  }
}

export default router;
