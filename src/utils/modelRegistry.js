// src/utils/modelRegistry.js — Dynamic model auto-detection with cache
const axios = require('axios');
const config = require('../../config');
const logger = require('./logger');

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _cache = new Map(); // provider → { models: string[], fetchedAt: number }

// ── Per-provider fetchers ─────────────────────────────────────────────────────

async function _openaiCompat(baseUrl, apiKey, filterFn) {
  const res = await axios.get(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 10000,
  });
  const raw = res.data?.data || res.data?.models || [];
  return (filterFn ? raw.filter(filterFn) : raw).map(m => m.id).sort();
}

const FETCHERS = {

  openai: async ({ apiKey }) => _openaiCompat(
    'https://api.openai.com/v1', apiKey,
    m => /^(gpt-|o1|o3)/.test(m.id) && !m.id.includes('realtime') && !m.id.includes('audio') && !m.id.includes('instruct')
  ),

  anthropic: async ({ apiKey }) => {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
    });
    return (res.data?.data || []).map(m => m.id).sort();
  },

  google: async ({ apiKey }) => {
    const res = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { timeout: 10000 }
    );
    return (res.data?.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .sort();
  },

  groq: async ({ apiKey }) => _openaiCompat(
    'https://api.groq.com/openai/v1', apiKey,
    // exclude whisper/tts/guard models from chat list
    m => !m.id.includes('whisper') && !m.id.includes('tts') && !m.id.includes('guard')
  ),

  deepseek: async ({ apiKey }) => _openaiCompat(
    'https://api.deepseek.com/v1', apiKey, null
  ),

  nvidia: async ({ apiKey }) => _openaiCompat(
    'https://integrate.api.nvidia.com/v1', apiKey,
    m => !m.id.includes('embed') && !m.id.includes('rerank')
  ),

  grok: async ({ apiKey }) => _openaiCompat(
    'https://api.x.ai/v1', apiKey,
    m => m.id.startsWith('grok')
  ),

  mistral: async ({ apiKey }) => {
    const res = await axios.get('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    return (res.data?.data || [])
      .filter(m => !m.id.includes('embed'))
      .map(m => m.id).sort();
  },

  together: async ({ apiKey }) => {
    const res = await axios.get('https://api.together.xyz/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    // together returns array directly; filter to chat models only
    return (Array.isArray(res.data) ? res.data : [])
      .filter(m => m.type === 'chat' || m.display_type === 'chat')
      .map(m => m.id).sort();
  },

  perplexity: async ({ apiKey }) => _openaiCompat(
    'https://api.perplexity.ai', apiKey, null
  ),

  cohere: async ({ apiKey }) => {
    const res = await axios.get('https://api.cohere.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    return (res.data?.models || [])
      .filter(m => /command/i.test(m.name || m.id || ''))
      .map(m => m.name || m.id).sort();
  },

  // HuggingFace has no practical list endpoint — static fallback only
  huggingface: async () => config.ai.providers.huggingface?.models || [],
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
      logger.info(`ModelRegistry [${provider}]: ${models.length} models`);
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
