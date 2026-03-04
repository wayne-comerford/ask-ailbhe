# Ask Ailbhe

ChatGPT-style web UI for a single on-prem Ollama instance.

Ailbhe is pronounced "Alva".

## Setup

1. Install dependencies:

   npm install

2. Configure Ollama endpoint in `.env.local`:

   OLLAMA_BASE_URL=http://192.168.0.124:11434

   Use `http://51.199.20.244:11434` only when the app host must reach Ollama via the external IP.

3. Start app:

   npm run dev

4. Open:

   http://localhost:3000

## Optional env vars

- `OLLAMA_DEFAULT_MODEL` (default: `llama3`)
- `OLLAMA_TIMEOUT_MS` (default: `20000`)
