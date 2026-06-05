// src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Universal ID (platform:id format)
  userId: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['telegram', 'discord'], required: true },

  // Identity
  username: String,
  firstName: String,
  lastName: String,
  languageCode: { type: String, default: 'en' },

  // AI Preferences
  aiProvider: { type: String, default: 'openai' },
  aiModel: { type: String, default: 'gpt-4o-mini' },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 2048 },
  systemPrompt: { type: String, default: '' },
  persona: { type: String, default: 'default' },
  language: { type: String, default: 'en' },
  streamResponses: { type: Boolean, default: true },
  responseFormat: { type: String, enum: ['text', 'markdown', 'html'], default: 'markdown' },

  // Usage & Limits
  plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  dailyMessages: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalTokensUsed: { type: Number, default: 0 },
  lastMessageDate: Date,
  planExpiresAt: Date,

  // State
  isBlocked: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: String,

  // Referral
  referredBy: String,
  referralCode: { type: String, unique: true, sparse: true },
  referralCount: { type: Number, default: 0 },

  // Notifications
  notifications: {
    enabled: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    updates: { type: Boolean, default: true },
  },

  // Context/Memory
  contextEnabled: { type: Boolean, default: true },
  memoryEnabled: { type: Boolean, default: false },
  userMemory: [{ type: String }],

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Reset daily count if new day
userSchema.methods.checkAndResetDaily = function () {
  const now = new Date();
  const last = this.lastMessageDate;
  if (!last || now.toDateString() !== last.toDateString()) {
    this.dailyMessages = 0;
    this.lastMessageDate = now;
  }
};

userSchema.methods.canSendMessage = function (limits) {
  this.checkAndResetDaily();
  const limit = this.plan === 'free' ? limits.freeDailyMessages :
    this.plan === 'pro' ? limits.proDailyMessages : Infinity;
  return this.dailyMessages < limit;
};

userSchema.methods.getRemainingMessages = function (limits) {
  this.checkAndResetDaily();
  const limit = this.plan === 'free' ? limits.freeDailyMessages :
    this.plan === 'pro' ? limits.proDailyMessages : Infinity;
  return Math.max(0, limit - this.dailyMessages);
};

module.exports = mongoose.model('User', userSchema);
