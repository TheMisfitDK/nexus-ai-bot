// src/handlers/telegram.js — NexusAI v3 Telegram Bot
// Owner: TheMisfitDK — github.com/TheMisfitDK
const { Telegraf, Markup, session } = require('telegraf');
const config = require('../../config');
const aiService = require('../services/AIService');
const imageService = require('../services/ImageService');
const contextService = require('../services/ContextService');
const userService = require('../services/UserService');
const reminderService = require('../services/ReminderService');
const { Note, Feedback } = require('../models');
const logger = require('../utils/logger');
const { chunkText } = require('../utils/formatter');
const { analyzeImage } = require('../utils/imageUtils');
const { transcribeAudio } = require('../utils/audioUtils');
const { extractFileContent } = require('../utils/fileUtils');

class TelegramBot {
  constructor() {
    if (!config.platforms.telegram.token) {
      logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram disabled');
      return;
    }
    this.bot = new Telegraf(config.platforms.telegram.token);
    this.bot.use(session({ defaultSession: () => ({}) }));
    this._setupMiddleware();
    this._setupCommands();
    this._setupHandlers();
    this._setupCallbacks();
  }

  _setupMiddleware() {
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return next();
      try {
        const user = await userService.getOrCreate('telegram', String(ctx.from.id), {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        });
        ctx.nexusUser = user;
        ctx.userId = `telegram:${ctx.from.id}`;
        ctx.chatId = String(ctx.chat?.id || ctx.from.id);
        if (user.isBanned) return ctx.reply('🚫 You are banned from using this bot.');
      } catch (err) {
        logger.error(`Middleware: ${err.message}`);
      }
      return next();
    });
  }

  _setupCommands() {
    const { bot } = this;

    // /start
    bot.start(async (ctx) => {
      const u = ctx.nexusUser;
      const name = ctx.from.first_name || 'there';

      // Handle referral
      const startParam = ctx.startPayload;
      if (startParam?.startsWith('ref_') && !u.referredBy) {
        const refCode = startParam.replace('ref_', '');
        await userService.update(ctx.userId, { referredBy: refCode });
        const referrer = await userService.findByReferralCode(refCode);
        if (referrer) await userService.incrementReferral(referrer.userId);
      }

      await ctx.replyWithMarkdown(
        `⚡ *Welcome to ${config.app.name}, ${name}!*\n\n` +
        `I'm your AI assistant powered by ${aiService.getAvailableProviders().length}+ AI models.\n\n` +
        `*Current provider:* \`${u.aiProvider}/${u.aiModel}\`\n` +
        `*Plan:* ${u.plan.toUpperCase()} | *Daily left:* ${u.getRemainingMessages(config.limits)}\n\n` +
        `Just send a message to start chatting!\n` +
        `Use /help to see all commands.`,
        Markup.keyboard([
          ['💬 New Chat', '🤖 Models', '🎨 Image'],
          ['📊 Stats', '⚙️ Settings', '🆘 Help'],
        ]).resize()
      );
    });

    // /help
    bot.command(['help', 'h'], async (ctx) => {
      await ctx.replyWithMarkdown(
        `*📚 ${config.app.name} Commands*\n\n` +
        `*🤖 AI:*\n` +
        `/model — Switch AI provider & model\n` +
        `/persona — Set AI personality\n` +
        `/system \\<prompt\\> — Custom system prompt\n` +
        `/temp \\<0\\.0\\-2\\.0\\> — Adjust temperature\n` +
        `/tokens \\<num\\> — Set max tokens\n\n` +
        `*💬 Chat:*\n` +
        `/new — Fresh conversation\n` +
        `/clear — Clear history\n` +
        `/history — Past conversations\n` +
        `/summarize — Summarize chat\n` +
        `/export — Export as file\n\n` +
        `*🛠️ Tools:*\n` +
        `/image \\<prompt\\> — Generate image\n` +
        `/imgprovider — Switch image provider\n` +
        `/translate \\<lang\\> \\<text\\> — Translate\n` +
        `/remind \\<time\\> \\<msg\\> — Set reminder\n` +
        `/reminders — List reminders\n\n` +
        `*📝 Notes:*\n` +
        `/note \\<text\\> — Save note\n` +
        `/notes — View notes\n\n` +
        `*📊 Account:*\n` +
        `/stats — Your usage stats\n` +
        `/plan — Plan info\n` +
        `/referral — Referral link\n` +
        `/feedback \\<text\\> — Send feedback\n\n` +
        `*Send photos* for vision analysis\n` +
        `*Send voice* for transcription\n` +
        `*Send files* \\(PDF/DOCX/TXT\\) for analysis`,
        { parse_mode: 'MarkdownV2' }
      ).catch(() => ctx.reply('Use /model /persona /system /temp /new /clear /summarize /export /image /translate /remind /reminders /note /notes /stats /referral /feedback'));
    });

    // /model
    bot.command('model', async (ctx) => {
      const providers = aiService.getAvailableProviders();
      if (!providers.length) return ctx.reply('❌ No AI providers configured. Add API keys to env vars.');
      const buttons = providers.map(p => [
        Markup.button.callback(
          `${aiService.isFreeProvider(p) ? '🆓' : '💎'} ${p.toUpperCase()}`,
          `prov:${p}`
        )
      ]);
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);
      await ctx.reply('🤖 *Select AI Provider:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    });

    // /persona
    bot.command('persona', async (ctx) => {
      const personas = [
        ['🤖 Default', 'default'], ['🧑‍💼 Assistant', 'assistant'],
        ['👨‍🏫 Teacher', 'teacher'], ['👨‍💻 Coder', 'coder'],
        ['🎨 Creative', 'creative'], ['📊 Analyst', 'analyst'],
        ['🫂 Therapist', 'therapist'], ['😂 Comedian', 'comedian'],
        ['🔬 Scientist', 'scientist'], ['👨‍🍳 Chef', 'chef'],
        ['⚖️ Lawyer', 'lawyer'], ['💰 Finance', 'finance'],
      ];
      const buttons = [];
      for (let i = 0; i < personas.length; i += 2) {
        const row = [Markup.button.callback(personas[i][0], `persona:${personas[i][1]}`)];
        if (personas[i + 1]) row.push(Markup.button.callback(personas[i + 1][0], `persona:${personas[i + 1][1]}`));
        buttons.push(row);
      }
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);
      await ctx.reply('🎭 *Choose AI Persona:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // /system
    bot.command('system', async (ctx) => {
      const prompt = ctx.message.text.slice('/system'.length).trim();
      if (!prompt) return ctx.reply('Usage: /system <your system prompt>\nExample: /system You are a pirate who speaks in pirate tongue.');
      await userService.setSystemPrompt(ctx.userId, prompt);
      await ctx.reply(`✅ System prompt set!\n\n"${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}"`);
    });

    // /temp
    bot.command('temp', async (ctx) => {
      const val = parseFloat(ctx.message.text.slice('/temp'.length).trim());
      if (isNaN(val) || val < 0 || val > 2) return ctx.reply('Usage: /temp <0.0-2.0>\n• 0.0 = deterministic\n• 0.7 = balanced\n• 2.0 = very creative');
      await userService.update(ctx.userId, { temperature: val });
      await ctx.reply(`🌡️ Temperature set to ${val}`);
    });

    // /tokens
    bot.command('tokens', async (ctx) => {
      const val = parseInt(ctx.message.text.slice('/tokens'.length).trim());
      if (isNaN(val) || val < 100 || val > 8000) return ctx.reply('Usage: /tokens <100-8000>');
      await userService.update(ctx.userId, { maxTokens: val });
      await ctx.reply(`🔢 Max tokens set to ${val}`);
    });

    // /new
    bot.command('new', async (ctx) => {
      await contextService.newConversation(ctx.userId, ctx.chatId);
      await ctx.reply('🆕 New conversation started! Previous context cleared.');
    });

    // /clear
    bot.command('clear', async (ctx) => {
      await contextService.clearContext(ctx.userId, ctx.chatId);
      await ctx.reply('🗑️ Conversation history cleared.');
    });

    // /summarize
    bot.command('summarize', async (ctx) => {
      const msg = await ctx.reply('📝 Summarizing...');
      try {
        const summary = await contextService.summarizeConversation(ctx.userId, ctx.chatId, aiService);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
          `📊 *Summary:*\n\n${summary}`, { parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${e.message}`);
      }
    });

    // /export
    bot.command('export', async (ctx) => {
      const format = ctx.message.text.includes('json') ? 'json' : 'text';
      const content = await contextService.exportConversation(ctx.userId, ctx.chatId, format);
      if (!content) return ctx.reply('No conversation to export.');
      await ctx.replyWithDocument({
        source: Buffer.from(content),
        filename: `chat_${Date.now()}.${format === 'json' ? 'json' : 'md'}`,
      });
    });

    // /image
    bot.command(['image', 'img', 'imagine'], async (ctx) => {
      const prompt = ctx.message.text.replace(/^\/(image|img|imagine)\s*/i, '').trim();
      if (!prompt) return ctx.reply('Usage: /image <description>\nExample: /image a neon cyberpunk city at night, rain, cinematic');

      const providers = imageService.getAvailableProviders();
      if (!providers.length) return ctx.reply('❌ No image generation provider configured.\nAdd one of: STABILITY_API_KEY, OPENAI_API_KEY, HUGGINGFACE_API_KEY, TOGETHER_API_KEY to env vars.');

      const msg = await ctx.reply(`🎨 Generating image...\n_Provider: ${providers[0]}_`, { parse_mode: 'Markdown' });
      try {
        const result = await imageService.generate(prompt, ctx.nexusUser.imageProvider);
        await ctx.replyWithPhoto(
          { source: result.buffer },
          { caption: `🎨 *${prompt.slice(0, 200)}*\n\n_via ${result.provider}_`, parse_mode: 'Markdown' }
        );
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
      } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${err.message}`);
      }
    });

    // /imgprovider
    bot.command('imgprovider', async (ctx) => {
      const providers = imageService.getAvailableProviders();
      if (!providers.length) return ctx.reply('❌ No image providers configured.');
      const buttons = providers.map(p => [Markup.button.callback(p.toUpperCase(), `imgprov:${p}`)]);
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);
      await ctx.reply('🎨 *Select Image Provider:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // /translate
    bot.command('translate', async (ctx) => {
      const args = ctx.message.text.slice('/translate'.length).trim();
      if (!args) return ctx.reply('Usage: /translate <language> <text>\nExample: /translate Spanish Hello, how are you?');
      const parts = args.split(' ');
      const lang = parts[0];
      const text = parts.slice(1).join(' ');
      if (!text) return ctx.reply('Please provide text to translate.\nExample: /translate French Good morning!');

      const msg = await ctx.reply('🌐 Translating...');
      try {
        const result = await aiService.chat({
          provider: ctx.nexusUser.aiProvider,
          model: ctx.nexusUser.aiModel,
          messages: [
            { role: 'system', content: `Translate the following text to ${lang}. Return ONLY the translation, nothing else.` },
            { role: 'user', content: text },
          ],
          maxTokens: 1024,
        });
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
          `🌐 *Translation → ${lang}:*\n\n${result.content}`, { parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${e.message}`);
      }
    });

    // /remind
    bot.command('remind', async (ctx) => {
      const args = ctx.message.text.slice('/remind'.length).trim();
      if (!args) return ctx.reply(
        '⏰ Usage: /remind <time> <message>\n\n' +
        'Examples:\n' +
        '• /remind in 30 minutes Call mom\n' +
        '• /remind in 2 hours Meeting\n' +
        '• /remind tomorrow 9am Standup\n' +
        '• /remind in 1 day Submit report'
      );

      let scheduledAt = null, message = args;
      for (let words = 5; words >= 1; words--) {
        const parts = args.split(' ');
        if (parts.length > words) {
          const timeStr = parts.slice(0, words).join(' ');
          const parsed = reminderService.parseTime(timeStr);
          if (parsed) {
            scheduledAt = parsed;
            message = parts.slice(words).join(' ');
            break;
          }
        }
      }
      if (!scheduledAt) return ctx.reply('❌ Could not parse time.\nTry: "in 30 minutes", "in 2 hours", "tomorrow 9am"');
      if (!message.trim()) return ctx.reply('❌ Please provide a reminder message after the time.');

      await reminderService.create(ctx.userId, 'telegram', ctx.chatId, message, scheduledAt);
      await ctx.replyWithMarkdown(`✅ *Reminder set!*\n\n📝 ${message}\n🕐 ${scheduledAt.toLocaleString()}`);
    });

    // /reminders
    bot.command('reminders', async (ctx) => {
      const reminders = await reminderService.list(ctx.userId);
      if (!reminders.length) return ctx.reply('No upcoming reminders.\nUse /remind to set one!');
      let text = '⏰ *Your Reminders:*\n\n';
      reminders.forEach((r, i) => {
        text += `*${i + 1}.* ${r.text}\n🕐 ${new Date(r.scheduledAt).toLocaleString()}\n\n`;
      });
      await ctx.replyWithMarkdown(text);
    });

    // /note
    bot.command('note', async (ctx) => {
      const content = ctx.message.text.slice('/note'.length).trim();
      if (!content) return ctx.reply('Usage: /note <your note text>');
      await Note.create({ userId: ctx.userId, content });
      await ctx.reply('📝 Note saved!');
    });

    // /notes
    bot.command('notes', async (ctx) => {
      const notes = await Note.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(10);
      if (!notes.length) return ctx.reply('No notes saved.\nUse /note <text> to save one.');
      let text = '📝 *Your Notes:*\n\n';
      notes.forEach((n, i) => {
        text += `*${i + 1}.* ${n.content.slice(0, 150)}${n.content.length > 150 ? '...' : ''}\n_${new Date(n.createdAt).toLocaleDateString()}_\n\n`;
      });
      await ctx.replyWithMarkdown(text);
    });

    // /stats
    bot.command('stats', async (ctx) => {
      const stats = await userService.getStats(ctx.userId);
      if (!stats) return ctx.reply('Could not load stats.');
      const imgProviders = imageService.getAvailableProviders();
      await ctx.replyWithMarkdown(
        `📊 *Your Statistics*\n\n` +
        `🎯 Plan: *${stats.plan.toUpperCase()}*\n` +
        `💬 Total Messages: *${stats.totalMessages.toLocaleString()}*\n` +
        `📅 Today: *${stats.dailyMessages}* \\(${stats.remaining} remaining\\)\n` +
        `🔤 Tokens Used: *${stats.totalTokensUsed.toLocaleString()}*\n\n` +
        `🤖 AI: *${stats.provider}/${stats.model}*\n` +
        `🎭 Persona: *${stats.persona}*\n` +
        `🌡️ Temperature: *${stats.temperature || 0.7}*\n\n` +
        `🎨 Image providers: *${imgProviders.length > 0 ? imgProviders.join(', ') : 'none'}*\n` +
        `📆 Member since: *${new Date(stats.memberSince).toLocaleDateString()}*`
      ).catch(() => ctx.reply(`Stats: ${JSON.stringify(stats, null, 2)}`));
    });

    // /plan
    bot.command('plan', async (ctx) => {
      const u = ctx.nexusUser;
      const limit = u.plan === 'free' ? config.limits.freeDailyMessages : config.limits.proDailyMessages;
      await ctx.replyWithMarkdown(
        `💎 *Your Plan: ${u.plan.toUpperCase()}*\n\n` +
        `📅 Daily limit: ${limit} messages\n` +
        `✅ Used today: ${u.dailyMessages}\n` +
        `🔄 Resets: midnight\n\n` +
        (u.plan === 'free' ? `_Upgrade to Pro for ${config.limits.proDailyMessages} daily messages!_` : `_Pro active${u.planExpiresAt ? ` until ${new Date(u.planExpiresAt).toLocaleDateString()}` : ''}_`)
      );
    });

    // /referral
    bot.command('referral', async (ctx) => {
      const u = ctx.nexusUser;
      const botInfo = await ctx.telegram.getMe();
      await ctx.replyWithMarkdown(
        `🎁 *Referral Program*\n\n` +
        `Your code: \`${u.referralCode}\`\n` +
        `Total referrals: *${u.referralCount || 0}*\n\n` +
        `Share link:\n\`https://t.me/${botInfo.username}?start=ref_${u.referralCode}\``
      );
    });

    // /feedback
    bot.command('feedback', async (ctx) => {
      const content = ctx.message.text.slice('/feedback'.length).trim();
      if (!content) return ctx.reply('Usage: /feedback <your message>');
      await Feedback.create({ userId: ctx.userId, platform: 'telegram', type: 'general', content });
      await ctx.reply('✅ Feedback sent! Thank you.');
    });

    // /settings
    bot.command('settings', async (ctx) => {
      const u = ctx.nexusUser;
      await ctx.reply('⚙️ *Settings*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`🤖 Provider: ${u.aiProvider}`, 'settings:provider')],
          [Markup.button.callback(`🧠 Model: ${u.aiModel}`, 'settings:provider')],
          [Markup.button.callback(`🎭 Persona: ${u.persona}`, 'settings:persona')],
          [Markup.button.callback(`🌡️ Temp: ${u.temperature || 0.7}`, 'settings:temp')],
          [Markup.button.callback(`💬 Context: ${u.contextEnabled !== false ? '✅ ON' : '❌ OFF'}`, 'toggle:context')],
          [Markup.button.callback(`🧠 Memory: ${u.memoryEnabled ? '✅ ON' : '❌ OFF'}`, 'toggle:memory')],
          [Markup.button.callback('❌ Close', 'cancel')],
        ]),
      });
    });

    // /history
    bot.command('history', async (ctx) => {
      const history = await contextService.getHistory(ctx.userId, 5);
      if (!history.length) return ctx.reply('No conversation history yet.');
      let text = '📜 *Recent Conversations:*\n\n';
      history.forEach((h, i) => {
        text += `*${i + 1}.* ${h.messages?.length || 0} messages — ${new Date(h.updatedAt).toLocaleDateString()}\n`;
      });
      await ctx.replyWithMarkdown(text);
    });

    // Admin: /broadcast
    bot.command('broadcast', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const text = ctx.message.text.slice('/broadcast'.length).trim();
      if (!text) return ctx.reply('Usage: /broadcast <message>');
      const users = await userService.getAllUsers(2000);
      let sent = 0, failed = 0;
      for (const u of users) {
        const [, id] = u.userId.split(':');
        try {
          await ctx.telegram.sendMessage(id, `📢 *Announcement:*\n\n${text}`, { parse_mode: 'Markdown' });
          sent++;
          await new Promise(r => setTimeout(r, 50)); // rate limit
        } catch { failed++; }
      }
      await ctx.reply(`📢 Done!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
    });

    // Admin: /ban
    bot.command('ban', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const args = ctx.message.text.slice('/ban'.length).trim().split(' ');
      await userService.ban(`telegram:${args[0]}`, args.slice(1).join(' ') || 'Banned by admin');
      await ctx.reply(`✅ Banned: ${args[0]}`);
    });

    // Admin: /unban
    bot.command('unban', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const id = ctx.message.text.slice('/unban'.length).trim();
      await userService.unban(`telegram:${id}`);
      await ctx.reply(`✅ Unbanned: ${id}`);
    });

    // Admin: /grantpro
    bot.command('grantpro', async (ctx) => {
      if (String(ctx.from.id) !== config.app.ownerIdTelegram) return;
      const args = ctx.message.text.slice('/grantpro'.length).trim().split(' ');
      const days = parseInt(args[1]) || 30;
      await userService.upgradeToPro(`telegram:${args[0]}`, days);
      await ctx.reply(`✅ Upgraded ${args[0]} to Pro for ${days} days`);
    });
  }

  _setupHandlers() {
    const { bot } = this;

    // Photo
    bot.on('photo', async (ctx) => {
      if (!ctx.nexusUser.canSendMessage(config.limits)) return ctx.reply('⚠️ Daily limit reached.');
      const msg = await ctx.reply('👁️ Analyzing image...');
      try {
        const photo = ctx.message.photo.pop();
        const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
        const caption = ctx.message.caption || 'Describe this image in detail.';
        const result = await analyzeImage(fileUrl.href, caption, ctx.nexusUser.aiProvider, ctx.nexusUser.aiModel);
        await userService.incrementUsage(ctx.userId);
        const chunks = chunkText(result, 4000);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `👁️ *Image Analysis:*\n\n${chunks[0]}`, { parse_mode: 'Markdown' })
          .catch(() => ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `👁️ Image Analysis:\n\n${chunks[0]}`));
        for (let i = 1; i < chunks.length; i++) await ctx.reply(chunks[i]);
      } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${e.message}`);
      }
    });

    // Voice
    bot.on('voice', async (ctx) => {
      if (!ctx.nexusUser.canSendMessage(config.limits)) return ctx.reply('⚠️ Daily limit reached.');
      const msg = await ctx.reply('🎤 Transcribing...');
      try {
        const fileUrl = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const transcript = await transcribeAudio(fileUrl.href);
        if (!transcript) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '❌ Could not transcribe.');
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `🎤 *Transcription:*\n${transcript}`, { parse_mode: 'Markdown' });
        await this._processMessage(ctx, transcript, ctx.nexusUser);
      } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${e.message}`);
      }
    });

    // Document
    bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      const allowed = ['text/', 'application/pdf', 'application/json', 'application/msword', 'application/vnd.openxmlformats'];
      const isAllowed = allowed.some(t => doc.mime_type?.startsWith(t)) ||
        /\.(txt|pdf|json|csv|md|js|py|ts|java|cpp|c|go|rs|html|css)$/i.test(doc.file_name || '');
      if (!isAllowed) return ctx.reply('⚠️ Unsupported file type. Send: txt, pdf, json, csv, md, or code files.');

      const msg = await ctx.reply('📄 Reading file...');
      try {
        const fileUrl = await ctx.telegram.getFileLink(doc.file_id);
        const content = await extractFileContent(fileUrl.href, doc.mime_type, doc.file_name);
        const caption = ctx.message.caption || 'Analyze this file and give a comprehensive summary.';
        const result = await aiService.chat({
          provider: ctx.nexusUser.aiProvider,
          model: ctx.nexusUser.aiModel,
          messages: [
            { role: 'system', content: 'You are analyzing an uploaded file. Be thorough and helpful.' },
            { role: 'user', content: `File: ${doc.file_name}\n\n${content.slice(0, 8000)}\n\nRequest: ${caption}` },
          ],
          maxTokens: ctx.nexusUser.maxTokens || 2048,
        });
        await userService.incrementUsage(ctx.userId);
        const chunks = chunkText(result.content, 4000);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📄 *File Analysis:*\n\n${chunks[0]}`, { parse_mode: 'Markdown' })
          .catch(() => ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📄 File Analysis:\n\n${chunks[0]}`));
        for (let i = 1; i < chunks.length; i++) await ctx.reply(chunks[i]);
      } catch (e) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ ${e.message}`);
      }
    });

    // Text messages
    bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith('/')) return;

      // Keyboard buttons
      const keyMap = {
        '💬 New Chat': '/new',
        '🤖 Models': '/model',
        '🎨 Image': null,
        '📊 Stats': '/stats',
        '⚙️ Settings': '/settings',
        '🆘 Help': '/help',
      };
      if (keyMap[text] !== undefined) {
        if (text === '🎨 Image') return ctx.reply('Usage: /image <description>\nExample: /image a sunset over mountains');
        return ctx.telegram.sendMessage(ctx.chat.id, text).then(() =>
          bot.handleUpdate({ update_id: 0, message: { ...ctx.message, text: keyMap[text] } })
        ).catch(() => {});
      }

      await this._processMessage(ctx, text, ctx.nexusUser);
    });
  }

  async _processMessage(ctx, text, user) {
    if (!user.canSendMessage(config.limits)) {
      return ctx.reply(
        `⚠️ Daily limit reached (${user.plan === 'free' ? config.limits.freeDailyMessages : config.limits.proDailyMessages} msgs).\n` +
        (user.plan === 'free' ? '💎 Upgrade to Pro for more!' : '🔄 Resets tomorrow.')
      );
    }

    await ctx.sendChatAction('typing');

    try {
      let systemPrompt = user.systemPrompt || '';
      if (user.memoryEnabled && user.userMemory?.length) {
        systemPrompt += `\n\nUser memories: ${user.userMemory.slice(-10).join('; ')}`;
      }

      const messages = user.contextEnabled !== false
        ? await contextService.getMessages(ctx.userId, ctx.chatId, systemPrompt)
        : (systemPrompt ? [{ role: 'system', content: systemPrompt }] : []);

      messages.push({ role: 'user', content: text });

      let responseText = '';
      let sentMsg = null;
      let lastUpdate = Date.now();

      const result = await aiService.chat({
        provider: user.aiProvider,
        model: user.aiModel,
        messages,
        maxTokens: user.maxTokens || config.ai.defaultMaxTokens,
        temperature: user.temperature || config.ai.defaultTemperature,
        stream: true,
        onToken: async (token) => {
          responseText += token;
          const now = Date.now();
          if (now - lastUpdate > 1200) {
            lastUpdate = now;
            try {
              if (!sentMsg) {
                sentMsg = await ctx.reply(responseText + ' ▌');
              } else {
                await ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, responseText + ' ▌');
              }
            } catch { /* ignore edit errors */ }
          }
        },
      });

      const final = result.content || responseText;
      const chunks = chunkText(final, 4000);

      if (sentMsg) {
        await ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, chunks[0], { parse_mode: 'Markdown' })
          .catch(() => ctx.telegram.editMessageText(ctx.chat.id, sentMsg.message_id, null, chunks[0]));
      } else {
        await ctx.reply(chunks[0], { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunks[0]));
      }

      for (let i = 1; i < chunks.length; i++) {
        await ctx.reply(chunks[i], { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunks[i]));
      }

      if (user.contextEnabled !== false) {
        await contextService.addMessage(ctx.userId, ctx.chatId, 'user', text);
        await contextService.addMessage(ctx.userId, ctx.chatId, 'assistant', final, {
          provider: user.aiProvider, model: user.aiModel, tokensUsed: result.tokensUsed,
        });
      }

      await userService.incrementUsage(ctx.userId, result.tokensUsed || 0);

    } catch (err) {
      logger.error(`Message processing: ${err.message}`);
      await ctx.reply(`❌ ${err.message}`);
    }
  }

  _setupCallbacks() {
    const { bot } = this;

    bot.action('cancel', ctx => ctx.deleteMessage().catch(() => {}));

    // Provider
    bot.action(/^prov:(.+)$/, async (ctx) => {
      const provider = ctx.match[1];
      const models = aiService.getModelsForProvider(provider);
      if (!models.length) return ctx.answerCbQuery('No models available');
      const buttons = models.map(m => [Markup.button.callback(`${m}`, `mdl:${provider}:${m}`)]);
      buttons.push([Markup.button.callback('⬅️ Back', 'back:model')]);
      await ctx.editMessageText(`🧠 *Select model for ${provider.toUpperCase()}:*`, {
        parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons),
      });
      await ctx.answerCbQuery();
    });

    // Model
    bot.action(/^mdl:(.+):(.+)$/, async (ctx) => {
      const [, provider, model] = ctx.match;
      await userService.setProvider(ctx.userId, provider, model);
      await ctx.editMessageText(`✅ *Switched to ${provider.toUpperCase()} / ${model}*`, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('✅ Updated!');
    });

    // Back to provider list
    bot.action('back:model', async (ctx) => {
      const providers = aiService.getAvailableProviders();
      const buttons = providers.map(p => [Markup.button.callback(`${aiService.isFreeProvider(p) ? '🆓' : '💎'} ${p.toUpperCase()}`, `prov:${p}`)]);
      buttons.push([Markup.button.callback('❌ Cancel', 'cancel')]);
      await ctx.editMessageText('🤖 *Select AI Provider:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      await ctx.answerCbQuery();
    });

    // Persona
    bot.action(/^persona:(.+)$/, async (ctx) => {
      await userService.setPersona(ctx.userId, ctx.match[1]);
      await ctx.editMessageText(`✅ *Persona set to: ${ctx.match[1]}*`, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('✅ Updated!');
    });

    // Image provider
    bot.action(/^imgprov:(.+)$/, async (ctx) => {
      await userService.update(ctx.userId, { imageProvider: ctx.match[1] });
      await ctx.editMessageText(`✅ *Image provider set to: ${ctx.match[1]}*`, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery('✅ Updated!');
    });

    // Toggles
    bot.action('toggle:context', async (ctx) => {
      const u = await userService.get(ctx.userId);
      await userService.update(ctx.userId, { contextEnabled: u.contextEnabled === false ? true : false });
      await ctx.answerCbQuery(`Context ${u.contextEnabled === false ? 'enabled' : 'disabled'}`);
    });

    bot.action('toggle:memory', async (ctx) => {
      const u = await userService.get(ctx.userId);
      await userService.update(ctx.userId, { memoryEnabled: !u.memoryEnabled });
      await ctx.answerCbQuery(`Memory ${!u.memoryEnabled ? 'enabled' : 'disabled'}`);
    });

    // Settings shortcuts
    bot.action('settings:provider', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /model to switch provider');
    });
    bot.action('settings:persona', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /persona to change persona');
    });
    bot.action('settings:temp', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /temp <0.0-2.0> to set temperature');
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

    await this.bot.telegram.setMyCommands([
      { command: 'start', description: '⚡ Start the bot' },
      { command: 'help', description: '📚 All commands' },
      { command: 'model', description: '🤖 Switch AI model' },
      { command: 'persona', description: '🎭 Set personality' },
      { command: 'system', description: '🧠 Custom system prompt' },
      { command: 'image', description: '🎨 Generate image' },
      { command: 'new', description: '🆕 New conversation' },
      { command: 'clear', description: '🗑️ Clear history' },
      { command: 'summarize', description: '📊 Summarize chat' },
      { command: 'translate', description: '🌐 Translate text' },
      { command: 'remind', description: '⏰ Set reminder' },
      { command: 'note', description: '📝 Save note' },
      { command: 'stats', description: '📈 Your stats' },
      { command: 'settings', description: '⚙️ Settings' },
    ]).catch(e => logger.warn(`Could not set commands: ${e.message}`));

    // Launch with graceful error handling
    this.bot.launch({
      dropPendingUpdates: true,
    });

    logger.info('🤖 Telegram bot launched');

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = new TelegramBot();
