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

export async function POST(request: NextRequest) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Chat payload requires a non-empty messages array" },
      { status: 400 }
    );
  }

  const payload: Record<string, unknown> = {
    model: body.model ?? getDefaultModel(),
    messages: body.messages,
    stream: false,
  };

  const options: Record<string, unknown> = {};
  if (typeof body.temperature === "number") {
    options.temperature = Math.min(Math.max(body.temperature, 0), 1);
  }
  if (typeof body.maxTokens === "number") {
    options.num_predict = body.maxTokens;
  }
  if (Object.keys(options).length > 0) {
    payload.options = options;
  }

  try {
    const response = await ollamaFetchWithBase("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({
      ...(response.data as Record<string, unknown>),
      _meta: { baseUrl: response.baseUrl },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Ollama chat request failed", details: message },
      { status: 502 }
    );
  }
}
