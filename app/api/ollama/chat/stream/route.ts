import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl, getDefaultModel } from "../../utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type OllamaStreamChunk = {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
};

const thinkByDefault = (process.env.OLLAMA_THINK ?? "false").toLowerCase() === "true";
const defaultNumPredict = Number.parseInt(process.env.OLLAMA_NUM_PREDICT ?? "160", 10);
const autoContinueSteps = Number.parseInt(process.env.OLLAMA_AUTO_CONTINUE_STEPS ?? "1", 10);
const continuationPrompt =
  process.env.OLLAMA_CONTINUE_PROMPT ??
  "Continue exactly where you stopped. Do not repeat earlier text. Finish the answer naturally.";
const timeoutMs = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "20000", 10);
const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;

function encodeLine(value: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

async function streamOne(
  model: string,
  messages: ChatMessage[],
  options: Record<string, unknown>,
  onToken: (token: string) => Promise<void>
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${getBaseUrl()}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think: thinkByDefault,
        options,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Ollama ${response.status}: ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneReason = "stop";
    let content = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
        const token = chunk.message?.content ?? "";
        if (token) {
          content += token;
          await onToken(token);
        }

        if (chunk.done) {
          doneReason = chunk.done_reason ?? "stop";
        }
      }
    }

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
      const token = chunk.message?.content ?? "";
      if (token) {
        content += token;
        await onToken(token);
      }
      if (chunk.done) {
        doneReason = chunk.done_reason ?? "stop";
      }
    }

    return { content, doneReason };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Chat payload requires a non-empty messages array" },
      { status: 400 }
    );
  }

  const options: Record<string, unknown> = {};
  if (typeof body.temperature === "number") {
    options.temperature = Math.min(Math.max(body.temperature, 0), 1);
  }
  if (typeof body.maxTokens === "number") {
    options.num_predict = body.maxTokens;
  } else if (Number.isFinite(defaultNumPredict) && defaultNumPredict > 0) {
    options.num_predict = defaultNumPredict;
  }

  const model = body.model ?? getDefaultModel();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  void (async () => {
    try {
      let messages = [...body.messages];
      let combined = "";
      const steps = Number.isFinite(autoContinueSteps) && autoContinueSteps >= 0 ? autoContinueSteps : 0;

      for (let step = 0; step <= steps; step += 1) {
        const { content, doneReason } = await streamOne(model, messages, options, async (token) => {
          await writer.write(encodeLine({ type: "token", token }));
        });

        combined += content;

        if (doneReason !== "length") {
          await writer.write(encodeLine({ type: "done" }));
          break;
        }

        if (step === steps) {
          await writer.write(encodeLine({ type: "done" }));
          break;
        }

        await writer.write(encodeLine({ type: "continue" }));
        messages = [
          ...messages,
          { role: "assistant", content: combined },
          { role: "user", content: continuationPrompt },
        ];
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      await writer.write(encodeLine({ type: "error", details }));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
