import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useDebounce, debounce } from "./debounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("only exposes the new value after the delay", () => {
    const value = ref("a");
    const debounced = useDebounce(value, 300);

    expect(debounced.value).toBe("a");

    value.value = "ab";
    expect(debounced.value).toBe("a");

    vi.advanceTimersByTime(299);
    expect(debounced.value).toBe("a");

    vi.advanceTimersByTime(1);
    expect(debounced.value).toBe("ab");
  });

  it("restarts the timer on rapid changes", () => {
    const value = ref("a");
    const debounced = useDebounce(value, 300);

    value.value = "ab";
    vi.advanceTimersByTime(200);

    value.value = "abc";
    vi.advanceTimersByTime(200);

    expect(debounced.value).toBe("a"); // neither intermediate value ever landed

    vi.advanceTimersByTime(100);
    expect(debounced.value).toBe("abc");
  });
});

describe("debounce function", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced(1);
    debounced(2);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });
});
