// src/services/AIService.js — NexusAI v3 Unified AI Provider
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.clients = {};
    this._initClients();
  }

  _initClients() {
    const { providers } = config.ai;
    const openAICompat = ['openai', 'groq', 'deepseek', 'nvidia', 'grok', 'mistral', 'together', 'perplexity'];

    for (const name of openAICompat) {
      const p = providers[name];
      if (p?.apiKey) {
        try {
          this.clients[name] = new OpenAI({
            apiKey: p.apiKey,
            ...(p.baseUrl ? { baseURL: p.baseUrl } : {}),
            timeout: 30000,
            maxRetries: 2,
          });
          logger.info(`✅ AI provider loaded: ${name}`);
        } catch (e) {
          logger.warn(`⚠️ Failed to init ${name}: ${e.message}`);
        }
      }
    }

    if (providers.anthropic?.apiKey) {
      this.clients.anthropic = new Anthropic({ apiKey: providers.anthropic.apiKey, timeout: 30000 });
      logger.info('✅ AI provider loaded: anthropic');
    }

    if (providers.google?.apiKey) {
      this.clients.google = new GoogleGenerativeAI(providers.google.apiKey);
      logger.info('✅ AI provider loaded: google');
    }

    if (providers.huggingface?.apiKey) {
      this.clients.huggingface = { apiKey: providers.huggingface.apiKey };
      logger.info('✅ AI provider loaded: huggingface');
    }

    if (providers.cohere?.apiKey) {
      this.clients.cohere = { apiKey: providers.cohere.apiKey };
      logger.info('✅ AI provider loaded: cohere');
    }

    const loaded = Object.keys(this.clients);
    if (loaded.length === 0) {
      logger.warn('⚠️  No AI providers configured! Set at least GROQ_API_KEY (free) in env vars.');
    } else {
      logger.info(`🤖 ${loaded.length} AI provider(s) active: ${loaded.join(', ')}`);
    }
  }

  async chat(opts) {
    let { provider, model, messages, maxTokens, temperature, stream, onToken } = {
      provider: config.ai.defaultProvider,
      model: config.ai.defaultModel,
      maxTokens: config.ai.defaultMaxTokens,
      temperature: config.ai.defaultTemperature,
      stream: false,
      onToken: null,
      ...opts,
    };

    // Auto-fallback: if requested provider not available, use first available
    if (!this.clients[provider]) {
      const fallback = Object.keys(this.clients)[0];
      if (!fallback) throw new Error('No AI providers configured. Add at least GROQ_API_KEY to env vars (free at console.groq.com).');
      logger.warn(`Provider "${provider}" not configured — falling back to "${fallback}"`);
      provider = fallback;
      model = config.ai.providers[fallback]?.models[0] || model;
    }

    logger.debug(`AI request: ${provider}/${model}`);

    try {
      switch (provider) {
        case 'anthropic': return await this._callAnthropic({ model, messages, maxTokens, temperature, stream, onToken });
        case 'google': return await this._callGoogle({ model, messages, maxTokens, temperature, stream, onToken });
        case 'huggingface': return await this._callHuggingFace({ model, messages, maxTokens, temperature });
        case 'cohere': return await this._callCohere({ model, messages, maxTokens, temperature });
        default: return await this._callOpenAICompat({ provider, model, messages, maxTokens, temperature, stream, onToken });
      }
    } catch (err) {
      logger.error(`AI error [${provider}/${model}]: ${err.message}`);
      throw this._wrapError(err, provider);
    }
  }

  async _callOpenAICompat({ provider, model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients[provider];
    if (!client) throw new Error(`Provider "${provider}" not configured.`);

    // o1 models don't support temperature or system messages
    const isO1 = model.startsWith('o1');
    const cleanMessages = isO1 ? messages.filter(m => m.role !== 'system') : messages;
    const params = {
      model,
      messages: cleanMessages,
      max_tokens: maxTokens,
      ...(isO1 ? {} : { temperature }),
    };

    if (stream && onToken && !isO1) {
      const s = await client.chat.completions.create({ ...params, stream: true });
      let full = '';
      for await (const chunk of s) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) { full += token; await onToken(token); }
      }
      return { content: full, provider, model };
    }

    const res = await client.chat.completions.create(params);
    return {
      content: res.choices[0]?.message?.content || '',
      tokensUsed: res.usage?.total_tokens || 0,
      provider, model,
    };
  }

  async _callAnthropic({ model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients.anthropic;
    if (!client) throw new Error('Anthropic not configured.');
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
    // Ensure alternating roles
    const cleaned = [];
    for (const m of chatMsgs) {
      if (cleaned.length && cleaned[cleaned.length - 1].role === m.role) {
        cleaned[cleaned.length - 1].content += '\n' + m.content;
      } else {
        cleaned.push(m);
      }
    }
    if (!cleaned.length || cleaned[0].role !== 'user') cleaned.unshift({ role: 'user', content: '.' });

    const params = {
      model, messages: cleaned, max_tokens: maxTokens, temperature,
      ...(systemMsg ? { system: systemMsg } : {}),
    };

    if (stream && onToken) {
      const s = client.messages.stream(params);
      let full = '';
      for await (const event of s) {
        if (event.type === 'content_block_delta') {
          const token = event.delta?.text || '';
          if (token) { full += token; await onToken(token); }
        }
      }
      return { content: full, provider: 'anthropic', model };
    }
    const res = await client.messages.create(params);
    return {
      content: res.content[0]?.text || '',
      tokensUsed: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0),
      provider: 'anthropic', model,
    };
  }

  async _callGoogle({ model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients.google;
    if (!client) throw new Error('Google AI not configured.');
    const genModel = client.getGenerativeModel({ model });
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMsgs = messages.filter(m => m.role !== 'system');
    const history = chatMsgs.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const chat = genModel.startChat({
      history,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
      ...(systemMsg ? { systemInstruction: systemMsg } : {}),
    });
    const lastMsg = chatMsgs[chatMsgs.length - 1]?.content || '';
    if (stream && onToken) {
      const result = await chat.sendMessageStream(lastMsg);
      let full = '';
      for await (const chunk of result.stream) {
        const token = chunk.text();
        if (token) { full += token; await onToken(token); }
      }
      return { content: full, provider: 'google', model };
    }
    const result = await chat.sendMessage(lastMsg);
    return {
      content: result.response.text(),
      tokensUsed: result.response.usageMetadata?.totalTokenCount || 0,
      provider: 'google', model,
    };
  }

  async _callHuggingFace({ model, messages, maxTokens, temperature }) {
    const { apiKey } = this.clients.huggingface;
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
    const res = await axios.post(
      `${config.ai.providers.huggingface.baseUrl}/${model}`,
      { inputs: prompt, parameters: { max_new_tokens: maxTokens, temperature, return_full_text: false } },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 }
    );
    const content = Array.isArray(res.data)
      ? res.data[0]?.generated_text?.trim() || ''
      : res.data?.generated_text?.trim() || '';
    return { content, provider: 'huggingface', model };
  }

  async _callCohere({ model, messages, maxTokens, temperature }) {
    const { apiKey } = this.clients.cohere;
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatHistory = messages.filter(m => m.role !== 'system').slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'USER' : 'CHATBOT',
      message: m.content,
    }));
    const lastMsg = messages.filter(m => m.role !== 'system').slice(-1)[0]?.content || '';
    const res = await axios.post(
      `${config.ai.providers.cohere.baseUrl}/chat`,
      {
        model, message: lastMsg, chat_history: chatHistory,
        preamble: systemMsg, max_tokens: maxTokens, temperature,
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    return { content: res.data.text || '', provider: 'cohere', model };
  }

  _wrapError(err, provider) {
    const status = err.status || err.response?.status;
    if (status === 429) return new Error(`⚠️ Rate limit on ${provider}. Wait a moment.`);
    if (status === 401) return new Error(`❌ Invalid API key for ${provider}.`);
    if (status === 402) return new Error(`💳 Insufficient credits on ${provider}.`);
    if (status === 404) return new Error(`❌ Model not found on ${provider}. Use /model to pick another.`);
    if (status === 503) return new Error(`🔧 ${provider} is temporarily down. Try another provider.`);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') return new Error(`🌐 Network error connecting to ${provider}.`);
    if (err.code === 'ETIMEDOUT') return new Error(`⏱️ Request to ${provider} timed out. Try again.`);
    return new Error(`AI error (${provider}): ${err.message}`);
  }

  getAvailableProviders() { return Object.keys(this.clients); }
  getModelsForProvider(p) { return config.ai.providers[p]?.models || []; }
  isFreeProvider(p) { return config.ai.providers[p]?.free || false; }
  isConfigured(p) { return !!this.clients[p]; }

  getAllModels() {
    const r = {};
    for (const [name] of Object.entries(this.clients)) {
      r[name] = config.ai.providers[name]?.models || [];
    }
    return r;
  }
}

module.exports = new AIService();
