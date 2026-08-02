import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportProfile, ImportResult, ProfileImportPreview } from "../types";

const profile: ExportProfile = {
  version: "2.0",
  export_date: "2026-07-29T12:00:00+08:00",
  skills: [],
  presets: [
    {
      name: "frontend",
      description: null,
      direct_skill_refs: [],
      included_preset_names: [],
    },
  ],
};
const profileJson = JSON.stringify(profile);

const preview: ProfileImportPreview = {
  version: "2.0",
  export_date: profile.export_date,
  matched_skills: [{ name: "Installed", dir_path: "net/owner/repo/installed" }],
  missing_skills: [{ name: "Missing", dir_path: "local/missing" }],
  new_presets: ["new"],
  replaced_presets: ["existing"],
  unresolved_preset_skills: [{ preset_name: "new", skill_ref: "local/missing" }],
};

const importResult: ImportResult = {
  success: true,
  imported_skills: [],
  skipped_skills: ["Installed"],
  installed_from_source: [],
  created_presets: ["existing", "new"],
  unresolved_preset_skills: ["new: local/missing"],
  error: null,
};

const mocks = vi.hoisted(() => ({
  exportProfile: vi.fn(),
  saveFileDialog: vi.fn(),
  saveProfileFile: vi.fn(),
  revealFile: vi.fn(),
  previewProfileImport: vi.fn(),
  importProfile: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    exportProfile: mocks.exportProfile,
    saveFileDialog: mocks.saveFileDialog,
    saveProfileFile: mocks.saveProfileFile,
    revealFile: mocks.revealFile,
    previewProfileImport: mocks.previewProfileImport,
    importProfile: mocks.importProfile,
    getSetting: vi.fn(async () => null),
  },
  errorMessage: (error: unknown) => String(error),
}));

import i18n from "../i18n";
import MigrationPage from "./MigrationPage";

beforeEach(async () => {
  await i18n.changeLanguage("zh");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.exportProfile.mockResolvedValue(profileJson);
  mocks.saveFileDialog.mockResolvedValue("/tmp/longan-profile.json");
  mocks.saveProfileFile.mockResolvedValue(undefined);
  mocks.revealFile.mockResolvedValue(undefined);
  mocks.previewProfileImport.mockResolvedValue(preview);
  mocks.importProfile.mockResolvedValue(importResult);
});

describe("MigrationPage", () => {
  it("saves the exact export snapshot and reveals the saved file", async () => {
    const user = userEvent.setup();
    render(<MigrationPage />);

    const saveButton = await screen.findByRole("button", { name: "保存配置文件" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(mocks.exportProfile).toHaveBeenCalledTimes(1);
    expect(mocks.saveFileDialog).toHaveBeenCalledWith({
      title: "保存配置文件",
      defaultPath: expect.stringMatching(/^longan-profile-\d{4}-\d{2}-\d{2}\.json$/),
      filters: [{ name: "Longan JSON 配置文件", extensions: ["json"] }],
    });
    expect(mocks.saveProfileFile).toHaveBeenCalledWith("/tmp/longan-profile.json", profileJson);
    expect(await screen.findByText("配置文件已保存")).toBeInTheDocument();
    expect(screen.getByText("/tmp/longan-profile.json")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开所在目录" }));
    expect(mocks.revealFile).toHaveBeenCalledWith("/tmp/longan-profile.json");
  });

  it("treats save dialog cancellation as a no-op", async () => {
    const user = userEvent.setup();
    mocks.saveFileDialog.mockResolvedValueOnce(null);
    render(<MigrationPage />);

    const saveButton = await screen.findByRole("button", { name: "保存配置文件" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(mocks.saveProfileFile).not.toHaveBeenCalled();
    expect(screen.queryByText("配置文件已保存")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports profile file write failures without showing success", async () => {
    const user = userEvent.setup();
    mocks.saveProfileFile.mockRejectedValueOnce("disk full");
    render(<MigrationPage />);

    const saveButton = await screen.findByRole("button", { name: "保存配置文件" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    expect(screen.queryByText("配置文件已保存")).not.toBeInTheDocument();
  });

  it("keeps the saved path visible when revealing the file fails", async () => {
    const user = userEvent.setup();
    mocks.revealFile.mockRejectedValueOnce("file manager unavailable");
    render(<MigrationPage />);

    const saveButton = await screen.findByRole("button", { name: "保存配置文件" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    await user.click(await screen.findByRole("button", { name: "打开所在目录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("file manager unavailable");
    expect(screen.getByText("/tmp/longan-profile.json")).toBeInTheDocument();
  });

  it("previews matched, missing, new, and replaced profile data", async () => {
    const user = userEvent.setup();
    const { container } = render(<MigrationPage />);
    await user.click(screen.getByRole("button", { name: "导入配置" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File([profileJson], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => profileJson });

    await user.upload(input!, file);

    expect(await screen.findByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("existing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入并覆盖 2 个 Preset" })).toBeEnabled();
    expect(mocks.previewProfileImport).toHaveBeenCalledWith(profileJson);
  });

  it("imports the previewed profile and refreshes shared data without reloading", async () => {
    const user = userEvent.setup();
    const onProfileImported = vi.fn();
    const { container } = render(<MigrationPage onProfileImported={onProfileImported} />);
    await user.click(screen.getByRole("button", { name: "导入配置" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([profileJson], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => profileJson });
    await user.upload(input, file);
    await user.click(await screen.findByRole("button", { name: "导入并覆盖 2 个 Preset" }));

    await waitFor(() => expect(onProfileImported).toHaveBeenCalledTimes(1));
    expect(mocks.importProfile).toHaveBeenCalledWith(profileJson);
    expect(screen.getByText("配置导入完成")).toBeInTheDocument();
    expect(screen.getByText("1 个关联未能恢复")).toBeInTheDocument();
  });

  it("rejects non-JSON files before calling the preview command", async () => {
    const user = userEvent.setup();
    const { container } = render(<MigrationPage />);
    await user.click(screen.getByRole("button", { name: "导入配置" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, {
      target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("请选择 .json 配置文件");
    expect(mocks.previewProfileImport).not.toHaveBeenCalled();
  });
});
