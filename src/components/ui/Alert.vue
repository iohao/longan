<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { CheckCircle2, AlertTriangle, AlertCircle, X } from "lucide-vue-next";
import { cn } from "./cn";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertProps {
  type: AlertType;
  message?: string;
  duration?: number;
  closable?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<AlertProps>(), {
  message: "",
  duration: undefined,
  closable: false,
  class: "",
});

const emit = defineEmits<{
  (e: "close"): void;
}>();

const isVisible = ref(true);
let timer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  if (props.duration && props.duration > 0) {
    timer = setTimeout(() => {
      handleClose();
    }, props.duration);
  }
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

function handleClose() {
  isVisible.value = false;
  emit("close");
}

const alertConfig = {
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-300",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  error: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
    icon: AlertTriangle,
    iconColor: "text-rose-400",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-300",
    icon: AlertTriangle,
    iconColor: "text-amber-400",
  },
  info: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-300",
    icon: AlertCircle,
    iconColor: "text-sky-400",
  },
};

const currentConfig = computed(() => alertConfig[props.type]);
const alertClasses = computed(() =>
  cn(
    "p-4 rounded-xl text-sm flex items-center gap-2 border transition-all duration-200",
    currentConfig.value.bg,
    currentConfig.value.border,
    currentConfig.value.text,
    props.class,
  ),
);
</script>

<template>
  <div v-if="isVisible" :class="alertClasses" role="alert">
    <component
      :is="currentConfig.icon"
      :class="['w-4 h-4 shrink-0', currentConfig.iconColor]"
    />
    <div class="flex-1">
      <slot>{{ message }}</slot>
    </div>
    <button
      v-if="closable"
      type="button"
      class="p-1 rounded hover:bg-black/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 cursor-pointer"
      aria-label="关闭"
      @click="handleClose"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
