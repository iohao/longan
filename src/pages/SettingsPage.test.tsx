import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeText: vi.fn(),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  verifyGithubToken: vi.fn(async () => true),
  getStorageDir: vi.fn(async () => ({
    configuredDir: "",
    currentDir: "/tmp/longan",
    isDefault: true,
    restartRequired: false,
  })),
}));

vi.mock("../api", () => ({
  api: {
    getSetting: mocks.getSetting,
    setSetting: mocks.setSetting,
    verifyGithubToken: mocks.verifyGithubToken,
    getStorageDir: mocks.getStorageDir,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../context/DebugModeContext", () => ({
  useDebugMode: () => ({ debugMode: false, toggleDebugMode: vi.fn() }),
}));

vi.mock("../context/UpdateContext", () => ({
  useAppUpdate: () => ({ currentVersion: "0.1.0", availableUpdate: null }),
}));

vi.mock("../components/ui/AnchoredSectionTabs", () => ({
  default: ({
    sections,
  }: {
    sections: Array<{ id: string; label: string; content: ReactNode }>;
  }) => (
    <>
      {sections.map((section) => (
        <section key={section.id}>
          <button type="button">{section.label}</button>
          {section.content}
        </section>
      ))}
    </>
  ),
}));

import i18n from "../i18n";
import SettingsPage from "./SettingsPage";

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("zh");
  mocks.writeText.mockResolvedValue(undefined);
  mocks.getSetting.mockResolvedValue(null);
  mocks.setSetting.mockResolvedValue(undefined);
  mocks.verifyGithubToken.mockResolvedValue(true);
  mocks.getStorageDir.mockResolvedValue({
    configuredDir: "",
    currentDir: "/tmp/longan",
    isDefault: true,
    restartRequired: false,
  });
});

describe("SettingsPage", () => {
  it("copies a localized repository introduction when sharing", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "分享" }));

    expect(mocks.writeText).toHaveBeenCalledWith(
      "推荐一个开源的 AI Agent Skill 管理工具。\n\n" +
        "集中安装和管理 Skill，支持 Preset 预设组合，并按项目同步所需 Skill；一份存储，多项目复用，减少重复文件。\n\n" +
        "GitHub：https://github.com/iohao/longan"
    );
  });

  it("uses the same text for the About tab and section heading", () => {
    render(<SettingsPage />);

    expect(screen.getAllByText("关于")).toHaveLength(2);
  });

  it("does not expose Skill update detection as a Settings tab", () => {
    render(<SettingsPage />);

    expect(screen.queryByRole("button", { name: "skill 检测更新" })).not.toBeInTheDocument();
  });

  it("does not expose page-switching keyboard shortcuts", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("checkbox", { name: "Debug Mode" })).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "启用快捷键切换页面" })
    ).not.toBeInTheDocument();
  });

  it("uses eye icons to show the current token visibility", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const tokenInput = screen.getByPlaceholderText("ghp_xxxxxxxxxxxxxxxxxxxx");
    const showToken = screen.getByRole("button", { name: "显示令牌" });
    expect(tokenInput).toHaveAttribute("type", "password");
    expect(showToken.querySelector(".lucide-eye-off")).toBeInTheDocument();

    await user.click(showToken);

    expect(tokenInput).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "隐藏令牌" }).querySelector(".lucide-eye"),
    ).toBeInTheDocument();
  });

  it("validates and reports a valid GitHub token when saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(
      screen.getByPlaceholderText("ghp_xxxxxxxxxxxxxxxxxxxx"),
      "  ghp_valid  "
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.setSetting).toHaveBeenCalledWith("github_token", "ghp_valid");
      expect(mocks.verifyGithubToken).toHaveBeenCalledWith("ghp_valid");
    });
    expect(mocks.verifyGithubToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setSetting.mock.invocationCallOrder[0]
    );
    expect(screen.getByText("令牌有效")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "验证令牌" })).not.toBeInTheDocument();
  });

  it("reports an invalid GitHub token when saving", async () => {
    mocks.verifyGithubToken.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(
      screen.getByPlaceholderText("ghp_xxxxxxxxxxxxxxxxxxxx"),
      "ghp_invalid"
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("令牌无效")).toBeInTheDocument();
    expect(mocks.verifyGithubToken).toHaveBeenCalledWith("ghp_invalid");
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("does not save a GitHub token when verification fails", async () => {
    mocks.verifyGithubToken.mockRejectedValueOnce(new Error("Token expired"));
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.type(
      screen.getByPlaceholderText("ghp_xxxxxxxxxxxxxxxxxxxx"),
      "ghp_expired"
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("Error: Token expired")).toBeInTheDocument();
    expect(mocks.setSetting).not.toHaveBeenCalled();
  });

  it("clears an empty GitHub token without validating", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.setSetting).toHaveBeenCalledWith("github_token", "");
    });
    expect(mocks.verifyGithubToken).not.toHaveBeenCalled();
    expect(screen.queryByText("令牌有效")).not.toBeInTheDocument();
    expect(screen.queryByText("令牌无效")).not.toBeInTheDocument();
  });
});
