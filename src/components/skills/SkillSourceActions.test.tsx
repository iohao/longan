import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openSkillDir: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("../../api", () => ({
  api: { openSkillDir: mocks.openSkillDir },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrl,
}));

import i18n from "../../i18n";
import SkillSourceActions from "./SkillSourceActions";

const netSkill = {
  id: 7,
  source_type: "net" as const,
  owner: "acme",
  repo: "toolbox",
  source_url: "  acme/toolbox/example  ",
};

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  mocks.openSkillDir.mockResolvedValue(undefined);
  mocks.openUrl.mockResolvedValue(undefined);
});

describe("SkillSourceActions", () => {
  it("renders and runs the shared source actions", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const onRowClick = vi.fn();

    render(
      <div onClick={onRowClick}>
        <SkillSourceActions skill={netSkill} onError={onError}>
          <button type="button" aria-label="Extra action" />
        </SkillSourceActions>
      </div>,
    );

    const sourceButton = screen.getByRole("button", { name: "Open Skills Source Page" });
    expect(sourceButton.querySelector("svg")).toBeInTheDocument();
    expect(sourceButton.querySelector("img")).not.toBeInTheDocument();
    expect(sourceButton.parentElement).toHaveClass("[@media(hover:none)]:opacity-100");
    expect(screen.getByRole("button", { name: "Extra action" })).toBeInTheDocument();

    await user.click(sourceButton);
    await user.click(screen.getByRole("button", { name: "Open GitHub Repository" }));
    await user.click(screen.getByRole("button", { name: "Open Local Directory" }));

    await waitFor(() => {
      expect(mocks.openUrl).toHaveBeenNthCalledWith(
        1,
        "https://skills.sh/acme/toolbox/example",
      );
      expect(mocks.openUrl).toHaveBeenNthCalledWith(2, "https://github.com/acme/toolbox");
      expect(mocks.openSkillDir).toHaveBeenCalledWith(7);
    });
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the local directory action when source metadata is unavailable", () => {
    render(<SkillSourceActions skill={{ id: 9 }} onError={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Open Skills Source Page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open GitHub Repository" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Local Directory" })).toBeInTheDocument();
  });

  it("reports action failures through the shared error callback", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    mocks.openUrl.mockRejectedValueOnce(new Error("cannot open"));

    render(<SkillSourceActions skill={netSkill} onError={onError} />);
    await user.click(screen.getByRole("button", { name: "Open Skills Source Page" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Error: cannot open"));
  });
});
