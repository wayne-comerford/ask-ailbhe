"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type OllamaModel = {
  name: string;
};

type ModelsPayload = {
  models?: OllamaModel[];
};

const SYSTEM_PROMPT =
  "You are Ask Ailbhe, a helpful local assistant. Keep answers concise, practical, and easy to read.";

const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const parseAssistantText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const message =
    data.message && typeof data.message === "object"
      ? (data.message as Record<string, unknown>)
      : null;

  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (typeof data.response === "string" && data.response.trim()) {
    return data.response.trim();
  }

  return null;
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchModels();
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const hasMessages = useMemo(() => messages.length > 0, [messages]);

  async function fetchModels() {
    try {
      const response = await fetch("/api/ollama/models");
      if (!response.ok) {
        throw new Error("Could not load models");
      }
      const payload = (await response.json()) as ModelsPayload;
      const available: OllamaModel[] = Array.isArray(payload.models) ? payload.models : [];
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

  async function submitPrompt() {
    if (!draft.trim() || loading) {
      return;
    }

    if (!selectedModel) {
      setError("No model available");
      return;
    }

    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = {
      id: buildId(),
      role: "user",
      content: draft.trim(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...nextMessages.map((message) => ({ role: message.role, content: message.content })),
    ];

    try {
      const response = await fetch("/api/ollama/chat", {
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

      const result = (await response.json()) as Record<string, unknown>;
      const assistantText = parseAssistantText(result);
      if (!assistantText) {
        throw new Error("Assistant returned empty response");
      }

      setMessages([
        ...nextMessages,
        {
          id: buildId(),
          role: "assistant",
          content: assistantText,
        },
      ]);
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

  const startNewChat = () => {
    setMessages([]);
    setError(null);
    setDraft("");
  };

  return (
    <div className="min-h-screen bg-[#212121] text-[#ececec]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[260px] shrink-0 border-r border-[#303030] bg-[#171717] p-3 md:flex md:flex-col">
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg border border-[#3f3f3f] bg-[#2a2a2a] px-3 py-2 text-left text-sm hover:bg-[#333333]"
          >
            + New chat
          </button>
          <div className="mt-6 text-xs text-[#9b9b9b]">
            <p className="font-medium text-[#cfcfcf]">Ask Ailbhe</p>
            <p>Pronounced Alva</p>
            <p className="mt-2">Model: {selectedModel || "loading..."}</p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#303030] bg-[#212121]/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between">
              <h1 className="text-sm font-medium">Ask Ailbhe</h1>
              <button
                type="button"
                onClick={() => void fetchModels()}
                className="rounded-md border border-[#3f3f3f] px-2.5 py-1 text-xs text-[#cfcfcf] hover:bg-[#2a2a2a]"
              >
                Refresh
              </button>
            </div>
          </header>

          <section ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-8 md:px-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {!hasMessages && (
                <div className="pt-16 text-center">
                  <h2 className="text-3xl font-semibold tracking-tight">Ask Ailbhe</h2>
                  <p className="mt-3 text-sm text-[#a0a0a0]">How can I help you today?</p>
                </div>
              )}

              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <article
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-7 ${
                        isUser
                          ? "bg-[#303030] text-[#ececec]"
                          : "bg-transparent text-[#ececec]"
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
