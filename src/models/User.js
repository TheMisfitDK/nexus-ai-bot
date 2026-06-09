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

  // Authorization & Token Balance
  isAuthorized: { type: Boolean, default: false },
  tokenBalance: { type: Number, default: 0 },
  tokensGranted: { type: Number, default: 0 },  // lifetime total granted

  // Usage tracking (stats only, not for limiting)
  totalMessages: { type: Number, default: 0 },
  totalTokensUsed: { type: Number, default: 0 },

  // State
  isBlocked: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  banReason: String,

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

// Returns true if user has access (authorized + tokens remaining)
userSchema.methods.canSendMessage = function () {
  return this.isAuthorized && this.tokenBalance > 0;
};

userSchema.methods.getRemainingTokens = function () {
  return Math.max(0, this.tokenBalance);
};

module.exports = mongoose.model('User', userSchema);
