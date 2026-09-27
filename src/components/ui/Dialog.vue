<script setup lang="ts">
import { computed } from "vue";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import { X } from "lucide-vue-next";
import { cn } from "./cn";

export interface DialogProps {
  open?: boolean;
  modelValue?: boolean;
  title?: string;
  description?: string;
  maxWidth?: string;
  size?: "md" | "lg" | "xl";
  preventClose?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<DialogProps>(), {
  open: undefined,
  modelValue: undefined,
  title: "",
  description: "",
  maxWidth: "",
  size: "md",
  preventClose: false,
  class: "",
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "update:modelValue", value: boolean): void;
  (e: "close"): void;
}>();

const isOpen = computed(() => {
  if (props.open !== undefined) return props.open;
  if (props.modelValue !== undefined) return props.modelValue;
  return false;
});

const sizeClasses: Record<"md" | "lg" | "xl", string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const resolvedMaxWidth = computed(() => {
  if (props.maxWidth) return props.maxWidth;
  return sizeClasses[props.size] || "max-w-lg";
});

function handleOpenChange(val: boolean) {
  if (!val && props.preventClose) return;
  emit("update:open", val);
  emit("update:modelValue", val);
  if (!val) {
    emit("close");
  }
}
</script>

<template>
  <DialogRoot :open="isOpen" modal @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in motion-reduce:animate-none"
      />
      <DialogContent
        :class="
          cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 focus:outline-none max-h-[90vh] flex flex-col motion-reduce:animate-none',
            resolvedMaxWidth,
            props.class
          )
        "
      >
        <div class="flex items-center justify-between pb-4 border-b border-slate-800/80 shrink-0">
          <DialogTitle v-if="title" class="text-base font-semibold text-slate-100">
            {{ title }}
          </DialogTitle>
          <slot name="title" />

          <DialogClose
            class="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800/80 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            aria-label="Close"
          >
            <X class="w-4 h-4" />
          </DialogClose>
        </div>

        <DialogDescription v-if="description" class="text-sm text-slate-400 mt-2 shrink-0">
          {{ description }}
        </DialogDescription>
        <DialogDescription v-else class="sr-only">
          {{ title || 'Dialog' }}
        </DialogDescription>

        <div class="py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <slot />
        </div>

        <div
          v-if="$slots.footer"
          class="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/80 shrink-0"
        >
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
