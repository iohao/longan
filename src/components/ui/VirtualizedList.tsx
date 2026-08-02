import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppScrollRef } from "../../context/AppScrollContext";

export const VIRTUALIZATION_THRESHOLD = 50;

interface VirtualizedListProps<T> {
  items: readonly T[];
  getItemKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  ariaLabel: string;
  resetKey?: unknown;
  estimateSize?: number;
  gap?: number;
  overscan?: number;
  className?: string;
}

export default function VirtualizedList<T>({
  items,
  getItemKey,
  renderItem,
  ariaLabel,
  resetKey,
  estimateSize = 88,
  gap = 12,
  overscan = 6,
  className = "",
}: VirtualizedListProps<T>) {
  const appScrollRef = useAppScrollRef();
  const listRef = useRef<HTMLDivElement>(null);
  const previousResetKey = useRef(resetKey);
  const [scrollMargin, setScrollMargin] = useState(0);
  const shouldVirtualize = items.length > VIRTUALIZATION_THRESHOLD && appScrollRef !== null;

  const measureScrollMargin = useCallback(() => {
    const listElement = listRef.current;
    const scrollElement = appScrollRef?.current;
    if (!listElement || !scrollElement) return;

    const nextMargin =
      listElement.getBoundingClientRect().top
      - scrollElement.getBoundingClientRect().top
      + scrollElement.scrollTop;
    setScrollMargin((current) => (current === nextMargin ? current : nextMargin));
  }, [appScrollRef]);

  useLayoutEffect(() => {
    measureScrollMargin();
    const scrollElement = appScrollRef?.current;
    const listElement = listRef.current;
    if (!scrollElement || !listElement) return;

    window.addEventListener("resize", measureScrollMargin);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measureScrollMargin);
    }

    const observer = new ResizeObserver(measureScrollMargin);
    observer.observe(scrollElement);
    observer.observe(listElement);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureScrollMargin);
    };
  }, [appScrollRef, measureScrollMargin]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => appScrollRef?.current ?? null,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getItemKey(items[index]),
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan,
    gap,
    scrollMargin,
  });

  useEffect(() => {
    if (Object.is(previousResetKey.current, resetKey)) return;
    previousResetKey.current = resetKey;
    if (items.length === 0) return;
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(0, { align: "start" });
    } else {
      appScrollRef?.current?.scrollTo({ top: scrollMargin });
    }
  }, [appScrollRef, items.length, resetKey, scrollMargin, shouldVirtualize, virtualizer]);

  if (!shouldVirtualize) {
    return (
      <div ref={listRef} role="list" aria-label={ariaLabel} className={className}>
        {items.map((item, index) => (
          <div
            key={getItemKey(item)}
            role="listitem"
            aria-posinset={index + 1}
            aria-setsize={items.length}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={ariaLabel}
      className={`relative w-full ${className}`}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index];
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            role="listitem"
            aria-posinset={virtualItem.index + 1}
            aria-setsize={items.length}
            className="absolute left-0 top-0 w-full"
            style={{
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}
