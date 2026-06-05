// src/services/ContextService.js — Manage conversation context
const { Conversation } = require('../models');
const NodeCache = require('node-cache');
const config = require('../../config');

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5min TTL

class ContextService {
  _cacheKey(userId, chatId) {
    return `ctx:${userId}:${chatId}`;
  }

  async getContext(userId, chatId) {
    const key = this._cacheKey(userId, chatId);
    const cached = cache.get(key);
    if (cached) return cached;

    let conv = await Conversation.findOne({ userId, chatId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    if (!conv) {
      conv = await Conversation.create({ userId, chatId, platform: userId.split(':')[0], messages: [] });
    }

    cache.set(key, conv);
    return conv;
  }

  async addMessage(userId, chatId, role, content, meta = {}) {
    const msg = { role, content, ...meta, timestamp: new Date() };

    // Update DB
    const conv = await Conversation.findOneAndUpdate(
      { userId, chatId, isActive: true },
      {
        $push: { messages: msg },
        $inc: { totalTokens: meta.tokensUsed || 0 },
        $set: { updatedAt: new Date(), provider: meta.provider, model: meta.model },
        $setOnInsert: { platform: userId.split(':')[0] },
      },
      { upsert: true, new: true }
    );

    // Trim to max context
    if (conv.messages.length > config.limits.maxContextMessages * 2) {
      const keep = conv.messages.slice(-config.limits.maxContextMessages);
      await Conversation.updateOne({ _id: conv._id }, { $set: { messages: keep } });
      conv.messages = keep;
    }

    // Bust cache
    cache.del(this._cacheKey(userId, chatId));
    return conv;
  }

  async getMessages(userId, chatId, systemPrompt = '') {
    const conv = await this.getContext(userId, chatId);
    const messages = [];

    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    // Take last N messages
    const recent = (conv.messages || []).slice(-config.limits.maxContextMessages);
    for (const m of recent) {
      messages.push({ role: m.role, content: m.content });
    }

    return messages;
  }

  async clearContext(userId, chatId) {
    await Conversation.updateOne(
      { userId, chatId, isActive: true },
      { $set: { messages: [], updatedAt: new Date() } }
    );
    cache.del(this._cacheKey(userId, chatId));
  }

  async newConversation(userId, chatId) {
    // Archive old
    await Conversation.updateMany({ userId, chatId }, { $set: { isActive: false } });
    const conv = await Conversation.create({
      userId, chatId,
      platform: userId.split(':')[0],
      messages: [],
    });
    cache.del(this._cacheKey(userId, chatId));
    return conv;
  }

  async getHistory(userId, limit = 10) {
    return Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('title messages provider model updatedAt totalTokens')
      .lean();
  }

  async exportConversation(userId, chatId, format = 'text') {
    const conv = await this.getContext(userId, chatId);
    if (!conv?.messages?.length) return null;

    if (format === 'json') return JSON.stringify(conv, null, 2);

    let text = `# Conversation Export\nDate: ${new Date().toISOString()}\n\n`;
    for (const m of conv.messages) {
      const label = m.role === 'user' ? '👤 You' : '🤖 Assistant';
      text += `**${label}** [${new Date(m.timestamp).toLocaleString()}]\n${m.content}\n\n---\n\n`;
    }
    return text;
  }

  async summarizeConversation(userId, chatId, aiService) {
    const conv = await this.getContext(userId, chatId);
    if (!conv?.messages?.length) return 'No conversation to summarize.';

    const text = conv.messages.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');
    const result = await aiService.chat({
      provider: config.ai.defaultProvider,
      model: config.ai.defaultModel,
      messages: [
        { role: 'system', content: 'Summarize the following conversation in 3-5 bullet points. Be concise.' },
        { role: 'user', content: text },
      ],
      maxTokens: 512,
    });
    return result.content;
  }
}

module.exports = new ContextService();
