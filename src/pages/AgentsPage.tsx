import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Globe,
  FolderGit2,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { Agent, Project } from "../types";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import Input from "../components/ui/Input";
import EmptyState from "../components/ui/EmptyState";
import Alert from "../components/ui/Alert";

interface AgentsPageProps {
  onAgentsChanged?: () => void;
}


const SUGGESTIONS = [
  { name: "claude", dir: ".claude/skills" },
];

export default function AgentsPage({ onAgentsChanged }: AgentsPageProps) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [linkedTarget, setLinkedTarget] = useState<Agent | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDir, setFormDir] = useState("");
  const [formGlobal, setFormGlobal] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [agentList, projectList] = await Promise.all([
        api.listAgents(),
        api.listProjects(),
      ]);
      setAgents(agentList);
      setProjects(projectList);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function openCreate() {
    setEditTarget(null);
    setFormName("");
    setFormDir("");
    setFormGlobal(false);
    setModalOpen(true);
  }

  function openEdit(agent: Agent) {
    setEditTarget(agent);
    setFormName(agent.name);
    setFormDir(agent.target_dir);
    setFormGlobal(agent.global_enabled);
    setModalOpen(true);
  }


  async function handleSubmit() {
    setError(null);
    try {
      if (editTarget) {
        await api.updateAgent(editTarget.id, formName, formDir, formGlobal);
      } else {
        await api.createAgent(formName, formDir, formGlobal);
      }
      setModalOpen(false);
      await reload();
      onAgentsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await api.deleteAgent(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
      onAgentsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleGlobal(agent: Agent) {
    setError(null);
    try {
      await api.updateAgent(agent.id, agent.name, agent.target_dir, !agent.global_enabled);
      await reload();
      onAgentsChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function applySuggestion(s: { name: string; dir: string }) {
    setFormName(s.name);
    setFormDir(s.dir);
  }

  // Filter agents based on search query
  const filteredAgents = agents.filter(agent => 
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.target_dir.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const linkedProjectsOf = (agent: Agent) =>
    projects.filter((p) => p.agent_ids.includes(agent.id));

  const linkedProjects = linkedTarget ? linkedProjectsOf(linkedTarget) : [];


  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Bot className="w-6 h-6 text-emerald-400" />
          {t("agents.header")}
        </h1>
        <p className="text-sm text-slate-400 mt-2">{t("agents.pageDesc")}</p>
      </div>

      {/* Info Banner */}
      <Alert
        type="info"
        message={t("agents.infoBannerMessage")}
      />

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder={t("agents.searchPlaceholder") || "搜索 Agent..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-slate-900/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {agents.length > 0 && (
            <Badge variant="neutral" className="px-2.5 py-1">
              {filteredAgents.length} / {agents.length}
            </Badge>
          )}
        </div>
        <Button onClick={openCreate} variant="primary" size="sm" className="w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          <span>{t("agents.create")}</span>
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Agent List */}
      {agents.length === 0 ? (
        <EmptyState 
          icon={<Bot className="w-8 h-8" />} 
          title={t("agents.createFirst")}
        />
      ) : filteredAgents.length === 0 ? (
        <EmptyState 
          icon={<Globe className="w-8 h-8" />} 
          title={t("agents.noResults")}
          description={t("agents.noResultsDesc")}
        />
      ) : (
        <div className="space-y-3">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} hoverEffect={false} className="group p-4 transition-all hover:bg-slate-800/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    agent.global_enabled ? 'bg-emerald-500/10' : 'bg-slate-800'
                  }`}>
                    <Bot className={`w-5 h-5 ${
                      agent.global_enabled ? 'text-emerald-400' : 'text-slate-400'
                    }`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-slate-100">{agent.name}</span>
                      {agent.global_enabled && (
                        <Badge variant="success" className="text-[10px] font-medium px-2 py-0.5">
                          {t("projects.agentGlobal")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs bg-slate-900/50 text-slate-400 px-2 py-0.5 rounded border border-slate-700/50 font-mono">
                        {agent.target_dir}
                      </code>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setLinkedTarget(agent)}
                    title={t("agents.viewLinkedProjects")}
                    className="flex items-center gap-1 p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    <FolderGit2 className="w-4 h-4" />
                    <span className="text-xs font-medium tabular-nums">
                      {agent.global_enabled ? projects.length : linkedProjectsOf(agent).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleGlobal(agent)}
                    title={agent.global_enabled ? t("agents.disableGlobal") : t("agents.enableGlobal")}
                    className={`p-2 rounded-lg transition-all ${
                      agent.global_enabled
                        ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(agent)}
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title={t("common.edit")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(agent)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? t("agents.editTitle") : t("agents.createTitle")}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!formName.trim() || !formDir.trim()}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Suggestions */}
          {!editTarget && (
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">{t("agents.suggestions")}</label>
              <div className="flex gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-all"
                  >
                    {s.name} → {s.dir}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1.5 block">{t("agents.name")}</label>
            <Input
              placeholder={t("agents.namePlaceholder")}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1.5 block">{t("agents.targetDir")}</label>
            <Input
              placeholder={t("agents.targetDirPlaceholder")}
              value={formDir}
              onChange={(e) => setFormDir(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">{t("agents.targetDirHint")}</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formGlobal}
              onChange={(e) => setFormGlobal(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span className="text-sm text-slate-200">{t("agents.globalEnabled")}</span>
          </label>
          <p className="text-xs text-slate-500 ml-6 -mt-2">{t("agents.globalEnabledHint")}</p>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("agents.deleteTitle")}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {t("agents.deleteConfirm", { name: deleteTarget?.name })}
        </p>
        <p className="text-xs text-slate-500 mt-2">{t("agents.deleteNote")}</p>
      </Modal>

      {/* Linked Projects Modal */}
      <Modal
        isOpen={!!linkedTarget && selectedProjectId === null}
        onClose={() => {
          setLinkedTarget(null);
          setSelectedProjectId(null);
        }}
        title={t("agents.linkedProjectsTitle", { name: linkedTarget?.name })}
        footer={
          <Button variant="ghost" size="sm" onClick={() => {
            setLinkedTarget(null);
            setSelectedProjectId(null);
          }}>
            {t("common.close")}
          </Button>
        }
      >
        {linkedTarget?.global_enabled ? (
          <Alert type="info" message={t("agents.linkedGlobalNote")} />
        ) : linkedProjects.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="w-8 h-8" />}
            title={t("agents.linkedEmpty")}
            description={t("agents.linkedEmptyDesc")}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {t("agents.linkedCount", { count: linkedProjects.length })}
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {linkedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    // Navigate to project detail page
                    window.dispatchEvent(new CustomEvent('navigateToProject', { detail: project.id }));
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 hover:border-emerald-500/40 hover:shadow-lg transition-all duration-200 text-left cursor-pointer group"
                >
                  <FolderGit2 className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100 group-hover:text-emerald-400 transition-colors truncate">{project.name}</div>
                    <div className="text-xs text-slate-500 font-mono truncate group-hover:text-slate-300 transition-colors">{project.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}




