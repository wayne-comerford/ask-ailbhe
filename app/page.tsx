"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type OllamaModel = {
  name: string;
  title?: string;
  description?: string;
  size?: string;
};

type ModelsPayload = {
  models?: OllamaModel[];
  baseUrl?: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are Ask Ailbhe, a helpful local assistant. Be clear, practical, and concise.";
const DEFAULT_TEMPERATURE = "0.2";

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const extractOllamaResponse = (payload: unknown): string | null => {
  if (!payload) return null;

  if (typeof payload === "string") {
    return payload.trim();
  }

  if (typeof payload === "object" && payload !== null) {
    const data = payload as Record<string, unknown>;
    const messageField =
      data.message && typeof data.message === "object"
        ? (data.message as Record<string, unknown>)
        : null;

    const checkString = (value: unknown) =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

    const fromField =
      checkString(messageField?.content) ||
      checkString(data.response) ||
      checkString(data.text) ||
      checkString(data.content);

    if (fromField) {
      return fromField;
    }
  }

  return null;
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "system", role: "system", content: DEFAULT_SYSTEM_PROMPT },
  ]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [statusMessage, setStatusMessage] = useState("Loading models...");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remoteBase, setRemoteBase] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages((prev) => {
      const rest = prev.filter((message) => message.role !== "system");
      if (prev[0] && prev[0].role === "system" && prev[0].content === systemPrompt) {
        return prev;
      }
      return [{ id: "system", role: "system", content: systemPrompt }, ...rest];
    });
  }, [systemPrompt]);

  useEffect(() => {
    void fetchModels();
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const publicMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages]
  );

  async function fetchModels() {
    try {
      setError(null);
      setStatusMessage("Loading models...");

      const response = await fetch("/api/ollama/models");
      if (!response.ok) {
        throw new Error("Could not load models from Ollama");
      }

      const payload = (await response.json()) as ModelsPayload;
      const available: OllamaModel[] = Array.isArray(payload.models) ? payload.models : [];
      setModels(available);
      setRemoteBase(payload.baseUrl ?? "");
      setSelectedModel((current) => {
        if (!available.length) return "";
        if (available.some((model) => model.name === current)) return current;
        return available[0].name;
      });
      setStatusMessage(
        available.length
          ? `${available.length} model${available.length === 1 ? "" : "s"} available`
          : "No models found"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStatusMessage("Model fetch failed");
    }
  }

  const submitPrompt = async () => {
    if (!draft.trim() || loading) {
      return;
    }

    if (!selectedModel) {
      setError("Select a model first");
      return;
    }

    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = {
      id: buildId(),
      role: "user",
      content: draft.trim(),
    };

    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setDraft("");
    setStatusMessage("Ailbhe is thinking...");

    try {
      const payload: Record<string, unknown> = {
        model: selectedModel,
        messages: conversation,
      };

      const parsedTemp = Number.parseFloat(temperature);
      if (!Number.isNaN(parsedTemp)) {
        payload.temperature = Math.min(Math.max(parsedTemp, 0), 1);
      }

      const response = await fetch("/api/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Chat request failed");
      }

      const result = (await response.json()) as Record<string, unknown>;
      const assistantText = extractOllamaResponse(result);
      const meta = result._meta as Record<string, unknown> | undefined;
      if (typeof meta?.baseUrl === "string") {
        setRemoteBase(meta.baseUrl);
      }

      if (!assistantText) {
        throw new Error("Empty response from Ollama");
      }

      setMessages([
        ...conversation,
        {
          id: buildId(),
          role: "assistant",
          content: assistantText,
        },
      ]);
      setStatusMessage("Ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setStatusMessage("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  const resetChat = () => {
    setMessages([{ id: "system", role: "system", content: systemPrompt }]);
    setDraft("");
    setError(null);
    setStatusMessage("New chat started");
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] gap-0">
        <aside className="hidden w-[280px] border-r border-slate-800/80 bg-[#0f1728] p-4 md:flex md:flex-col md:gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Ask Ailbhe</h1>
            <p className="text-xs text-slate-400">Pronounced Alva</p>
          </div>
          <button
            type="button"
            onClick={resetChat}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            New chat
          </button>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <label className="text-xs font-medium text-slate-300">Model</label>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#111827] px-2 py-2 text-sm"
            >
              {models.length === 0 && <option value="">No models</option>}
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.title ?? model.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <label className="text-xs font-medium text-slate-300">Temperature</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#111827] px-2 py-2 text-sm"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <label className="text-xs font-medium text-slate-300">System prompt</label>
            <textarea
              rows={5}
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="w-full resize-none rounded-lg border border-slate-700 bg-[#111827] px-2 py-2 text-sm"
            />
          </div>

          <div className="mt-auto text-xs text-slate-400">
            <p>{statusMessage}</p>
            {remoteBase && <p className="mt-1 break-all">Host: {remoteBase}</p>}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-800/80 bg-[#0b1324]/95 px-4 py-3 backdrop-blur md:px-6">
            <div>
              <p className="text-sm font-semibold">Ask Ailbhe</p>
              <p className="text-xs text-slate-400 md:hidden">Pronounced Alva</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchModels()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                disabled={loading}
              >
                Refresh models
              </button>
              <button
                type="button"
                onClick={resetChat}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 md:hidden"
              >
                New
              </button>
            </div>
          </header>

          <section
            ref={messagesRef}
            className="flex-1 overflow-y-auto px-3 py-6 md:px-8"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
              {publicMessages.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center">
                  <p className="text-lg font-medium">Ask Ailbhe anything</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Start with a question, task, or draft prompt.
                  </p>
                </div>
              )}

              {publicMessages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <article
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[80%] ${
                        isUser
                          ? "bg-emerald-600/90 text-white"
                          : "border border-slate-800 bg-slate-900/60 text-slate-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </article>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                    Ailbhe is thinking...
                  </div>
                </div>
              )}
            </div>
          </section>

          <footer className="border-t border-slate-800/80 bg-[#0b1324]/95 px-3 py-4 md:px-6">
            <div className="mx-auto w-full max-w-3xl">
              {error && <p className="mb-2 text-sm text-rose-400">{error}</p>}
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-2">
                <textarea
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Message Ask Ailbhe..."
                  className="w-full resize-none bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  disabled={loading}
                />
                <div className="flex items-center justify-between px-2 pb-1 pt-2">
                  <p className="text-xs text-slate-500">Enter to send, Shift+Enter for newline</p>
                  <button
                    type="button"
                    onClick={() => void submitPrompt()}
                    disabled={loading || !draft.trim()}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
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
