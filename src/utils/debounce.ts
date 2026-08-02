import { useEffect, useState } from 'react';

/**
 * 防抖 Hook - 减少高频输入触发的计算开销
 * 
 * @param value 要防抖的值
 * @param delay 延迟时间 (毫秒),默认 300ms
 * @returns 防抖后的值
 * 
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 300);
 * const filtered = useMemo(() => {
 *   if (!debouncedSearch.trim()) return skills;
 *   // filter logic...
 * }, [skills, debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
