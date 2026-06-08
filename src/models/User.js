// src/models/User.js — Owner-Controlled Authorization Framework
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

  // ─── AUTHORIZATION FRAMEWORK ──────────────────────────────────
  isOwner: { type: Boolean, default: false },
  isAuthorized: { type: Boolean, default: false },
  authorizedBy: String, // Owner's ID who authorized this user
  authorizationDate: Date,

  // Token Management
  totalTokensUsed: { type: Number, default: 0 },
  tokenLimit: { type: Number, default: null }, // null = unlimited (owner only)

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

  // Usage & Analytics
  dailyMessages: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  lastMessageDate: Date,

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

// ─── AUTHORIZATION METHODS ───────────────────────────────────────

/**
 * Check if user can use the bot service
 * Owner always has access; others need explicit authorization
 */
userSchema.methods.canUseService = function () {
  if (this.isOwner) return true;
  if (this.isBanned) return false;
  return this.isAuthorized;
};

/**
 * Check if user has tokens remaining
 * Owner has infinite tokens; authorized users have limits
 */
userSchema.methods.hasTokensRemaining = function () {
  if (this.isOwner) return true; // Owner has infinite tokens
  if (!this.tokenLimit) return true; // No limit set = unlimited
  return this.totalTokensUsed < this.tokenLimit;
};

/**
 * Get remaining tokens for user
 */
userSchema.methods.getRemainingTokens = function () {
  if (this.isOwner) return Infinity;
  if (!this.tokenLimit) return Infinity;
  return Math.max(0, this.tokenLimit - this.totalTokensUsed);
};

/**
 * Get token usage percentage
 */
userSchema.methods.getTokenUsagePercentage = function () {
  if (this.isOwner || !this.tokenLimit) return 0;
  return Math.min(100, Math.round((this.totalTokensUsed / this.tokenLimit) * 100));
};

/**
 * Format token stats for display
 */
userSchema.methods.getTokenStats = function () {
  return {
    used: this.totalTokensUsed,
    limit: this.tokenLimit,
    remaining: this.getRemainingTokens(),
    percentage: this.getTokenUsagePercentage(),
    isUnlimited: this.isOwner || !this.tokenLimit,
  };
};

module.exports = mongoose.model('User', userSchema);
