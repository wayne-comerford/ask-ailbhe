const DEFAULT_HOST = "http://192.168.0.124:11434";
const hostFromEnv = process.env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, "");
const BASE_URL = hostFromEnv && hostFromEnv.length > 0 ? hostFromEnv : DEFAULT_HOST;
const timeoutMs = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "20000", 10);
const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL ?? "llama3";

const TIMEOUT = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
};

function buildUrl(baseUrl: string, path: string) {
  if (path.startsWith("http")) return path;
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  return `${baseUrl}${path}`;
}

export function getDefaultModel() {
  return DEFAULT_MODEL;
}

async function fetchFromBase<T = unknown>(baseUrl: string, path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(buildUrl(baseUrl, path), {
      ...init,
      headers: { ...DEFAULT_HEADERS, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Invalid JSON from Ollama: ${error} - body: ${text}`);
    }
    if (!response.ok) {
      throw new Error(`Ollama ${response.status}: ${text}`);
    }
    return { data: data as T, baseUrl };
  } finally {
    clearTimeout(timeout);
  }
}

export async function ollamaFetchWithBase<T = unknown>(
  path: string,
  init: RequestInit = {}
) {
  return fetchFromBase<T>(BASE_URL, path, init);
}

export async function ollamaFetch<T = unknown>(path: string, init: RequestInit = {}) {
  const result = await ollamaFetchWithBase<T>(path, init);
  return result.data;
}

export function getBaseUrl() {
  return BASE_URL;
}
