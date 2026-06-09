// src/handlers/discord.js — NexusAI v3 Discord Bot
// Owner: TheMisfitDK — github.com/TheMisfitDK
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder, Events, Collection,
} = require('discord.js');
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
const { extractFileContent } = require('../utils/fileUtils');

const C = { primary: 0x5865F2, success: 0x57F287, error: 0xED4245, warn: 0xFEE75C };

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOwner(discordId) {
  return String(discordId) === config.app.ownerIdDiscord;
}

function hasAccess(user, discordId) {
  if (isOwner(discordId)) return true;
  return user && user.canSendMessage();
}

function noAccessEmbed(user) {
  const desc = (!user || !user.isAuthorized)
    ? '🔒 You are not authorized.\nContact the owner to request access.'
    : '⚠️ Your token balance is empty.\nContact the owner to top up your tokens.';
  return new EmbedBuilder().setColor(C.error).setDescription(desc);
}

function formatTokens(n) {
  return Number(n).toLocaleString();
}

class DiscordBot {
  constructor() {
    if (!config.platforms.discord.token) {
      logger.warn('DISCORD_BOT_TOKEN not set — Discord disabled');
      return;
    }
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
    this._buildCommands();
    this._setupEvents();
  }

  _buildCommands() {
    this.slashCommands = [
      new SlashCommandBuilder().setName('chat').setDescription('Chat with AI')
        .addStringOption(o => o.setName('message').setDescription('Your message').setRequired(true)),
      new SlashCommandBuilder().setName('ask').setDescription('Single question (no context)')
        .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)),
      new SlashCommandBuilder().setName('model').setDescription('Switch AI provider/model'),
      new SlashCommandBuilder().setName('persona').setDescription('Set AI persona'),
      new SlashCommandBuilder().setName('system').setDescription('Set system prompt')
        .addStringOption(o => o.setName('prompt').setDescription('System prompt').setRequired(true)),
      new SlashCommandBuilder().setName('temp').setDescription('Set temperature 0.0-2.0')
        .addNumberOption(o => o.setName('value').setDescription('Temperature').setRequired(true).setMinValue(0).setMaxValue(2)),
      new SlashCommandBuilder().setName('new').setDescription('Start new conversation'),
      new SlashCommandBuilder().setName('clear').setDescription('Clear history'),
      new SlashCommandBuilder().setName('summarize').setDescription('Summarize conversation'),
      new SlashCommandBuilder().setName('export').setDescription('Export conversation')
        .addStringOption(o => o.setName('format').setDescription('Format').addChoices(
          { name: 'Markdown', value: 'text' }, { name: 'JSON', value: 'json' }
        )),
      new SlashCommandBuilder().setName('image').setDescription('Generate AI image')
        .addStringOption(o => o.setName('prompt').setDescription('Image description').setRequired(true))
        .addStringOption(o => o.setName('provider').setDescription('Provider (optional)')),
      new SlashCommandBuilder().setName('translate').setDescription('Translate text')
        .addStringOption(o => o.setName('language').setDescription('Target language').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true)),
      new SlashCommandBuilder().setName('remind').setDescription('Set reminder')
        .addStringOption(o => o.setName('time').setDescription('When (e.g. "in 30 minutes")').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Reminder text').setRequired(true)),
      new SlashCommandBuilder().setName('reminders').setDescription('List reminders'),
      new SlashCommandBuilder().setName('note').setDescription('Save a note')
        .addStringOption(o => o.setName('content').setDescription('Note text').setRequired(true)),
      new SlashCommandBuilder().setName('notes').setDescription('View notes'),
      new SlashCommandBuilder().setName('stats').setDescription('Your usage statistics'),
      new SlashCommandBuilder().setName('settings').setDescription('Bot settings'),
      new SlashCommandBuilder().setName('feedback').setDescription('Send feedback')
        .addStringOption(o => o.setName('message').setDescription('Feedback').setRequired(true)),
      new SlashCommandBuilder().setName('help').setDescription('Show help'),

      // ── Owner-only commands (silently ignored for non-owners) ──
      new SlashCommandBuilder().setName('authorize').setDescription('[Owner] Authorize a user')
        .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
        .addIntegerOption(o => o.setName('tokens').setDescription('Token grant amount (default from config)')),
      new SlashCommandBuilder().setName('deauthorize').setDescription('[Owner] Revoke a user\'s access')
        .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true)),
      new SlashCommandBuilder().setName('addtokens').setDescription('[Owner] Add tokens to a user')
        .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Tokens to add').setRequired(true)),
      new SlashCommandBuilder().setName('authed').setDescription('[Owner] List authorized users'),
    ].map(c => c.toJSON());
  }

  async deployCommands() {
    if (!config.platforms.discord.clientId) {
      logger.warn('DISCORD_CLIENT_ID not set — skipping slash command deploy');
      return;
    }
    try {
      const rest = new REST().setToken(config.platforms.discord.token);
      await rest.put(Routes.applicationCommands(config.platforms.discord.clientId), { body: this.slashCommands });
      logger.info('✅ Discord slash commands deployed');
    } catch (err) {
      logger.error(`Discord command deploy failed: ${err.message}`);
    }
  }

  _setupEvents() {
    const { client } = this;

    client.once(Events.ClientReady, async () => {
      logger.info(`🎮 Discord ready: ${client.user.tag}`);
      client.user.setActivity('AI-powered conversations | /help', { type: 3 });
      await this.deployCommands();
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) await this._handleSlash(interaction);
        else if (interaction.isButton()) await this._handleButton(interaction);
        else if (interaction.isStringSelectMenu()) await this._handleSelect(interaction);
      } catch (err) {
        logger.error(`Discord interaction error: ${err.message}`);
        const reply = { content: `❌ ${err.message}`, ephemeral: true };
        if (interaction.deferred) interaction.editReply(reply).catch(() => {});
        else interaction.reply(reply).catch(() => {});
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      if (!message.content && message.attachments.size === 0) return;
      const isDM = !message.guild;
      const isMentioned = message.mentions.has(client.user);
      const isAIChannel = /\b(ai|chat|bot|gpt|nexus)\b/i.test(message.channel.name || '');
      if (!isDM && !isMentioned && !isAIChannel) return;

      let content = message.content.replace(`<@${client.user.id}>`, '').trim();
      const userId = `discord:${message.author.id}`;
      const chatId = String(message.channel.id);

      const user = await userService.getOrCreate('discord', message.author.id, {
        username: message.author.username,
        firstName: message.author.displayName,
      });

      if (user.isBanned) return message.reply('🚫 You are banned from using this bot.');
      if (!hasAccess(user, message.author.id)) {
        return message.reply({ embeds: [noAccessEmbed(user)] });
      }

      // Image attachment
      const attachment = message.attachments.first();
      if (attachment?.contentType?.startsWith('image/')) {
        await message.channel.sendTyping();
        const result = await analyzeImage(attachment.url, content || 'Describe this image.', user.aiProvider, user.aiModel);
        const embed = new EmbedBuilder().setColor(C.primary).setDescription(result)
          .setFooter({ text: `${user.aiProvider} / ${user.aiModel}` });
        return message.reply({ embeds: [embed] });
      }

      if (!content) return;
      await message.channel.sendTyping();
      await this._processMessage(message, content, user, userId, chatId);
    });

    client.on(Events.Error, err => logger.error(`Discord client error: ${err.message}`));
  }

  async _handleSlash(interaction) {
    const userId = `discord:${interaction.user.id}`;
    const chatId = String(interaction.channelId);
    const user = await userService.getOrCreate('discord', interaction.user.id, {
      username: interaction.user.username,
      firstName: interaction.user.displayName,
    });

    const cmd = interaction.commandName;

    // ── Owner-only commands ──────────────────────────────────────────────────
    if (cmd === 'authorize') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      const targetId = interaction.options.getString('user_id');
      const tokens = interaction.options.getInteger('tokens') ?? config.app.defaultTokenGrant;
      await userService.getOrCreate('discord', targetId, {});
      const u = await userService.authorizeUser(`discord:${targetId}`, tokens);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(C.success)
          .setTitle('✅ User Authorized')
          .addFields(
            { name: 'User ID', value: targetId, inline: true },
            { name: 'Granted', value: `${formatTokens(tokens)} tokens`, inline: true },
            { name: 'Balance', value: `${formatTokens(u.tokenBalance)} tokens`, inline: true },
          )],
        ephemeral: true,
      });
    }

    if (cmd === 'deauthorize') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      const targetId = interaction.options.getString('user_id');
      await userService.revokeAuth(`discord:${targetId}`);
      return interaction.reply({ content: `🔒 Revoked access for \`${targetId}\``, ephemeral: true });
    }

    if (cmd === 'addtokens') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      const targetId = interaction.options.getString('user_id');
      const amount = interaction.options.getInteger('amount');
      const u = await userService.addTokens(`discord:${targetId}`, amount);
      if (!u) return interaction.reply({ content: `❌ User \`${targetId}\` not found.`, ephemeral: true });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(C.success)
          .setTitle('✅ Tokens Added')
          .addFields(
            { name: 'User ID', value: targetId, inline: true },
            { name: 'Added', value: `${formatTokens(amount)} tokens`, inline: true },
            { name: 'New Balance', value: `${formatTokens(u.tokenBalance)} tokens`, inline: true },
          )],
        ephemeral: true,
      });
    }

    if (cmd === 'authed') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      const users = await userService.getAuthorizedUsers(25);
      const embed = new EmbedBuilder().setColor(C.primary).setTitle(`🔑 Authorized Users (${users.length})`);
      if (!users.length) {
        embed.setDescription('No authorized users yet.');
      } else {
        users.forEach((u, i) => {
          const [, id] = u.userId.split(':');
          const name = u.username || u.firstName || id;
          embed.addFields({
            name: `${i + 1}. ${name} (${id})`,
            value: `💰 ${formatTokens(u.tokenBalance)} tokens | 📨 ${u.totalMessages} msgs`,
          });
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Regular commands ─────────────────────────────────────────────────────
    if (cmd === 'chat') {
      await interaction.deferReply();
      if (!hasAccess(user, interaction.user.id)) {
        return interaction.editReply({ embeds: [noAccessEmbed(user)] });
      }
      await this._processInteraction(interaction, interaction.options.getString('message'), user, userId, chatId);

    } else if (cmd === 'ask') {
      await interaction.deferReply();
      if (!hasAccess(user, interaction.user.id)) {
        return interaction.editReply({ embeds: [noAccessEmbed(user)] });
      }
      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel,
        messages: [{ role: 'user', content: interaction.options.getString('question') }],
        maxTokens: user.maxTokens || 2048, temperature: user.temperature || 0.7,
      });
      const embed = new EmbedBuilder().setColor(C.primary).setDescription(result.content.slice(0, 4096))
        .setFooter({ text: `${user.aiProvider}/${user.aiModel} • no context` });
      await interaction.editReply({ embeds: [embed] });
      if (!isOwner(interaction.user.id)) await userService.incrementUsage(userId, result.tokensUsed || 0);

    } else if (cmd === 'model') {
      const providers = aiService.getAvailableProviders();
      if (!providers.length) return interaction.reply({ content: '❌ No AI providers configured.', ephemeral: true });
      const select = new StringSelectMenuBuilder().setCustomId('sel_provider').setPlaceholder('Choose provider')
        .addOptions(providers.map(p => ({
          label: p.toUpperCase(), value: p,
          description: aiService.isFreeProvider(p) ? '🆓 Free' : '💎 Paid',
        })));
      await interaction.reply({ content: '🤖 Select provider:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });

    } else if (cmd === 'persona') {
      const personas = ['default','assistant','teacher','coder','creative','analyst','therapist','comedian','scientist','chef','lawyer','finance'];
      const select = new StringSelectMenuBuilder().setCustomId('sel_persona').setPlaceholder('Choose persona')
        .addOptions(personas.map(p => ({ label: p.charAt(0).toUpperCase() + p.slice(1), value: p })));
      await interaction.reply({ content: '🎭 Select persona:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });

    } else if (cmd === 'system') {
      await userService.setSystemPrompt(userId, interaction.options.getString('prompt'));
      await interaction.reply({ content: '✅ System prompt set!', ephemeral: true });

    } else if (cmd === 'temp') {
      await userService.update(userId, { temperature: interaction.options.getNumber('value') });
      await interaction.reply({ content: `🌡️ Temperature set to ${interaction.options.getNumber('value')}`, ephemeral: true });

    } else if (cmd === 'new') {
      await contextService.newConversation(userId, chatId);
      await interaction.reply({ content: '🆕 New conversation!', ephemeral: true });

    } else if (cmd === 'clear') {
      await contextService.clearContext(userId, chatId);
      await interaction.reply({ content: '🗑️ History cleared!', ephemeral: true });

    } else if (cmd === 'summarize') {
      await interaction.deferReply({ ephemeral: true });
      const summary = await contextService.summarizeConversation(userId, chatId, aiService);
      const embed = new EmbedBuilder().setColor(C.primary).setTitle('📊 Summary').setDescription(summary.slice(0, 4096));
      await interaction.editReply({ embeds: [embed] });

    } else if (cmd === 'export') {
      const fmt = interaction.options.getString('format') || 'text';
      const content = await contextService.exportConversation(userId, chatId, fmt);
      if (!content) return interaction.reply({ content: 'No conversation to export.', ephemeral: true });
      const file = new AttachmentBuilder(Buffer.from(content), { name: `chat.${fmt === 'json' ? 'json' : 'md'}` });
      await interaction.reply({ files: [file], ephemeral: true });

    } else if (cmd === 'image') {
      await interaction.deferReply();
      if (!hasAccess(user, interaction.user.id)) {
        return interaction.editReply({ embeds: [noAccessEmbed(user)] });
      }
      const prompt = interaction.options.getString('prompt');
      const provider = interaction.options.getString('provider') || null;
      const providers = imageService.getAvailableProviders();
      if (!providers.length) return interaction.editReply('❌ No image provider configured.');
      try {
        const result = await imageService.generate(prompt, provider);
        const file = new AttachmentBuilder(result.buffer, { name: 'image.png' });
        const embed = new EmbedBuilder().setColor(C.primary).setTitle('🎨 Generated Image')
          .setDescription(`"${prompt.slice(0, 200)}"`)
          .setImage('attachment://image.png')
          .setFooter({ text: `via ${result.provider}` });
        await interaction.editReply({ embeds: [embed], files: [file] });
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }

    } else if (cmd === 'translate') {
      await interaction.deferReply();
      const lang = interaction.options.getString('language');
      const text = interaction.options.getString('text');
      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel,
        messages: [
          { role: 'system', content: `Translate to ${lang}. Return ONLY the translation.` },
          { role: 'user', content: text },
        ],
        maxTokens: 1024,
      });
      const embed = new EmbedBuilder().setColor(C.success).setTitle(`🌐 → ${lang}`)
        .addFields({ name: 'Original', value: text.slice(0, 1024) }, { name: 'Translation', value: result.content.slice(0, 1024) });
      await interaction.editReply({ embeds: [embed] });

    } else if (cmd === 'remind') {
      const timeStr = interaction.options.getString('time');
      const msg = interaction.options.getString('message');
      const scheduledAt = reminderService.parseTime(timeStr);
      if (!scheduledAt) return interaction.reply({ content: '❌ Bad time format. Try "in 30 minutes" or "tomorrow 9am"', ephemeral: true });
      await reminderService.create(userId, 'discord', chatId, msg, scheduledAt);
      await interaction.reply({ content: `⏰ Reminder set for ${scheduledAt.toLocaleString()}: **${msg}**`, ephemeral: true });

    } else if (cmd === 'reminders') {
      const reminders = await reminderService.list(userId);
      if (!reminders.length) return interaction.reply({ content: 'No reminders.', ephemeral: true });
      const embed = new EmbedBuilder().setColor(C.primary).setTitle('⏰ Reminders');
      reminders.forEach((r, i) => embed.addFields({ name: `${i+1}. ${r.text}`, value: `🕐 ${new Date(r.scheduledAt).toLocaleString()}` }));
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (cmd === 'note') {
      await Note.create({ userId, content: interaction.options.getString('content') });
      await interaction.reply({ content: '📝 Note saved!', ephemeral: true });

    } else if (cmd === 'notes') {
      const notes = await Note.find({ userId }).sort({ createdAt: -1 }).limit(10);
      if (!notes.length) return interaction.reply({ content: 'No notes saved.', ephemeral: true });
      const embed = new EmbedBuilder().setColor(C.primary).setTitle('📝 Notes');
      notes.forEach((n, i) => embed.addFields({ name: `Note ${i+1}`, value: n.content.slice(0, 1024) }));
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (cmd === 'stats') {
      const stats = await userService.getStats(userId);
      const ownerAccess = isOwner(interaction.user.id);
      const accessField = ownerAccess
        ? '👑 OWNER (unlimited)'
        : stats.isAuthorized
          ? `✅ Authorized | ${formatTokens(stats.tokenBalance)} tokens`
          : '🔒 Not authorized';
      const embed = new EmbedBuilder().setColor(C.primary).setTitle('📊 Statistics')
        .addFields(
          { name: '🔑 Access', value: accessField, inline: false },
          { name: '💬 Total Messages', value: String(stats.totalMessages), inline: true },
          { name: '🔤 Tokens Used', value: formatTokens(stats.totalTokensUsed), inline: true },
          { name: '🎁 Tokens Granted', value: formatTokens(stats.tokensGranted), inline: true },
          { name: '🤖 Provider', value: stats.provider, inline: true },
          { name: '🧠 Model', value: stats.model, inline: true },
          { name: '🎭 Persona', value: stats.persona, inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (cmd === 'settings') {
      const embed = new EmbedBuilder().setColor(C.primary).setTitle('⚙️ Settings')
        .addFields(
          { name: '🤖 Provider', value: user.aiProvider, inline: true },
          { name: '🧠 Model', value: user.aiModel, inline: true },
          { name: '🌡️ Temp', value: String(user.temperature || 0.7), inline: true },
          { name: '💬 Context', value: user.contextEnabled !== false ? '✅' : '❌', inline: true },
          { name: '🧠 Memory', value: user.memoryEnabled ? '✅' : '❌', inline: true },
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_ctx').setLabel('Toggle Context').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_mem').setLabel('Toggle Memory').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_model').setLabel('Switch Model').setStyle(ButtonStyle.Success),
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    } else if (cmd === 'feedback') {
      await Feedback.create({ userId, platform: 'discord', type: 'general', content: interaction.options.getString('message') });
      await interaction.reply({ content: '✅ Feedback sent!', ephemeral: true });

    } else if (cmd === 'help') {
      const ownerAccess = isOwner(interaction.user.id);
      const embed = new EmbedBuilder().setColor(C.primary).setTitle(`⚡ ${config.app.name} Help`)
        .setDescription('Multi-provider AI chatbot — mention me or DM me to chat!')
        .addFields(
          { name: '💬 Chat', value: '`/chat` `/ask` `/new` `/clear` `/summarize` `/export`' },
          { name: '🤖 AI', value: '`/model` `/persona` `/system` `/temp`' },
          { name: '🛠️ Tools', value: '`/image` `/translate` `/remind` `/reminders`' },
          { name: '📝 Notes', value: '`/note` `/notes`' },
          { name: '📊 Account', value: '`/stats` `/settings` `/feedback`' },
          ...(ownerAccess ? [{
            name: '👑 Owner',
            value: '`/authorize` `/deauthorize` `/addtokens` `/authed`',
          }] : []),
          { name: '💡 Tip', value: 'Mention me in any channel or DM me to chat!' },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  async _handleButton(interaction) {
    const userId = `discord:${interaction.user.id}`;
    if (interaction.customId === 'btn_ctx') {
      const u = await userService.get(userId);
      await userService.update(userId, { contextEnabled: u.contextEnabled === false ? true : false });
      await interaction.reply({ content: `Context ${u.contextEnabled === false ? 'enabled ✅' : 'disabled ❌'}`, ephemeral: true });
    } else if (interaction.customId === 'btn_mem') {
      const u = await userService.get(userId);
      await userService.update(userId, { memoryEnabled: !u.memoryEnabled });
      await interaction.reply({ content: `Memory ${!u.memoryEnabled ? 'enabled ✅' : 'disabled ❌'}`, ephemeral: true });
    } else if (interaction.customId === 'btn_model') {
      const providers = aiService.getAvailableProviders();
      const select = new StringSelectMenuBuilder().setCustomId('sel_provider').setPlaceholder('Choose provider')
        .addOptions(providers.map(p => ({ label: p.toUpperCase(), value: p, description: aiService.isFreeProvider(p) ? '🆓 Free' : '💎 Paid' })));
      await interaction.reply({ content: 'Select provider:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }
  }

  async _handleSelect(interaction) {
    const userId = `discord:${interaction.user.id}`;
    if (interaction.customId === 'sel_provider') {
      const provider = interaction.values[0];
      const models = aiService.getModelsForProvider(provider);
      const select = new StringSelectMenuBuilder().setCustomId(`sel_model_${provider}`).setPlaceholder('Choose model')
        .addOptions(models.map(m => ({ label: m, value: `${provider}||${m}` })));
      await interaction.update({ content: `Select model for ${provider.toUpperCase()}:`, components: [new ActionRowBuilder().addComponents(select)] });
    } else if (interaction.customId.startsWith('sel_model_')) {
      const [provider, model] = interaction.values[0].split('||');
      await userService.setProvider(userId, provider, model);
      await interaction.update({ content: `✅ Switched to **${provider.toUpperCase()} / ${model}**`, components: [] });
    } else if (interaction.customId === 'sel_persona') {
      await userService.setPersona(userId, interaction.values[0]);
      await interaction.update({ content: `✅ Persona: **${interaction.values[0]}**`, components: [] });
    }
  }

  async _processMessage(message, text, user, userId, chatId) {
    try {
      const messages = user.contextEnabled !== false
        ? await contextService.getMessages(userId, chatId, user.systemPrompt || '')
        : [];
      messages.push({ role: 'user', content: text });

      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel, messages,
        maxTokens: user.maxTokens || 2048, temperature: user.temperature || 0.7,
      });

      const chunks = chunkText(result.content, 2000);
      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder().setColor(C.primary).setDescription(chunks[i])
          .setFooter({ text: `${user.aiProvider}/${user.aiModel}` });
        if (i === 0) await message.reply({ embeds: [embed] });
        else await message.channel.send({ embeds: [embed] });
      }

      if (user.contextEnabled !== false) {
        await contextService.addMessage(userId, chatId, 'user', text);
        await contextService.addMessage(userId, chatId, 'assistant', result.content, { provider: user.aiProvider, model: user.aiModel });
      }
      // Owner bypass — don't deduct tokens
      if (!isOwner(message.author.id)) {
        await userService.incrementUsage(userId, result.tokensUsed || 0);
      }
    } catch (err) {
      await message.reply(`❌ ${err.message}`);
    }
  }

  async _processInteraction(interaction, text, user, userId, chatId) {
    try {
      const messages = user.contextEnabled !== false
        ? await contextService.getMessages(userId, chatId, user.systemPrompt || '')
        : [];
      messages.push({ role: 'user', content: text });

      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel, messages,
        maxTokens: user.maxTokens || 2048, temperature: user.temperature || 0.7,
      });

      const chunks = chunkText(result.content, 2000);
      const embed = new EmbedBuilder().setColor(C.primary).setDescription(chunks[0].slice(0, 4096))
        .setFooter({ text: `${user.aiProvider}/${user.aiModel}` });
      await interaction.editReply({ embeds: [embed] });
      for (let i = 1; i < chunks.length; i++) {
        const e = new EmbedBuilder().setColor(C.primary).setDescription(chunks[i].slice(0, 4096));
        await interaction.followUp({ embeds: [e] });
      }

      if (user.contextEnabled !== false) {
        await contextService.addMessage(userId, chatId, 'user', text);
        await contextService.addMessage(userId, chatId, 'assistant', result.content, { provider: user.aiProvider, model: user.aiModel });
      }
      if (!isOwner(interaction.user.id)) {
        await userService.incrementUsage(userId, result.tokensUsed || 0);
      }
    } catch (err) {
      await interaction.editReply(`❌ ${err.message}`);
    }
  }

  registerReminderDispatcher() {
    reminderService.registerDispatcher('discord', async (channelId, text) => {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (channel) await channel.send(text);
    });
  }

  async launch() {
    if (!this.client) return;
    this.registerReminderDispatcher();
    await this.client.login(config.platforms.discord.token);
    logger.info('🎮 Discord bot launched');
  }
}

module.exports = new DiscordBot();
