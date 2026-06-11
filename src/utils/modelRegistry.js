// src/utils/modelRegistry.js — Dynamic model auto-detection with cache
const axios = require('axios');
const config = require('../../config');
const logger = require('./logger');

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _cache = new Map(); // provider → { models: string[], fetchedAt: number }

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Fetch models from any OpenAI-compatible /v1/models endpoint.
 * @param {string}   baseUrl
 * @param {string}   apiKey
 * @param {Function} filterFn   - predicate applied to raw model objects
 * @param {number}   maxResults - hard cap after filtering (0 = no cap)
 * @param {number}   timeoutMs
 */
async function _openaiCompat(baseUrl, apiKey, filterFn, maxResults = 60, timeoutMs = 15000) {
  const res = await axios.get(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: timeoutMs,
  });
  const raw = res.data?.data || res.data?.models || [];
  const filtered = (filterFn ? raw.filter(filterFn) : raw).map(m => m.id).sort();
  return maxResults ? filtered.slice(0, maxResults) : filtered;
}

/**
 * Common skip-list for non-chat model types shared across many providers.
 * Matches: embeddings, rerankers, image-gen, TTS/ASR, vision-only, moderation,
 * guard, classifier, retrieval, etc.
 */
const SKIP_NON_CHAT = /embed|rerank|tts|asr|whisper|speech|vision(?!.*instruct)|vqa|vlm\b|ocr|diffusion|stable|flux|upscale|guard|moderat|classif|sentiment|segment|detect|caption|grounding|depth|sam\b|clip\b|parakeet|canary|e5-|bge-|nvembed|retriev/i;

// ── Per-provider fetchers ─────────────────────────────────────────────────────

const FETCHERS = {

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  // Keep only GPT / O-series chat models; drop realtime, audio, instruct, ft, old snapshots.
  openai: async ({ apiKey }) => _openaiCompat(
    'https://api.openai.com/v1', apiKey,
    m => /^(gpt-4|gpt-3\.5|o1|o3|o4)/.test(m.id)
      && !SKIP_NON_CHAT.test(m.id)
      && !m.id.includes('realtime')
      && !m.id.includes('audio')
      && !m.id.includes('instruct')
      && !m.id.includes('-0301') && !m.id.includes('-0314') // ancient snapshots
  ),

  // ── Anthropic ───────────────────────────────────────────────────────────────
  // All models from /v1/models are chat-capable; no filtering needed.
  anthropic: async ({ apiKey }) => {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
    });
    return (res.data?.data || []).map(m => m.id).sort();
  },

  // ── Google Gemini ───────────────────────────────────────────────────────────
  // Only keep models that support generateContent (= chat / multimodal generation).
  // Drop embedding, AQA, vision-only, legacy PaLM, and experimental/preview models
  // that are unreliable for everyday use.
  google: async ({ apiKey }) => {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { timeout: 15000 }
    );
    return (res.data?.models || [])
      .filter(m => {
        const id = m.name.replace('models/', '');
        const methods = m.supportedGenerationMethods || [];
        return methods.includes('generateContent')
          && !SKIP_NON_CHAT.test(id)
          && !/^text-|^palm|aqa|^chat-bison|^gemini-.*-001$/.test(id); // drop legacy & old 001 snapshots
      })
      .map(m => m.name.replace('models/', ''))
      .sort();
  },

  // ── Groq ────────────────────────────────────────────────────────────────────
  // Groq hosts chat LLMs + whisper ASR. Keep only chat-capable models.
  groq: async ({ apiKey }) => _openaiCompat(
    'https://api.groq.com/openai/v1', apiKey,
    m => !SKIP_NON_CHAT.test(m.id) && !m.id.includes('guard')
  ),

  // ── DeepSeek ────────────────────────────────────────────────────────────────
  // Small provider — all listed models are chat/reasoner. Filter out any future
  // embedding or specialised models.
  deepseek: async ({ apiKey }) => _openaiCompat(
    'https://api.deepseek.com/v1', apiKey,
    m => !SKIP_NON_CHAT.test(m.id)
  ),

  // ── NVIDIA NIM ──────────────────────────────────────────────────────────────
  // 100+ models covering chat, vision, TTS, image-gen, embeddings, retrieval…
  // Keep only text-chat / instruct models; surface popular families first.
  nvidia: async ({ apiKey }) => {
    const CHAT_REQUIRED = /\b(instruct|chat|it\b|llama|mistral|gemma|phi|qwen|nemotron|deepseek|arctic|falcon|command|hermes|nous|solar|mixtral|wizard|vicuna|orca)\b/i;

    const raw = await _openaiCompat(
      'https://integrate.api.nvidia.com/v1', apiKey,
      m => CHAT_REQUIRED.test(m.id) && !SKIP_NON_CHAT.test(m.id),
      200,   // fetch wide then trim below
      30000  // NVIDIA is slow
    );

    const MAX = 40;
    if (raw.length > MAX) {
      logger.info(`ModelRegistry [nvidia]: trimmed ${raw.length} → ${MAX}`);
      const priority = id => /llama|mistral|gemma|phi|qwen/i.test(id) ? 0 : 1;
      raw.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
      return raw.slice(0, MAX);
    }
    return raw;
  },

  // ── xAI Grok ────────────────────────────────────────────────────────────────
  grok: async ({ apiKey }) => _openaiCompat(
    'https://api.x.ai/v1', apiKey,
    m => m.id.startsWith('grok') && !SKIP_NON_CHAT.test(m.id)
  ),

  // ── Mistral ─────────────────────────────────────────────────────────────────
  // Drop embed models; keep all chat/completion models.
  mistral: async ({ apiKey }) => {
    const res = await axios.get('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    return (res.data?.data || [])
      .filter(m => !SKIP_NON_CHAT.test(m.id))
      .map(m => m.id)
      .sort();
  },

  // ── Together AI ─────────────────────────────────────────────────────────────
  // Together lists 100+ models (chat, image, language, embedding, code, …).
  // Use the type/display_type field to keep only chat models.
  together: async ({ apiKey }) => {
    const res = await axios.get('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });
    const all = Array.isArray(res.data) ? res.data : [];
    const chat = all.filter(m =>
      (m.type === 'chat' || m.display_type === 'chat') && !SKIP_NON_CHAT.test(m.id)
    ).map(m => m.id).sort();
    // Together can still return 50+ chat models; cap at 40 for Telegram safety
    return chat.slice(0, 40);
  },

  // ── Perplexity ──────────────────────────────────────────────────────────────
  // Perplexity exposes a small curated list; all are sonar/online models for chat.
  perplexity: async ({ apiKey }) => _openaiCompat(
    'https://api.perplexity.ai', apiKey,
    m => !SKIP_NON_CHAT.test(m.id)
  ),

  // ── Cohere ──────────────────────────────────────────────────────────────────
  // Keep only Command-series models (chat/generation). Drop embed, rerank, classify.
  cohere: async ({ apiKey }) => {
    const res = await axios.get('https://api.cohere.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    return (res.data?.models || [])
      .filter(m => {
        const id = (m.name || m.id || '');
        return /command/i.test(id) && !SKIP_NON_CHAT.test(id);
      })
      .map(m => m.name || m.id)
      .sort();
  },

  // ── HuggingFace ─────────────────────────────────────────────────────────────
  // HF has no practical "list usable chat models" endpoint — the Hub has millions.
  // The bot uses a specific baseUrl pattern for the Inference API, so we probe
  // the static list from config and verify each model is actually reachable by
  // doing a lightweight HEAD/OPTIONS; on failure we silently drop it.
  // If probing fails wholesale, fall back to the static config list.
  huggingface: async ({ apiKey }) => {
    const staticModels = config.ai.providers.huggingface?.models || [];
    if (!staticModels.length) return [];

    const baseUrl = config.ai.providers.huggingface?.baseUrl ||
      'https://router.huggingface.co/hf-inference/models';

    // Probe each model with a minimal payload; keep those that don't 404/503.
    const results = await Promise.allSettled(
      staticModels.map(model =>
        axios.post(
          `${baseUrl}/${model}`,
          { inputs: 'hi', parameters: { max_new_tokens: 1 } },
          { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 8000 }
        ).then(() => model)
         .catch(err => {
           // 503 = model loading (still usable), 200/other = usable; only 404 = gone
           if (err.response?.status === 404) return null;
           return model; // treat timeouts/503 as usable
         })
      )
    );

    const usable = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    logger.info(`ModelRegistry [huggingface]: ${usable.length}/${staticModels.length} models reachable`);
    return usable.length ? usable : staticModels; // fallback if all probes fail
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Async: fetch live models (uses cache if fresh). */
async function getModels(provider) {
  const cached = _cache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.models;

  const cfg = config.ai.providers[provider];
  if (!cfg?.apiKey) return cfg?.models || [];

  const fetcher = FETCHERS[provider];
  if (!fetcher) return cfg?.models || [];

  try {
    const models = await fetcher(cfg);
    if (models.length > 0) {
      _cache.set(provider, { models, fetchedAt: Date.now() });
      logger.info(`ModelRegistry [${provider}]: ${models.length} models cached`);
      return models;
    }
    logger.warn(`ModelRegistry [${provider}]: empty response — using static fallback`);
    return cfg?.models || [];
  } catch (err) {
    logger.warn(`ModelRegistry [${provider}]: ${err.message} — using static fallback`);
    return cfg?.models || [];
  }
}

/** Sync: return cached models (or static fallback). Safe to call in menus/sync code. */
function getCached(provider) {
  return _cache.get(provider)?.models || config.ai.providers[provider]?.models || [];
}

/** Boot call: refresh all configured providers in parallel. */
async function refreshAll() {
  const providers = Object.keys(config.ai.providers).filter(
    p => config.ai.providers[p]?.apiKey
  );
  const results = await Promise.allSettled(providers.map(p => getModels(p)));
  const summary = {};
  providers.forEach((p, i) => {
    summary[p] = results[i].status === 'fulfilled' ? results[i].value.length : 'error';
  });
  logger.info(`ModelRegistry boot refresh: ${JSON.stringify(summary)}`);
  return summary;
}

/** Force-expire cache for one provider (triggers refetch on next call). */
function invalidate(provider) {
  _cache.delete(provider);
}

module.exports = { getModels, getCached, refreshAll, invalidate };
