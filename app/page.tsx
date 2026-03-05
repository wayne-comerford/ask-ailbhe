"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  projectId: string | null;
};

type Project = {
  id: string;
  name: string;
  updatedAt: number;
};

type AppState = {
  projects: Project[];
  sessions: ChatSession[];
  activeProjectId: string | null;
  activeSessionId: string;
};

type OllamaModel = {
  name: string;
};

type ModelsPayload = {
  models?: OllamaModel[];
};

const STORAGE_KEY = "ask-ailbhe-state-v2";
const SYSTEM_PROMPT =
  "You are Ask Ailbhe, a helpful local assistant. Keep answers concise, practical, and easy to read.";

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function createDefaultProject(): Project {
  return {
    id: buildId(),
    name: "General",
    updatedAt: Date.now(),
  };
}

function createSession(projectId: string | null): ChatSession {
  return {
    id: buildId(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
    projectId,
  };
}

function buildTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New chat";
  return firstUser.content.slice(0, 42) + (firstUser.content.length > 42 ? "..." : "");
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState("");

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [draft, setDraft] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchModels();

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaultProject = createDefaultProject();
        const initialSession = createSession(defaultProject.id);
        setProjects([defaultProject]);
        setSessions([initialSession]);
        setActiveProjectId(defaultProject.id);
        setActiveSessionId(initialSession.id);
        return;
      }

      const parsed = JSON.parse(raw) as AppState;
      const safeProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const safeSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

      if (safeProjects.length === 0) {
        const defaultProject = createDefaultProject();
        const initialSession = createSession(defaultProject.id);
        setProjects([defaultProject]);
        setSessions([initialSession]);
        setActiveProjectId(defaultProject.id);
        setActiveSessionId(initialSession.id);
        return;
      }

      setProjects(safeProjects);
      setSessions(safeSessions.length > 0 ? safeSessions : [createSession(safeProjects[0].id)]);
      setActiveProjectId(parsed.activeProjectId ?? safeProjects[0].id);
      setActiveSessionId(
        parsed.activeSessionId && safeSessions.some((session) => session.id === parsed.activeSessionId)
          ? parsed.activeSessionId
          : safeSessions[0]?.id ?? ""
      );
    } catch {
      const defaultProject = createDefaultProject();
      const initialSession = createSession(defaultProject.id);
      setProjects([defaultProject]);
      setSessions([initialSession]);
      setActiveProjectId(defaultProject.id);
      setActiveSessionId(initialSession.id);
    }
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    const state: AppState = {
      projects,
      sessions,
      activeProjectId,
      activeSessionId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [projects, sessions, activeProjectId, activeSessionId]);

  useEffect(() => {
    if (sessions.length === 0) {
      const newSession = createSession(activeProjectId);
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
      return;
    }
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId, activeProjectId]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );

  const visibleSessions = useMemo(
    () =>
      sortedSessions.filter((session) =>
        activeProjectId ? session.projectId === activeProjectId : true
      ),
    [sortedSessions, activeProjectId]
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function fetchModels() {
    try {
      const response = await fetch("/api/ollama/models");
      if (!response.ok) {
        throw new Error("Could not load models");
      }
      const payload = (await response.json()) as ModelsPayload;
      const available: OllamaModel[] = Array.isArray(payload.models) ? payload.models : [];
      setModels(available);
      setSelectedModel((current) => {
        if (!available.length) return "";
        if (available.some((model) => model.name === current)) return current;
        return available[0].name;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }

  function updateSession(sessionId: string, nextMessages: ChatMessage[]) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: nextMessages,
              title: buildTitle(nextMessages),
              updatedAt: Date.now(),
            }
          : session
      )
    );
  }

  function appendAssistantChunk(sessionId: string, assistantId: string, chunk: string) {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sessionId) return session;
        const next = [...session.messages];
        const index = next.findIndex((message) => message.id === assistantId);
        if (index < 0) return session;
        next[index] = {
          ...next[index],
          content: next[index].content + chunk,
        };
        return {
          ...session,
          messages: next,
          title: buildTitle(next),
          updatedAt: Date.now(),
        };
      })
    );
  }

  async function submitPrompt() {
    if (!draft.trim() || loading) {
      return;
    }

    if (!selectedModel) {
      setError("No model available");
      return;
    }

    if (!activeSession) {
      return;
    }

    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = {
      id: buildId(),
      role: "user",
      content: draft.trim(),
    };

    const assistantId = buildId();
    const nextMessages = [
      ...activeSession.messages,
      userMessage,
      { id: assistantId, role: "assistant" as const, content: "" },
    ];
    updateSession(activeSession.id, nextMessages);
    setDraft("");

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...nextMessages.map((message) => ({ role: message.role, content: message.content })),
    ];

    try {
      const response = await fetch("/api/ollama/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Chat request failed");
      }

      if (!response.body) {
        throw new Error("No stream body from assistant");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotToken = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          if (event.type === "token" && typeof event.token === "string") {
            gotToken = true;
            appendAssistantChunk(activeSession.id, assistantId, event.token);
          }
          if (event.type === "error") {
            throw new Error(
              typeof event.details === "string" ? event.details : "Stream error"
            );
          }
        }
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer.trim()) as Record<string, unknown>;
        if (event.type === "token" && typeof event.token === "string") {
          gotToken = true;
          appendAssistantChunk(activeSession.id, assistantId, event.token);
        }
        if (event.type === "error") {
          throw new Error(typeof event.details === "string" ? event.details : "Stream error");
        }
      }

      if (!gotToken) {
        throw new Error("Assistant returned empty response");
      }

      if (activeSession.projectId) {
        setProjects((prev) =>
          prev.map((project) =>
            project.id === activeSession.projectId
              ? { ...project, updatedAt: Date.now() }
              : project
          )
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  function startNewChat() {
    const created = createSession(activeProjectId);
    setSessions((prev) => [created, ...prev]);
    setActiveSessionId(created.id);
    setError(null);
    setDraft("");
  }

  function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const created: Project = {
      id: buildId(),
      name,
      updatedAt: Date.now(),
    };
    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(created.id);
    setNewProjectName("");
    setCreatingProject(false);
  }

  function deleteProject(projectId: string) {
    setProjects((prev) => prev.filter((project) => project.id !== projectId));
    setSessions((prev) => prev.filter((session) => session.projectId !== projectId));

    if (activeProjectId === projectId) {
      const remaining = sortedProjects.filter((project) => project.id !== projectId);
      setActiveProjectId(remaining[0]?.id ?? null);
    }
  }

  function deleteChat(sessionId: string) {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
  }

  function convertChatToProject(sessionId: string) {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;

    const baseName = session.title.trim() || "New project";
    const existingNames = new Set(projects.map((project) => project.name.toLowerCase()));
    let projectName = baseName;
    let suffix = 2;
    while (existingNames.has(projectName.toLowerCase())) {
      projectName = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const newProject: Project = {
      id: buildId(),
      name: projectName,
      updatedAt: Date.now(),
    };

    setProjects((prev) => [newProject, ...prev]);
    setSessions((prev) =>
      prev.map((entry) =>
        entry.id === sessionId
          ? {
              ...entry,
              projectId: newProject.id,
              updatedAt: Date.now(),
            }
          : entry
      )
    );
    setActiveProjectId(newProject.id);
    setActiveSessionId(sessionId);
  }

  return (
    <div className="min-h-screen bg-[#212121] text-[#ececec]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[300px] shrink-0 border-r border-[#303030] bg-[#171717] px-3 py-4 md:flex md:flex-col">
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg border border-[#3f3f3f] bg-[#2a2a2a] px-3 py-2 text-left text-sm hover:bg-[#333333]"
          >
            + New chat
          </button>

          <div className="mt-6">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-[#9a9a9a]">Projects</h2>
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#cfcfcf] hover:bg-[#242424]"
            >
              <span aria-hidden>+</span>
              <span>New project</span>
            </button>
            {creatingProject && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addProject();
                    }
                    if (event.key === "Escape") {
                      setCreatingProject(false);
                      setNewProjectName("");
                    }
                  }}
                  placeholder="Project name"
                  className="w-full rounded-md border border-[#3f3f3f] bg-[#242424] px-2 py-1.5 text-sm focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={addProject}
                  className="rounded-md border border-[#3f3f3f] px-2 text-sm hover:bg-[#2a2a2a]"
                >
                  Add
                </button>
              </div>
            )}
            <div className="mt-2 space-y-1">
              {sortedProjects.map((project) => {
                const active = project.id === activeProjectId;
                return (
                  <div
                    key={project.id}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                      active ? "bg-[#2f2f2f] text-[#f1f1f1]" : "text-[#cfcfcf] hover:bg-[#242424]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveProjectId(project.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={project.name}
                    >
                      <span className="mr-2 inline-block text-[#9a9a9a]" aria-hidden>
                        []
                      </span>
                      {project.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProject(project.id)}
                      className="ml-2 text-xs text-[#9b9b9b] hover:text-[#ff8d8d]"
                      aria-label={`Delete project ${project.name}`}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[#9a9a9a]">Your chats</h2>
              <button
                type="button"
                onClick={() => setActiveProjectId(null)}
                className="text-[11px] text-[#9a9a9a] hover:text-[#d6d6d6]"
              >
                Show all
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {visibleSessions.map((session) => {
                const active = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                      active ? "bg-[#2f2f2f] text-[#f1f1f1]" : "text-[#cfcfcf] hover:bg-[#242424]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(session.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={session.title}
                    >
                      {session.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => convertChatToProject(session.id)}
                      className="ml-2 text-xs text-[#9b9b9b] hover:text-[#d6d6d6]"
                      aria-label={`Convert chat ${session.title} to project`}
                    >
                      To project
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChat(session.id)}
                      className="ml-2 text-xs text-[#9b9b9b] hover:text-[#ff8d8d]"
                      aria-label={`Delete chat ${session.title}`}
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#303030] bg-[#212121]/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-medium">Ask Ailbhe</h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startNewChat}
                  className="rounded-md border border-[#3f3f3f] px-2.5 py-1 text-xs text-[#cfcfcf] hover:bg-[#2a2a2a] md:hidden"
                >
                  New chat
                </button>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="max-w-[220px] rounded-md border border-[#3f3f3f] bg-[#242424] px-2.5 py-1 text-xs text-[#cfcfcf] focus:outline-none"
                  aria-label="Model selection"
                >
                  {models.length === 0 && <option value="">No models</option>}
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void fetchModels()}
                  className="rounded-md border border-[#3f3f3f] px-2.5 py-1 text-xs text-[#cfcfcf] hover:bg-[#2a2a2a]"
                >
                  Refresh
                </button>
              </div>
            </div>
          </header>

          <section ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-8 md:px-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {!hasMessages && (
                <div className="pt-16 text-center">
                  <h2 className="text-3xl font-semibold tracking-tight">Ask Ailbhe</h2>
                  <p className="mt-3 text-sm text-[#a0a0a0]">What is on your mind today?</p>
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <article
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-7 ${
                        isUser ? "bg-[#303030] text-[#ececec]" : "bg-transparent text-[#ececec]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </article>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-4 py-3 text-[15px] text-[#b4b4b4]">
                    Ailbhe is thinking...
                  </div>
                </div>
              )}
            </div>
          </section>

          <footer className="border-t border-[#303030] bg-[#212121] px-4 pb-5 pt-3 md:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {error && <p className="mb-2 text-sm text-[#ff8d8d]">{error}</p>}
              <div className="rounded-3xl border border-[#4a4a4a] bg-[#2a2a2a] p-3">
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Message Ask Ailbhe"
                  className="w-full resize-none bg-transparent px-2 py-1 text-[15px] text-[#ececec] placeholder:text-[#9a9a9a] focus:outline-none"
                  disabled={loading}
                />
                <div className="mt-2 flex items-center justify-between px-2">
                  <p className="text-xs text-[#9a9a9a]">Enter to send, Shift+Enter for newline</p>
                  <button
                    type="button"
                    onClick={() => void submitPrompt()}
                    disabled={loading || !draft.trim()}
                    className="rounded-full bg-[#ececec] px-3 py-1 text-sm font-medium text-[#171717] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
