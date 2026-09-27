<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { cn } from "./cn";

export interface InputProps {
  modelValue?: string | number;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  error?: string | null;
  id?: string;
  name?: string;
  autocomplete?: string;
  autofocus?: boolean;
  class?: string;
  inputClass?: string;
}

const props = withDefaults(defineProps<InputProps>(), {
  modelValue: "",
  type: "text",
  placeholder: "",
  disabled: false,
  readonly: false,
  error: null,
  id: undefined,
  name: undefined,
  autocomplete: "off",
  autofocus: false,
  class: "",
  inputClass: "",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "blur", event: FocusEvent): void;
  (e: "focus", event: FocusEvent): void;
  (e: "keydown", event: KeyboardEvent): void;
  (e: "keyup", event: KeyboardEvent): void;
  (e: "change", event: Event): void;
}>();

const inputRef = useTemplateRef<HTMLInputElement>("input");

const inputElementClasses = computed(() => {
  return cn(
    "w-full bg-slate-900/90 border border-slate-700/80 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 focus:border-emerald-500/80 transition-all duration-150 py-2",
    props.error && "border-rose-500 focus:ring-rose-500",
    props.inputClass,
  );
});

function handleInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function focus() {
  inputRef.value?.focus();
}

defineExpose({
  focus,
  inputRef,
});
</script>

<template>
  <div :class="cn('w-full', props.class)">
    <div class="relative flex items-center">
      <div
        v-if="$slots.icon"
        class="absolute left-3 text-slate-400 pointer-events-none flex items-center justify-center"
      >
        <slot name="icon" />
      </div>

      <input
        :id="id"
        ref="input"
        :type="type"
        :value="modelValue"
        :name="name"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :autocomplete="autocomplete"
        :autofocus="autofocus"
        spellcheck="false"
        :class="[
          inputElementClasses,
          $slots.icon ? 'pl-9' : 'pl-3.5',
          $slots.rightElement ? 'pr-10' : 'pr-3.5',
        ]"
        @input="handleInput"
        @blur="(e) => emit('blur', e)"
        @focus="(e) => emit('focus', e)"
        @keydown="(e) => emit('keydown', e)"
        @keyup="(e) => emit('keyup', e)"
        @change="(e) => emit('change', e)"
      />

      <div
        v-if="$slots.rightElement"
        class="absolute right-3 flex items-center"
      >
        <slot name="rightElement" />
      </div>
    </div>
    <p v-if="error" class="mt-1 text-xs text-rose-400 font-medium">{{ error }}</p>
  </div>
</template>
