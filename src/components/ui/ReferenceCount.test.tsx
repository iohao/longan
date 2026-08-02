import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ReferenceCount from "./ReferenceCount";

describe("ReferenceCount", () => {
  it("renders nothing when the count is unavailable", () => {
    const { container } = render(
      <ReferenceCount
        count={undefined}
        countLabel="Reference count unavailable"
        viewLabel="View references"
        onView={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders zero as a static accessible indicator", () => {
    render(
      <ReferenceCount
        count={0}
        countLabel="Referenced 0 time(s)"
        viewLabel="View references"
        onView={vi.fn()}
      />,
    );

    const indicator = screen.getByTitle("Referenced 0 time(s)");
    expect(indicator).toHaveTextContent("0");
    expect(indicator).not.toBeInstanceOf(HTMLButtonElement);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders positive counts as an interactive button without bubbling", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <ReferenceCount
          count={3}
          countLabel="Referenced 3 time(s)"
          viewLabel="View references for Example"
          onView={onView}
        />
      </div>,
    );

    const button = screen.getByRole("button", { name: "View references for Example" });
    expect(button).toHaveClass("hover:bg-emerald-500/10", "active:scale-95");
    expect(button.querySelector("svg")).toHaveClass("group-hover/reference:scale-110");

    await user.click(button);

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
