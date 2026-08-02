import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppScrollProvider } from "../../context/AppScrollContext";
import VirtualizedList, { VIRTUALIZATION_THRESHOLD } from "./VirtualizedList";

const mocks = vi.hoisted(() => ({
  useVirtualizer: vi.fn(),
  scrollToIndex: vi.fn(),
  measureElement: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mocks.useVirtualizer,
}));

interface Item {
  id: number;
  name: string;
}

function items(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Skill ${index + 1}`,
  }));
}

function AppScrollHarness({ data, resetKey }: { data: Item[]; resetKey: string }) {
  const scrollRef = useRef<HTMLElement>(null);
  return (
    <AppScrollProvider scrollRef={scrollRef}>
      <main ref={scrollRef}>
        <VirtualizedList
          items={data}
          getItemKey={(item) => item.id}
          renderItem={(item) => <span>{item.name}</span>}
          ariaLabel="Skills"
          resetKey={resetKey}
        />
      </main>
    </AppScrollProvider>
  );
}

beforeEach(() => {
  mocks.scrollToIndex.mockReset();
  mocks.measureElement.mockReset();
  mocks.useVirtualizer.mockImplementation((options: {
    count: number;
    getItemKey: (index: number) => string | number;
  }) => ({
    getTotalSize: () => options.count * 100,
    getVirtualItems: () => Array.from(
      { length: Math.min(options.count, 12) },
      (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * 100,
      }),
    ),
    measureElement: mocks.measureElement,
    scrollToIndex: mocks.scrollToIndex,
  }));
});

describe("VirtualizedList", () => {
  it("renders every item at the virtualization threshold", () => {
    render(
      <VirtualizedList
        items={items(VIRTUALIZATION_THRESHOLD)}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        ariaLabel="Skills"
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(VIRTUALIZATION_THRESHOLD);
  });

  it("keeps a 500 item list bounded to the virtual window", () => {
    render(<AppScrollHarness data={items(500)} resetKey="all" />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveAttribute("aria-setsize", "500");
    expect(mocks.measureElement).toHaveBeenCalledTimes(12);
  });

  it("scrolls to the first item when the reset key changes", () => {
    const data = items(500);
    const { rerender } = render(<AppScrollHarness data={data} resetKey="all" />);

    rerender(<AppScrollHarness data={data} resetKey="net" />);

    expect(mocks.scrollToIndex).toHaveBeenCalledWith(0, { align: "start" });
  });
});
