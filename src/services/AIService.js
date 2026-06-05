// src/services/AIService.js — Unified AI provider abstraction
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.clients = {};
    this._initClients();
  }

  _initClients() {
    const { providers } = config.ai;

    // OpenAI-compatible clients (OpenAI, Groq, DeepSeek, NVIDIA, Grok, Mistral, Together, Perplexity, Cohere)
    const openAICompatible = ['openai', 'groq', 'deepseek', 'nvidia', 'grok', 'mistral', 'together', 'perplexity'];
    for (const name of openAICompatible) {
      const p = providers[name];
      if (p?.apiKey) {
        this.clients[name] = new OpenAI({
          apiKey: p.apiKey,
          ...(p.baseUrl ? { baseURL: p.baseUrl } : {}),
        });
      }
    }

    // Anthropic
    if (providers.anthropic?.apiKey) {
      this.clients.anthropic = new Anthropic({ apiKey: providers.anthropic.apiKey });
    }

    // Google
    if (providers.google?.apiKey) {
      this.clients.google = new GoogleGenerativeAI(providers.google.apiKey);
    }

    // HuggingFace (raw HTTP)
    if (providers.huggingface?.apiKey) {
      this.clients.huggingface = { apiKey: providers.huggingface.apiKey };
    }
  }

  /**
   * Main chat method — routes to correct provider
   * @param {Object} opts
   * @param {string} opts.provider
   * @param {string} opts.model
   * @param {Array}  opts.messages  [{role, content}]
   * @param {number} opts.maxTokens
   * @param {number} opts.temperature
   * @param {boolean} opts.stream
   * @param {Function} opts.onToken   stream callback
   */
  async chat(opts) {
    const { provider, model, messages, maxTokens, temperature, stream, onToken } = {
      provider: config.ai.defaultProvider,
      model: config.ai.defaultModel,
      maxTokens: config.ai.defaultMaxTokens,
      temperature: config.ai.defaultTemperature,
      stream: false,
      ...opts,
    };

    logger.debug(`AI request: ${provider}/${model}`);

    try {
      switch (provider) {
        case 'anthropic':
          return await this._callAnthropic({ model, messages, maxTokens, temperature, stream, onToken });
        case 'google':
          return await this._callGoogle({ model, messages, maxTokens, temperature, stream, onToken });
        case 'huggingface':
          return await this._callHuggingFace({ model, messages, maxTokens, temperature });
        default:
          return await this._callOpenAICompat({ provider, model, messages, maxTokens, temperature, stream, onToken });
      }
    } catch (err) {
      logger.error(`AI error [${provider}/${model}]: ${err.message}`);
      throw this._wrapError(err, provider);
    }
  }

  async _callOpenAICompat({ provider, model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients[provider];
    if (!client) throw new Error(`Provider "${provider}" not configured. Set API key in .env.`);

    if (stream && onToken) {
      const s = await client.chat.completions.create({
        model, messages, max_tokens: maxTokens, temperature, stream: true,
      });
      let full = '';
      for await (const chunk of s) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) { full += token; await onToken(token); }
      }
      return { content: full, provider, model };
    }

    const res = await client.chat.completions.create({
      model, messages, max_tokens: maxTokens, temperature,
    });
    return {
      content: res.choices[0].message.content,
      tokensUsed: res.usage?.total_tokens || 0,
      provider, model,
    };
  }

  async _callAnthropic({ model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients.anthropic;
    if (!client) throw new Error('Anthropic not configured. Set ANTHROPIC_API_KEY.');

    // Extract system message
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role, content: m.content,
    }));

    if (stream && onToken) {
      const s = client.messages.stream({
        model, messages: chatMsgs, max_tokens: maxTokens, temperature,
        ...(systemMsg ? { system: systemMsg } : {}),
      });
      let full = '';
      for await (const event of s) {
        if (event.type === 'content_block_delta') {
          const token = event.delta?.text || '';
          if (token) { full += token; await onToken(token); }
        }
      }
      return { content: full, provider: 'anthropic', model };
    }

    const res = await client.messages.create({
      model, messages: chatMsgs, max_tokens: maxTokens, temperature,
      ...(systemMsg ? { system: systemMsg } : {}),
    });
    return {
      content: res.content[0].text,
      tokensUsed: res.usage?.input_tokens + res.usage?.output_tokens || 0,
      provider: 'anthropic', model,
    };
  }

  async _callGoogle({ model, messages, maxTokens, temperature, stream, onToken }) {
    const client = this.clients.google;
    if (!client) throw new Error('Google AI not configured. Set GOOGLE_AI_API_KEY.');

    const genModel = client.getGenerativeModel({ model });
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const chatMsgs = messages.filter(m => m.role !== 'system');

    // Build history (all but last)
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

    const axios = require('axios');
    const res = await axios.post(
      `${config.ai.providers.huggingface.baseUrl}/${model}`,
      { inputs: prompt, parameters: { max_new_tokens: maxTokens, temperature } },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const content = res.data[0]?.generated_text?.replace(prompt, '').trim() || '';
    return { content, provider: 'huggingface', model };
  }

  _wrapError(err, provider) {
    if (err.status === 429) return new Error(`⚠️ Rate limit hit on ${provider}. Try again in a moment.`);
    if (err.status === 401) return new Error(`❌ Invalid API key for ${provider}.`);
    if (err.status === 402) return new Error(`💳 Insufficient credits on ${provider}.`);
    if (err.code === 'ENOTFOUND') return new Error(`🌐 Network error. Check your connection.`);
    return new Error(`AI error (${provider}): ${err.message}`);
  }

  getAvailableProviders() {
    return Object.keys(this.clients);
  }

  getModelsForProvider(provider) {
    return config.ai.providers[provider]?.models || [];
  }

  getAllModels() {
    const result = {};
    for (const [name, p] of Object.entries(config.ai.providers)) {
      if (this.clients[name]) result[name] = p.models;
    }
    return result;
  }

  isFreeProvider(provider) {
    return config.ai.providers[provider]?.free || false;
  }
}

module.exports = new AIService();
