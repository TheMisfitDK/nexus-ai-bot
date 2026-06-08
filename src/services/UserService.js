// src/services/UserService.js — Authorization Management Service
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');

class UserService {
  async getOrCreate(platform, platformUserId, userData = {}) {
    const userId = `${platform}:${platformUserId}`;
    let user = await User.findOne({ userId });

    if (!user) {
      const isOwner = this._isOwner(platform, platformUserId);
      const referralCode = uuidv4().split('-')[0].toUpperCase();
      
      user = await User.create({
        userId,
        platform,
        isOwner,
        isAuthorized: isOwner, // Owner is auto-authorized
        tokenLimit: isOwner ? null : config.limits.authorizedUserTokenLimit,
        referralCode,
        aiProvider: config.ai.defaultProvider,
        aiModel: config.ai.defaultModel,
        ...userData,
      });
    } else {
      // Update last active
      user.lastActiveAt = new Date();
      if (userData.username) user.username = userData.username;
      await user.save();
    }

    return user;
  }

  /**
   * Check if platform user ID is the owner
   */
  _isOwner(platform, platformUserId) {
    const userIdStr = String(platformUserId);
    if (platform === 'telegram') return userIdStr === String(config.app.ownerIdTelegram);
    if (platform === 'discord') return userIdStr === String(config.app.ownerIdDiscord);
    return false;
  }

  /**
   * Check if user is in authorized list
   */
  _isInAuthorizedList(platform, platformUserId) {
    const userIdStr = String(platformUserId);
    if (platform === 'telegram') {
      const authorized = (config.app.authorizedTelegramUsers || '').split(',').map(x => x.trim()).filter(x => x);
      return authorized.includes(userIdStr);
    }
    if (platform === 'discord') {
      const authorized = (config.app.authorizedDiscordUsers || '').split(',').map(x => x.trim()).filter(x => x);
      return authorized.includes(userIdStr);
    }
    return false;
  }

  /**
   * Authorize a user to use the bot
   */
  async authorizeUser(userId, tokenLimit = null) {
    return User.findOneAndUpdate(
      { userId },
      {
        $set: {
          isAuthorized: true,
          authorizedBy: config.app.ownerIdTelegram || config.app.ownerIdDiscord,
          authorizationDate: new Date(),
          tokenLimit: tokenLimit || config.limits.authorizedUserTokenLimit,
        },
      },
      { new: true }
    );
  }

  /**
   * Revoke a user's authorization
   */
  async revokeAuthorization(userId) {
    return User.findOneAndUpdate(
      { userId },
      { $set: { isAuthorized: false, tokenLimit: null } },
      { new: true }
    );
  }

  /**
   * Set token limit for authorized user
   */
  async setTokenLimit(userId, tokenLimit) {
    return User.findOneAndUpdate(
      { userId },
      { $set: { tokenLimit } },
      { new: true }
    );
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
    return User.findOneAndUpdate(
      { userId },
      {
        $inc: { dailyMessages: 1, totalMessages: 1, totalTokensUsed: tokensUsed },
        $set: { lastMessageDate: new Date(), lastActiveAt: new Date() },
      },
      { new: true }
    );
  }

  async ban(userId, reason = 'Violated terms of service') {
    return this.update(userId, { isBanned: true, banReason: reason });
  }

  async unban(userId) {
    return this.update(userId, { isBanned: false, banReason: '' });
  }

  async getStats(userId) {
    const user = await this.get(userId);
    if (!user) return null;
    
    const tokenStats = user.getTokenStats();
    
    return {
      isOwner: user.isOwner,
      isAuthorized: user.isAuthorized,
      authorizationDate: user.authorizationDate,
      totalMessages: user.totalMessages,
      dailyMessages: user.dailyMessages,
      totalTokensUsed: tokenStats.used,
      tokenLimit: tokenStats.limit,
      remainingTokens: tokenStats.remaining,
      tokenUsagePercentage: tokenStats.percentage,
      isTokenLimitUnlimited: tokenStats.isUnlimited,
      provider: user.aiProvider,
      model: user.aiModel,
      persona: user.persona,
      temperature: user.temperature,
      memberSince: user.createdAt,
    };
  }

  async getAllUsers(limit = 50, skip = 0) {
    return User.find().sort({ totalMessages: -1 }).limit(limit).skip(skip);
  }

  async getAuthorizedUsers(limit = 100, skip = 0) {
    return User.find({ isAuthorized: true, isOwner: false })
      .sort({ authorizationDate: -1 })
      .limit(limit)
      .skip(skip);
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

  /**
   * Get authorization status message
   */
  getAuthStatusMessage(user) {
    if (user.isOwner) {
      return '👑 Owner • Unlimited Access • ∞ Tokens';
    }
    if (!user.isAuthorized) {
      return '🔐 Not Authorized • No Access';
    }
    const stats = user.getTokenStats();
    if (stats.isUnlimited) {
      return '✅ Authorized • ∞ Tokens Remaining';
    }
    return `✅ Authorized • ${stats.remaining.toLocaleString()} tokens remaining (${stats.percentage}% used)`;
  }
}

module.exports = new UserService();
