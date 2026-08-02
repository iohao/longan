import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PageIdBadge from "./PageIdBadge";

describe("PageIdBadge", () => {
  it("renders the page id", () => {
    render(<PageIdBadge pageId="installed-page" />);
    expect(screen.getByText("installed-page")).toBeInTheDocument();
  });

  it("copies the id to the clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PageIdBadge pageId="installed-page" />);
    await userEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("installed-page");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
