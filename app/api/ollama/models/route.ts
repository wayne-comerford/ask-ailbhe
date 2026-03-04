import { NextResponse } from "next/server";
import { ollamaFetchWithBase } from "../utils";

type ModelItem = {
  name: string;
  title?: string;
  description?: string;
  size?: string;
};

function toModelItem(item: unknown): ModelItem | null {
  if (!item || typeof item !== "object") return null;
  const model = item as Record<string, unknown>;
  const name =
    typeof model.name === "string"
      ? model.name
      : typeof model.model === "string"
        ? model.model
        : null;

  if (!name) return null;

  return {
    name,
    title: typeof model.name === "string" ? model.name : name,
    size:
      typeof model.size === "string"
        ? model.size
        : typeof model.parameter_size === "string"
          ? model.parameter_size
          : undefined,
  };
}

function toTagModelItem(item: unknown): ModelItem | null {
  if (!item || typeof item !== "object") return null;
  const model = item as Record<string, unknown>;
  const name =
    typeof model.name === "string"
      ? model.name
      : typeof model.model === "string"
        ? model.model
        : null;

  if (!name) return null;

  const details =
    model.details && typeof model.details === "object"
      ? (model.details as Record<string, unknown>)
      : null;

  return {
    name,
    title: typeof model.name === "string" ? model.name : name,
    size: typeof details?.parameter_size === "string" ? details.parameter_size : undefined,
  };
}

function isModelItem(item: ModelItem | null): item is ModelItem {
  return item !== null;
}

function normalizeModels(payload: unknown): ModelItem[] {
  if (Array.isArray(payload)) {
    return payload.map(toModelItem).filter(isModelItem);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.models)) {
    return (record.models as unknown[]).map(toModelItem).filter(isModelItem);
  }

  if (Array.isArray(record.tags)) {
    return (record.tags as unknown[]).map(toTagModelItem).filter(isModelItem);
  }

  return [];
}

export async function GET() {
  try {
    try {
      const primary = await ollamaFetchWithBase("/api/models");
      return NextResponse.json({
        baseUrl: primary.baseUrl,
        models: normalizeModels(primary.data),
      });
    } catch {
      const fallback = await ollamaFetchWithBase("/api/tags");
      return NextResponse.json({
        baseUrl: fallback.baseUrl,
        models: normalizeModels(fallback.data),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Unable to reach Ollama models endpoint", details: message },
      { status: 502 }
    );
  }
}
