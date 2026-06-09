// src/services/UserService.js
const User = require('../models/User');
const config = require('../../config');

class UserService {
  async getOrCreate(platform, platformUserId, userData = {}) {
    const userId = `${platform}:${platformUserId}`;
    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({
        userId,
        platform,
        aiProvider: config.ai.defaultProvider,
        aiModel: config.ai.defaultModel,
        ...userData,
      });
    } else {
      user.lastActiveAt = new Date();
      if (userData.username) user.username = userData.username;
      await user.save();
    }

    return user;
  }

  async get(userId) {
    return User.findOne({ userId });
  }

  async update(userId, updates) {
    return User.findOneAndUpdate({ userId }, { $set: updates }, { new: true });
  }

  async setProvider(userId, provider, model) {
    return this.update(userId, { aiProvider: provider, aiModel: model });
  }

  async setSystemPrompt(userId, prompt) {
    return this.update(userId, { systemPrompt: prompt });
  }

  async setPersona(userId, persona) {
    const personas = {
      default: '',
      assistant: 'You are a helpful AI assistant.',
      teacher: 'You are a patient and thorough teacher who explains concepts clearly with examples.',
      coder: 'You are an expert software engineer. Always write clean, well-commented code. Prefer modern best practices.',
      creative: 'You are a creative writer with a flair for storytelling, vivid descriptions, and engaging narratives.',
      analyst: 'You are a sharp data analyst. Give structured, evidence-based insights. Use bullet points.',
      therapist: 'You are a compassionate listener. Be empathetic, non-judgmental, and supportive.',
      comedian: 'You are a witty comedian. Keep things light, funny, and entertaining.',
      scientist: 'You are a rigorous scientist. Cite reasoning, acknowledge uncertainty, explain with precision.',
      lawyer: 'You are a knowledgeable legal expert. Speak precisely and always mention that this is not legal advice.',
      chef: 'You are a Michelin-star chef who loves sharing recipes, cooking tips, and culinary knowledge.',
    };

    const prompt = personas[persona] || '';
    return this.update(userId, { persona, systemPrompt: prompt });
  }

  async incrementUsage(userId, tokensUsed = 0) {
    const update = {
      $inc: {
        totalMessages: 1,
        totalTokensUsed: tokensUsed,
        // Deduct from balance (owner's balance is not tracked — bypassed before this call)
        tokenBalance: -tokensUsed,
      },
      $set: { lastActiveAt: new Date() },
    };
    // Clamp tokenBalance at 0 via a follow-up if needed — simpler to just decrement and let canSendMessage guard
    return User.findOneAndUpdate({ userId }, update, { new: true });
  }

  async ban(userId, reason = 'Violated terms of service') {
    return this.update(userId, { isBanned: true, banReason: reason });
  }

  async unban(userId) {
    return this.update(userId, { isBanned: false, banReason: '' });
  }

  // ── Authorization Framework ──────────────────────────────────────────────

  /**
   * Authorize a user and grant them N tokens.
   * @param {string} userId  - "platform:id" format
   * @param {number} tokens  - Token balance to grant (default from config)
   */
  async authorizeUser(userId, tokens) {
    const amount = tokens ?? config.app.defaultTokenGrant;
    return User.findOneAndUpdate(
      { userId },
      {
        $set: { isAuthorized: true },
        $inc: { tokenBalance: amount, tokensGranted: amount },
      },
      { new: true }
    );
  }

  /**
   * Revoke a user's authorization (does not erase remaining tokens).
   */
  async revokeAuth(userId) {
    return this.update(userId, { isAuthorized: false });
  }

  /**
   * Add tokens to an already-authorized user's balance.
   */
  async addTokens(userId, amount) {
    return User.findOneAndUpdate(
      { userId },
      { $inc: { tokenBalance: amount, tokensGranted: amount } },
      { new: true }
    );
  }

  /**
   * Returns list of all authorized users, sorted by tokensGranted desc.
   */
  async getAuthorizedUsers(limit = 50) {
    return User.find({ isAuthorized: true, isBanned: false })
      .sort({ tokensGranted: -1 })
      .limit(limit);
  }

  async getStats(userId) {
    const user = await this.get(userId);
    if (!user) return null;
    return {
      isAuthorized: user.isAuthorized,
      tokenBalance: user.tokenBalance,
      tokensGranted: user.tokensGranted,
      totalMessages: user.totalMessages,
      totalTokensUsed: user.totalTokensUsed,
      provider: user.aiProvider,
      model: user.aiModel,
      persona: user.persona,
      memberSince: user.createdAt,
    };
  }

  async getAllUsers(limit = 50, skip = 0) {
    return User.find().sort({ totalMessages: -1 }).limit(limit).skip(skip);
  }

  async getTopUsers(limit = 10) {
    return User.find({ isBanned: false }).sort({ totalMessages: -1 }).limit(limit);
  }

  async addMemory(userId, memory) {
    return User.findOneAndUpdate(
      { userId },
      { $push: { userMemory: { $each: [memory], $slice: -20 } } },
      { new: true }
    );
  }

  async clearMemory(userId) {
    return this.update(userId, { userMemory: [] });
  }
}

module.exports = new UserService();
