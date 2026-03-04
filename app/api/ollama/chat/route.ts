import { NextRequest, NextResponse } from "next/server";
import { getDefaultModel, ollamaFetchWithBase } from "../utils";

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

type OllamaChatResponse = {
  message?: {
    role?: "assistant";
    content?: string;
  };
  done_reason?: string;
};

const thinkByDefault = (process.env.OLLAMA_THINK ?? "false").toLowerCase() === "true";
const defaultNumPredict = Number.parseInt(process.env.OLLAMA_NUM_PREDICT ?? "160", 10);
const autoContinueSteps = Number.parseInt(process.env.OLLAMA_AUTO_CONTINUE_STEPS ?? "2", 10);
const continuationPrompt =
  process.env.OLLAMA_CONTINUE_PROMPT ??
  "Continue exactly where you stopped. Do not repeat earlier text. Finish the answer naturally.";

function toResponse(data: unknown): OllamaChatResponse {
  if (!data || typeof data !== "object") {
    return {};
  }
  const record = data as Record<string, unknown>;
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : undefined;
  return {
    done_reason: typeof record.done_reason === "string" ? record.done_reason : undefined,
    message: {
      role: "assistant",
      content: typeof message?.content === "string" ? message.content : "",
    },
  };
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
  let messages = [...body.messages];
  let combinedContent = "";
  let finalResponse: OllamaChatResponse = {};
  let activeBaseUrl = "";

  try {
    const maxSteps = Number.isFinite(autoContinueSteps) && autoContinueSteps >= 0 ? autoContinueSteps : 0;

    for (let step = 0; step <= maxSteps; step += 1) {
      const payload: Record<string, unknown> = {
        model,
        messages,
        stream: false,
        think: thinkByDefault,
      };
      if (Object.keys(options).length > 0) {
        payload.options = options;
      }

      const response = await ollamaFetchWithBase<OllamaChatResponse>("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      activeBaseUrl = response.baseUrl;
      const normalized = toResponse(response.data);
      const chunk = normalized.message?.content?.trim() ?? "";
      if (chunk.length > 0) {
        combinedContent = combinedContent ? `${combinedContent}\n\n${chunk}` : chunk;
      }

      finalResponse = normalized;

      if (normalized.done_reason !== "length") {
        break;
      }

      messages = [
        ...messages,
        { role: "assistant", content: chunk },
        { role: "user", content: continuationPrompt },
      ];
    }

    return NextResponse.json({
      message: {
        role: "assistant",
        content: combinedContent,
      },
      done_reason: finalResponse.done_reason,
      _meta: { baseUrl: activeBaseUrl },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Ollama chat request failed", details: message },
      { status: 502 }
    );
  }
}
