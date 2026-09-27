import {
  ref,
  watch,
  toValue,
  getCurrentScope,
  onScopeDispose,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

/**
 * 防抖 Composable - 减少高频响应式状态触发的计算开销
 *
 * @param source 要防抖的响应式值、Ref 或 Getter
 * @param delay 延迟时间 (毫秒)，默认 300ms
 * @returns 只读的防抖后的 Ref
 */
export function useDebounce<T>(
  source: MaybeRefOrGetter<T>,
  delay: number = 300,
): Readonly<Ref<T>> {
  const debouncedValue = ref(toValue(source)) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    () => toValue(source),
    (newValue) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        debouncedValue.value = newValue;
      }, delay);
    },
    { flush: "sync" },
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  return debouncedValue;
}

/**
 * 经典通用防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
