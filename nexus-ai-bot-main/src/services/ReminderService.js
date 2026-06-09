// src/services/ReminderService.js
const cron = require('node-cron');
const { Reminder } = require('../models');
const logger = require('../utils/logger');

class ReminderService {
  constructor() {
    this.dispatchers = {}; // platform -> send function
  }

  registerDispatcher(platform, fn) {
    this.dispatchers[platform] = fn;
  }

  start() {
    // Check every minute
    cron.schedule('* * * * *', async () => {
      await this._processReminders();
    });
    logger.info('⏰ Reminder service started');
  }

  async _processReminders() {
    const now = new Date();
    const due = await Reminder.find({ sent: false, scheduledAt: { $lte: now } });

    for (const reminder of due) {
      const dispatch = this.dispatchers[reminder.platform];
      if (dispatch) {
        try {
          await dispatch(reminder.chatId, `⏰ **Reminder:** ${reminder.text}`);

          if (reminder.recurring !== 'none') {
            const next = new Date(reminder.scheduledAt);
            if (reminder.recurring === 'daily') next.setDate(next.getDate() + 1);
            else if (reminder.recurring === 'weekly') next.setDate(next.getDate() + 7);
            else if (reminder.recurring === 'monthly') next.setMonth(next.getMonth() + 1);
            await Reminder.updateOne({ _id: reminder._id }, { $set: { scheduledAt: next } });
          } else {
            await Reminder.updateOne({ _id: reminder._id }, { $set: { sent: true } });
          }
        } catch (err) {
          logger.error(`Reminder dispatch error: ${err.message}`);
        }
      }
    }
  }

  async create(userId, platform, chatId, text, scheduledAt, recurring = 'none') {
    return Reminder.create({ userId, platform, chatId, text, scheduledAt, recurring });
  }

  async list(userId) {
    return Reminder.find({ userId, sent: false }).sort({ scheduledAt: 1 });
  }

  async delete(reminderId, userId) {
    return Reminder.deleteOne({ _id: reminderId, userId });
  }

  parseTime(timeStr) {
    // Parse natural language time like "in 5 minutes", "tomorrow 3pm", "5:30pm"
    const now = new Date();
    const lower = timeStr.toLowerCase().trim();

    const inMatch = lower.match(/^in (\d+) (minute|hour|day|week)s?$/);
    if (inMatch) {
      const n = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const d = new Date(now);
      if (unit === 'minute') d.setMinutes(d.getMinutes() + n);
      else if (unit === 'hour') d.setHours(d.getHours() + n);
      else if (unit === 'day') d.setDate(d.getDate() + n);
      else if (unit === 'week') d.setDate(d.getDate() + n * 7);
      return d;
    }

    if (lower.includes('tomorrow')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      if (timeMatch) {
        let h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2] || 0);
        if (timeMatch[3] === 'pm' && h < 12) h += 12;
        if (timeMatch[3] === 'am' && h === 12) h = 0;
        d.setHours(h, m, 0, 0);
      }
      return d;
    }

    const timeMatch = lower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/);
    if (timeMatch) {
      const d = new Date(now);
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2] || 0);
      if (timeMatch[3] === 'pm' && h < 12) h += 12;
      if (timeMatch[3] === 'am' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }

    return null;
  }
}

module.exports = new ReminderService();
