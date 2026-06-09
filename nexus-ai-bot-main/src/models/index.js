// src/models/Conversation.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  provider: String,
  model: String,
  tokensUsed: Number,
  timestamp: { type: Date, default: Date.now },
  metadata: mongoose.Schema.Types.Mixed,
});

const conversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  chatId: { type: String, required: true },
  title: String,
  messages: [messageSchema],
  provider: String,
  model: String,
  systemPrompt: String,
  totalTokens: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isPinned: { type: Boolean, default: false },
  tags: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

conversationSchema.index({ userId: 1, updatedAt: -1 });

// ─── Reminder ────────────────────────────────────────────────
const reminderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  platform: { type: String, required: true },
  chatId: { type: String, required: true },
  text: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  recurring: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
  sent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// ─── Analytics ───────────────────────────────────────────────
const analyticsSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  platform: String,
  totalMessages: { type: Number, default: 0 },
  totalUsers: { type: Number, default: 0 },
  newUsers: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  providerUsage: { type: Map, of: Number },
  commandUsage: { type: Map, of: Number },
  errorCount: { type: Number, default: 0 },
});

analyticsSchema.index({ date: -1 });

// ─── Note ────────────────────────────────────────────────────
const noteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: String,
  content: { type: String, required: true },
  tags: [String],
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// ─── Feedback ────────────────────────────────────────────────
const feedbackSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  platform: String,
  type: { type: String, enum: ['bug', 'feature', 'general', 'rating'] },
  content: String,
  rating: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = {
  Conversation: mongoose.model('Conversation', conversationSchema),
  Reminder: mongoose.model('Reminder', reminderSchema),
  Analytics: mongoose.model('Analytics', analyticsSchema),
  Note: mongoose.model('Note', noteSchema),
  Feedback: mongoose.model('Feedback', feedbackSchema),
};
