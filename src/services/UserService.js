// src/services/UserService.js
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');

class UserService {
  async getOrCreate(platform, platformUserId, userData = {}) {
    const userId = `${platform}:${platformUserId}`;
    let user = await User.findOne({ userId });

    if (!user) {
      const referralCode = uuidv4().split('-')[0].toUpperCase();
      user = await User.create({
        userId,
        platform,
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

  async upgradeToPro(userId, daysValid = 30) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);
    return this.update(userId, { plan: 'pro', planExpiresAt: expiresAt });
  }

  async checkPlanExpiry(userId) {
    const user = await this.get(userId);
    if (!user) return;
    if (user.plan === 'pro' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      await this.update(userId, { plan: 'free', planExpiresAt: null });
    }
  }

  async getStats(userId) {
    const user = await this.get(userId);
    if (!user) return null;
    await this.checkPlanExpiry(userId);
    return {
      plan: user.plan,
      totalMessages: user.totalMessages,
      dailyMessages: user.dailyMessages,
      totalTokensUsed: user.totalTokensUsed,
      remaining: user.getRemainingMessages(config.limits),
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
