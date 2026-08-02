import { useCallback } from "react";
import type { MouseEvent, ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../../api";
import GithubIcon from "../icons/GithubIcon";
import SkillsShIcon from "../icons/SkillsShIcon";
import Button from "../ui/Button";
import HoverActionGroup from "../ui/HoverActionGroup";

export interface SkillActionTarget {
  id: number;
  source_type?: "net" | "local";
  owner?: string | null;
  repo?: string | null;
  source_url?: string | null;
}

interface SkillSourceActionsProps {
  skill: SkillActionTarget;
  onError: (message: string) => void;
  children?: ReactNode;
}

/** Shared source and filesystem actions for skill rows. */
export default function SkillSourceActions({
  skill,
  onError,
  children,
}: SkillSourceActionsProps) {
  const { t } = useTranslation();
  const sourceUrl = skill.source_url?.trim();
  const isNet = skill.source_type === "net" && Boolean(skill.owner && skill.repo);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        onError(errorMessage(error));
      }
    },
    [onError],
  );

  const openSourcePage = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!sourceUrl) return;
      void run(() => openUrl(`https://skills.sh/${sourceUrl}`));
    },
    [run, sourceUrl],
  );

  const openGithub = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!skill.owner || !skill.repo) return;
      void run(() => openUrl(`https://github.com/${skill.owner}/${skill.repo}`));
    },
    [run, skill.owner, skill.repo],
  );

  const openDirectory = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      void run(() => api.openSkillDir(skill.id));
    },
    [run, skill.id],
  );

  return (
    <HoverActionGroup>
      {sourceUrl ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openSourcePage}
          title={t("library.openSkillsSrcPage")}
          aria-label={t("library.openSkillsSrcPage")}
          icon={<SkillsShIcon />}
        />
      ) : null}

      {isNet ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openGithub}
          title={t("library.openGithub")}
          aria-label={t("library.openGithub")}
          icon={<GithubIcon className="h-3.5 w-3.5 text-slate-300" />}
        />
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={openDirectory}
        title={t("library.openLocalDir")}
        aria-label={t("library.openLocalDir")}
        icon={<FolderOpen className="h-3.5 w-3.5 text-slate-300" />}
      />

      {children}
    </HoverActionGroup>
  );
}
