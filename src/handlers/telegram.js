// src/handlers/telegram.js — Full-featured Telegram bot
const { Telegraf, Markup, session } = require('telegraf');
const config = require('../../config');
const aiService = require('../services/AIService');
const contextService = require('../services/ContextService');
const userService = require('../services/UserService');
const reminderService = require('../services/ReminderService');
const { Note, Feedback } = require('../models');
const logger = require('../utils/logger');
const { formatMarkdown, chunkText, escapeMarkdown } = require('../utils/formatter');
const { analyzeImage, generateImage } = require('../utils/imageUtils');
const { transcribeAudio } = require('../utils/audioUtils');
const { extractFileContent } = require('../utils/fileUtils');

class TelegramBot {
  constructor() {
    if (!config.platforms.telegram.token) {
      logger.warn('Telegram token not set — skipping Telegram init');
      return;
    }
    this.bot = new Telegraf(config.platforms.telegram.token);
    this.bot.use(session());
    this._setupMiddleware();
    this._setupCommands();
    this._setupHandlers();
    this._setupCallbacks();
  }

  _setupMiddleware() {
    // Rate limiting & user resolution
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return;
      const userId = `telegram:${ctx.from.id}`;
      try {
        const user = await userService.getOrCreate('telegram', ctx.from.id, {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        });
        ctx.nexusUser = user;
        ctx.userId = userId;
        ctx.chatId = String(ctx.chat?.id || ctx.from.id);

        if (user.isBanned) {
          return ctx.reply('🚫 You have been banned from using this bot.');
        }
      } catch (err) {
        logger.error(`Middleware error: ${err.message}`);
      }
      return next();
    });
  }

  _setupCommands() {
    const { bot } = this;

    // ── /start ──────────────────────────────────────────────
    bot.start(async (ctx) => {
      const user = ctx.nexusUser;
      const name = ctx.from.first_name || 'there';
      const referralCode = user.referralCode;

      await ctx.replyWithMarkdown(
        `🌟 *Welcome to ${config.app.name}, ${name}!*\n\n` +
        `I'm your advanced AI assistant powered by the world's best AI models.\n\n` +
        `*🚀 Quick Start:*\n` +
        `• Just type a message to chat with AI\n` +
        `• Use /model to switch AI providers\n` +
        `• Use /help to see all commands\n\n` +
        `*Your plan:* ${user.plan.toUpperCase()} ✨\n` +
        `*Referral code:* \`${referralCode}\``,
        Markup.keyboard([
          ['💬 Chat', '🤖 Models', '⚙️ Settings'],
          ['📊 Stats', '🆘 Help', '📝 Notes'],
        ]).resize()
      );
    });

    // ── /help ───────────────────────────────────────────────
    bot.command('help', async (ctx) => {
      const helpText = `
*📚 ${config.app.name} Command Reference*

*🤖 AI Commands:*
/model — Switch AI provider & model
/provider — List all available providers  
/persona — Set AI personality
/system — Set custom system prompt
/temp — Adjust temperature (0.0-2.0)
/tokens — Set max tokens

*💬 Conversation:*
/new — Start fresh conversation
/clear — Clear chat history
/history — View past conversations
/summarize — Summarize current chat
/export — Export conversation

*🛠️ Tools:*
/image — Generate AI image
/translate — Translate text
/code — Code assistance mode
/search — Web search
/weather — Weather lookup
/calc — Calculator
/wiki — Wikipedia lookup

*📝 Notes:*
/note — Save a note
/notes — View your notes
/delnote — Delete a note

*⏰ Reminders:*
/remind — Set a reminder
/reminders — List reminders
/delremind — Delete reminder

*📊 Account:*
/stats — Your usage statistics
/plan — Current plan info
/referral — Referral program
/feedback — Send feedback

*⚙️ Settings:*
/settings — Full settings menu
/lang — Set language
/memory — Toggle memory mode
/context — Toggle context mode

*🔞 Admin only:*
/broadcast — Send message to all users
/ban — Ban a user
/unban — Unban a user
/adminpanel — Admin dashboard
      `;
      await ctx.replyWithMarkdown(helpText);
    });

    // ── /model ──────────────────────────────────────────────
    bot.command('model', async (ctx) => {
      const providers = aiService.getAvailableProviders();
      const buttons = providers.map(p => [
        Markup.button.callback(
          `${aiService.isFreeProvider(p) ? '🆓' : '💎'} ${p.toUpperCase()}`,
          `provider:${p}`
        )
      ]);
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);

      await ctx.reply('🤖 *Select AI Provider:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    });

    // ── /persona ─────────────────────────────────────────────
    bot.command('persona', async (ctx) => {
      const personas = ['default', 'assistant', 'teacher', 'coder', 'creative', 'analyst', 'therapist', 'comedian', 'scientist', 'chef'];
      const emojis = { default: '🤖', assistant: '🧑‍💼', teacher: '👨‍🏫', coder: '👨‍💻', creative: '🎨', analyst: '📊', therapist: '🫂', comedian: '😂', scientist: '🔬', chef: '👨‍🍳' };
      const buttons = [];
      for (let i = 0; i < personas.length; i += 2) {
        const row = [Markup.button.callback(`${emojis[personas[i]]} ${personas[i]}`, `persona:${personas[i]}`)];
        if (personas[i + 1]) row.push(Markup.button.callback(`${emojis[personas[i + 1]]} ${personas[i + 1]}`, `persona:${personas[i + 1]}`));
        buttons.push(row);
      }
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);
      await ctx.reply('🎭 *Choose a Persona:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // ── /system ───────────────────────────────────────────────
    bot.command('system', async (ctx) => {
      const prompt = ctx.message.text.replace('/system', '').trim();
      if (!prompt) return ctx.reply('Usage: /system <your custom system prompt>');
      await userService.setSystemPrompt(ctx.userId, prompt);
      await ctx.reply(`✅ System prompt set!\n\n"${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
    });

    // ── /new ─────────────────────────────────────────────────
    bot.command('new', async (ctx) => {
      await contextService.newConversation(ctx.userId, ctx.chatId);
      await ctx.reply('🆕 New conversation started! Previous context cleared.');
    });

    // ── /clear ───────────────────────────────────────────────
    bot.command('clear', async (ctx) => {
      await contextService.clearContext(ctx.userId, ctx.chatId);
      await ctx.reply('🗑️ Conversation history cleared.');
    });

    // ── /summarize ────────────────────────────────────────────
    bot.command('summarize', async (ctx) => {
      const msg = await ctx.reply('📝 Summarizing conversation...');
      const summary = await contextService.summarizeConversation(ctx.userId, ctx.chatId, aiService);
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📊 *Conversation Summary:*\n\n${summary}`, { parse_mode: 'Markdown' });
    });

    // ── /export ───────────────────────────────────────────────
    bot.command('export', async (ctx) => {
      const format = ctx.message.text.includes('json') ? 'json' : 'text';
      const content = await contextService.exportConversation(ctx.userId, ctx.chatId, format);
      if (!content) return ctx.reply('No conversation to export.');

      const filename = `conversation_${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
      await ctx.replyWithDocument({ source: Buffer.from(content), filename });
    });

    // ── /stats ────────────────────────────────────────────────
    bot.command('stats', async (ctx) => {
      const stats = await userService.getStats(ctx.userId);
      if (!stats) return ctx.reply('Could not fetch stats.');

      await ctx.replyWithMarkdown(
        `📊 *Your Statistics*\n\n` +
        `🎯 Plan: *${stats.plan.toUpperCase()}*\n` +
        `💬 Total Messages: *${stats.totalMessages}*\n` +
        `📅 Today: *${stats.dailyMessages}* (${stats.remaining} left)\n` +
        `🔤 Tokens Used: *${stats.totalTokensUsed.toLocaleString()}*\n` +
        `🤖 Provider: *${stats.provider}*\n` +
        `🧠 Model: *${stats.model}*\n` +
        `🎭 Persona: *${stats.persona}*\n` +
        `📆 Member Since: *${new Date(stats.memberSince).toLocaleDateString()}*`
      );
    });

    // ── /translate ────────────────────────────────────────────
    bot.command('translate', async (ctx) => {
      const args = ctx.message.text.replace('/translate', '').trim();
      if (!args) return ctx.reply('Usage: /translate <lang> <text>\nExample: /translate Spanish Hello world!');

      const parts = args.split(' ');
      const targetLang = parts[0];
      const text = parts.slice(1).join(' ');

      if (!text) return ctx.reply('Please provide text to translate.');

      const msg = await ctx.reply('🌐 Translating...');
      const result = await aiService.chat({
        provider: ctx.nexusUser.aiProvider,
        model: ctx.nexusUser.aiModel,
        messages: [
          { role: 'system', content: `Translate the following text to ${targetLang}. Return ONLY the translation, nothing else.` },
          { role: 'user', content: text },
        ],
        maxTokens: 1024,
      });

      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        `🌐 *Translation to ${targetLang}:*\n\n${result.content}`,
        { parse_mode: 'Markdown' }
      );
    });

    // ── /remind ───────────────────────────────────────────────
    bot.command('remind', async (ctx) => {
      const args = ctx.message.text.replace('/remind', '').trim();
      if (!args) return ctx.reply('Usage: /remind <time> <message>\nExample: /remind in 30 minutes Call mom\nOr: /remind tomorrow 9am Team standup');

      // Split time from message: find first word pairs that form a time
      // Simple heuristic: try progressively larger time phrases
      let scheduledAt = null;
      let message = args;
      let timeStr = '';

      for (let words = 4; words >= 1; words--) {
        const parts = args.split(' ');
        if (parts.length > words) {
          timeStr = parts.slice(0, words).join(' ');
          const parsed = reminderService.parseTime(timeStr);
          if (parsed) {
            scheduledAt = parsed;
            message = parts.slice(words).join(' ');
            break;
          }
        }
      }

      if (!scheduledAt) return ctx.reply('❌ Could not parse time. Try: "in 30 minutes", "tomorrow 9am", "in 2 hours"');
      if (!message) return ctx.reply('❌ Please provide a reminder message.');

      await reminderService.create(ctx.userId, 'telegram', ctx.chatId, message, scheduledAt);
      await ctx.replyWithMarkdown(`⏰ *Reminder set!*\n\n📝 ${message}\n🕐 ${scheduledAt.toLocaleString()}`);
    });

    // ── /reminders ────────────────────────────────────────────
    bot.command('reminders', async (ctx) => {
      const reminders = await reminderService.list(ctx.userId);
      if (!reminders.length) return ctx.reply('No upcoming reminders. Use /remind to set one!');

      let text = '⏰ *Your Reminders:*\n\n';
      reminders.forEach((r, i) => {
        text += `${i + 1}. ${r.text}\n   🕐 ${new Date(r.scheduledAt).toLocaleString()}\n   🔁 ${r.recurring}\n\n`;
      });
      await ctx.replyWithMarkdown(text);
    });

    // ── /note ─────────────────────────────────────────────────
    bot.command('note', async (ctx) => {
      const content = ctx.message.text.replace('/note', '').trim();
      if (!content) return ctx.reply('Usage: /note <your note text>');
      await Note.create({ userId: ctx.userId, content });
      await ctx.reply('📝 Note saved!');
    });

    // ── /notes ────────────────────────────────────────────────
    bot.command('notes', async (ctx) => {
      const notes = await Note.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(10);
      if (!notes.length) return ctx.reply('No notes saved. Use /note to save one!');

      let text = '📝 *Your Notes:*\n\n';
      notes.forEach((n, i) => {
        text += `${i + 1}. ${n.content.slice(0, 100)}${n.content.length > 100 ? '...' : ''}\n   _${new Date(n.createdAt).toLocaleDateString()}_\n\n`;
      });
      await ctx.replyWithMarkdown(text);
    });

    // ── /image ────────────────────────────────────────────────
    bot.command('image', async (ctx) => {
      const prompt = ctx.message.text.replace('/image', '').trim();
      if (!prompt) return ctx.reply('Usage: /image <description>\nExample: /image a beautiful sunset over mountains');

      const msg = await ctx.reply('🎨 Generating image...');
      try {
        const imageBuffer = await generateImage(prompt);
        await ctx.replyWithPhoto({ source: imageBuffer }, { caption: `🎨 "${prompt}"` });
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
      } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Image generation failed: ${err.message}`);
      }
    });

    // ── /temp ─────────────────────────────────────────────────
    bot.command('temp', async (ctx) => {
      const val = parseFloat(ctx.message.text.replace('/temp', '').trim());
      if (isNaN(val) || val < 0 || val > 2) return ctx.reply('Usage: /temp <0.0-2.0>\n0=focused, 1=balanced, 2=creative');
      await userService.update(ctx.userId, { temperature: val });
      await ctx.reply(`🌡️ Temperature set to ${val}`);
    });

    // ── /feedback ─────────────────────────────────────────────
    bot.command('feedback', async (ctx) => {
      const content = ctx.message.text.replace('/feedback', '').trim();
      if (!content) return ctx.reply('Usage: /feedback <your message>');
      await Feedback.create({ userId: ctx.userId, platform: 'telegram', type: 'general', content });
      await ctx.reply('✅ Feedback sent! Thank you for helping improve the bot.');
    });

    // ── /referral ─────────────────────────────────────────────
    bot.command('referral', async (ctx) => {
      const user = ctx.nexusUser;
      const botInfo = await ctx.telegram.getMe();
      await ctx.replyWithMarkdown(
        `🎁 *Referral Program*\n\n` +
        `Your code: \`${user.referralCode}\`\n` +
        `Referrals: ${user.referralCount}\n\n` +
        `Share this link:\n` +
        `https://t.me/${botInfo.username}?start=ref_${user.referralCode}\n\n` +
        `_Earn bonus messages for each friend who joins!_`
      );
    });

    // ── /settings ─────────────────────────────────────────────
    bot.command('settings', async (ctx) => {
      const user = ctx.nexusUser;
      await ctx.reply(`⚙️ *Settings*\n\nCurrent config:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`🤖 Provider: ${user.aiProvider}`, 'settings:provider')],
          [Markup.button.callback(`🧠 Model: ${user.aiModel}`, 'settings:model')],
          [Markup.button.callback(`🎭 Persona: ${user.persona}`, 'settings:persona')],
          [Markup.button.callback(`🌡️ Temp: ${user.temperature}`, 'settings:temperature')],
          [Markup.button.callback(`💬 Context: ${user.contextEnabled ? '✅ ON' : '❌ OFF'}`, 'settings:context')],
          [Markup.button.callback(`🧠 Memory: ${user.memoryEnabled ? '✅ ON' : '❌ OFF'}`, 'settings:memory')],
          [Markup.button.callback(`📢 Notifications: ${user.notifications?.enabled ? '✅' : '❌'}`, 'settings:notifications')],
          [Markup.button.callback('❌ Close', 'cancel')],
        ]),
      });
    });

    // ── Admin: /broadcast ──────────────────────────────────────
    bot.command('broadcast', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const text = ctx.message.text.replace('/broadcast', '').trim();
      if (!text) return ctx.reply('Usage: /broadcast <message>');

      const users = await userService.getAllUsers(1000);
      let sent = 0, failed = 0;

      for (const user of users) {
        const [, id] = user.userId.split(':');
        try {
          await ctx.telegram.sendMessage(id, `📢 *Announcement:*\n\n${text}`, { parse_mode: 'Markdown' });
          sent++;
        } catch { failed++; }
      }

      await ctx.reply(`📢 Broadcast complete!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
    });

    // ── Admin: /ban ───────────────────────────────────────────
    bot.command('ban', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const args = ctx.message.text.replace('/ban', '').trim().split(' ');
      const targetId = args[0];
      const reason = args.slice(1).join(' ') || 'No reason given';
      await userService.ban(`telegram:${targetId}`, reason);
      await ctx.reply(`✅ User ${targetId} banned. Reason: ${reason}`);
    });
  }

  _setupHandlers() {
    const { bot } = this;

    // Photo handler — vision
    bot.on('photo', async (ctx) => {
      const user = ctx.nexusUser;
      if (!user.canSendMessage(config.limits)) {
        return ctx.reply('⚠️ Daily limit reached. Upgrade to Pro for more!');
      }

      const msg = await ctx.reply('👁️ Analyzing image...');
      try {
        const photo = ctx.message.photo.pop();
        const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
        const caption = ctx.message.caption || 'What do you see in this image? Describe it in detail.';

        const result = await analyzeImage(fileUrl.href, caption, user.aiProvider, user.aiModel);
        await userService.incrementUsage(ctx.userId);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `👁️ *Image Analysis:*\n\n${result}`, { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Error: ${err.message}`);
      }
    });

    // Voice handler — transcription
    bot.on('voice', async (ctx) => {
      const msg = await ctx.reply('🎤 Transcribing audio...');
      try {
        const fileUrl = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const transcript = await transcribeAudio(fileUrl.href);
        if (!transcript) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '❌ Could not transcribe audio.');

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `🎤 *Transcription:*\n${transcript}`);
        // Process as regular message
        await this._processMessage(ctx, transcript, ctx.nexusUser);
      } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Audio error: ${err.message}`);
      }
    });

    // Document handler — file analysis
    bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      const allowedTypes = ['text/plain', 'application/pdf', 'application/json', 'text/csv', 'application/msword'];
      if (!allowedTypes.includes(doc.mime_type) && !doc.file_name?.match(/\.(txt|pdf|json|csv|md|js|py|ts)$/)) {
        return ctx.reply('⚠️ Unsupported file type. Supported: txt, pdf, json, csv, md, code files.');
      }

      const msg = await ctx.reply('📄 Reading file...');
      try {
        const fileUrl = await ctx.telegram.getFileLink(doc.file_id);
        const content = await extractFileContent(fileUrl.href, doc.mime_type, doc.file_name);
        const caption = ctx.message.caption || 'Analyze this file and provide a comprehensive summary.';

        const result = await aiService.chat({
          provider: ctx.nexusUser.aiProvider,
          model: ctx.nexusUser.aiModel,
          messages: [
            { role: 'system', content: 'You are analyzing a file. Be thorough and helpful.' },
            { role: 'user', content: `File: ${doc.file_name}\n\nContent:\n${content.slice(0, 8000)}\n\nUser request: ${caption}` },
          ],
          maxTokens: ctx.nexusUser.maxTokens,
        });

        await userService.incrementUsage(ctx.userId);
        const chunks = chunkText(result.content, 4000);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📄 *File Analysis:*\n\n${chunks[0]}`, { parse_mode: 'Markdown' });
        for (let i = 1; i < chunks.length; i++) await ctx.reply(chunks[i], { parse_mode: 'Markdown' });
      } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ Error: ${err.message}`);
      }
    });

    // Main text handler
    bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) return;

      // Keyboard shortcuts
      if (text === '💬 Chat') return ctx.reply('Just type your message to start chatting!');
      if (text === '🤖 Models') return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/model' } });
      if (text === '⚙️ Settings') return ctx.scene?.enter?.('settings') || ctx.reply('Use /settings for full options.');
      if (text === '📊 Stats') return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/stats' } });
      if (text === '🆘 Help') return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/help' } });
      if (text === '📝 Notes') return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, text: '/notes' } });

      await this._processMessage(ctx, text, ctx.nexusUser);
    });
  }

  async _processMessage(ctx, text, user) {
    if (!user.canSendMessage(config.limits)) {
      return ctx.reply(
        `⚠️ Daily limit reached (${user.plan === 'free' ? config.limits.freeDailyMessages : config.limits.proDailyMessages} messages).\n\n` +
        `${user.plan === 'free' ? '🚀 Upgrade to Pro for 1000 daily messages!' : 'Limit resets tomorrow.'}`
      );
    }

    // Typing indicator
    await ctx.sendChatAction('typing');

    try {
      // Build system prompt
      let systemPrompt = user.systemPrompt || '';
      if (user.memoryEnabled && user.userMemory?.length) {
        systemPrompt += `\n\nUser memories/preferences:\n${user.userMemory.join('\n')}`;
      }

      // Get context
      const messages = user.contextEnabled
        ? await contextService.getMessages(ctx.userId, ctx.chatId, systemPrompt)
        : (systemPrompt ? [{ role: 'system', content: systemPrompt }] : []);

      messages.push({ role: 'user', content: text });

      // Send with typing animation via stream
      let responseText = '';
      let sentMsg = null;
      let lastUpdate = 0;

      const onToken = async (token) => {
        responseText += token;
        const now = Date.now();
        if (now - lastUpdate > 1000) { // Update every 1s to avoid flood
          lastUpdate = now;
          if (!sentMsg) {
            sentMsg = await ctx.reply(responseText + '▌', { parse_mode: 'Markdown' }).catch(() => ctx.reply(responseText + '▌'));
          } else {
            await ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, responseText + '▌', { parse_mode: 'Markdown' }).catch(() => {});
          }
        }
      };

      const result = await aiService.chat({
        provider: user.aiProvider,
        model: user.aiModel,
        messages,
        maxTokens: user.maxTokens,
        temperature: user.temperature,
        stream: true,
        onToken,
      });

      const finalText = result.content || responseText;

      // Final message (remove cursor)
      if (sentMsg) {
        const chunks = chunkText(finalText, 4096);
        await ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, chunks[0], { parse_mode: 'Markdown' })
          .catch(() => ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, chunks[0]));
        for (let i = 1; i < chunks.length; i++) {
          await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunks[i]));
        }
      } else {
        const chunks = chunkText(finalText, 4096);
        await ctx.reply(chunks[0], { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunks[0]));
        for (let i = 1; i < chunks.length; i++) await ctx.reply(chunks[i]);
      }

      // Save context
      if (user.contextEnabled) {
        await contextService.addMessage(ctx.userId, ctx.chatId, 'user', text);
        await contextService.addMessage(ctx.userId, ctx.chatId, 'assistant', finalText, {
          provider: user.aiProvider, model: user.aiModel, tokensUsed: result.tokensUsed,
        });
      }

      await userService.incrementUsage(ctx.userId, result.tokensUsed || 0);

    } catch (err) {
      logger.error(`Message processing error: ${err.message}`);
      await ctx.reply(`❌ ${err.message}`);
    }
  }

  _setupCallbacks() {
    const { bot } = this;

    bot.action('cancel', ctx => ctx.deleteMessage().catch(() => {}));

    // Provider selection
    bot.action(/^provider:(.+)$/, async (ctx) => {
      const provider = ctx.match[1];
      const models = aiService.getModelsForProvider(provider);
      if (!models.length) return ctx.answerCbQuery('Provider not available');

      const buttons = models.map(m => [Markup.button.callback(m, `model:${provider}:${m}`)]);
      buttons.push([Markup.button.callback('⬅️ Back', 'back:provider')]);

      await ctx.editMessageText(`🧠 *Select Model for ${provider.toUpperCase()}:*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
      await ctx.answerCbQuery();
    });

    // Model selection
    bot.action(/^model:(.+):(.+)$/, async (ctx) => {
      const provider = ctx.match[1];
      const model = ctx.match[2];
      await userService.setProvider(ctx.userId, provider, model);
      await ctx.editMessageText(`✅ *Switched to ${provider.toUpperCase()} / ${model}*`, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('Model updated!');
    });

    // Persona selection
    bot.action(/^persona:(.+)$/, async (ctx) => {
      const persona = ctx.match[1];
      await userService.setPersona(ctx.userId, persona);
      await ctx.editMessageText(`✅ *Persona set to: ${persona}*\n\nI'll behave as a ${persona} from now on.`, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('Persona updated!');
    });

    // Settings toggles
    bot.action('settings:context', async (ctx) => {
      const user = await userService.get(ctx.userId);
      await userService.update(ctx.userId, { contextEnabled: !user.contextEnabled });
      await ctx.answerCbQuery(`Context ${!user.contextEnabled ? 'enabled' : 'disabled'}`);
      bot.handleUpdate({ ...ctx.update, callback_query: { ...ctx.callbackQuery, data: 'settings_refresh' } });
    });

    bot.action('settings:memory', async (ctx) => {
      const user = await userService.get(ctx.userId);
      await userService.update(ctx.userId, { memoryEnabled: !user.memoryEnabled });
      await ctx.answerCbQuery(`Memory ${!user.memoryEnabled ? 'enabled' : 'disabled'}`);
    });
  }

  registerReminderDispatcher() {
    reminderService.registerDispatcher('telegram', async (chatId, text) => {
      await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    });
  }

  async launch() {
    if (!this.bot) return;
    this.registerReminderDispatcher();

    // Set commands list for Telegram menu
    await this.bot.telegram.setMyCommands([
      { command: 'start', description: '🌟 Start the bot' },
      { command: 'help', description: '📚 Show all commands' },
      { command: 'model', description: '🤖 Switch AI model' },
      { command: 'persona', description: '🎭 Set AI persona' },
      { command: 'new', description: '🆕 New conversation' },
      { command: 'clear', description: '🗑️ Clear history' },
      { command: 'stats', description: '📊 Your stats' },
      { command: 'remind', description: '⏰ Set reminder' },
      { command: 'translate', description: '🌐 Translate text' },
      { command: 'image', description: '🎨 Generate image' },
      { command: 'note', description: '📝 Save note' },
      { command: 'settings', description: '⚙️ Settings' },
    ]);

    this.bot.launch();
    logger.info('🤖 Telegram bot launched');

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = new TelegramBot();
