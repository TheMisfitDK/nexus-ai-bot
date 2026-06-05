// src/handlers/discord.js — Full-featured Discord bot
const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder, PermissionFlagsBits,
  Events, Collection,
} = require('discord.js');

const config = require('../../config');
const aiService = require('../services/AIService');
const contextService = require('../services/ContextService');
const userService = require('../services/UserService');
const reminderService = require('../services/ReminderService');
const { Note, Feedback } = require('../models');
const logger = require('../utils/logger');
const { chunkText } = require('../utils/formatter');
const { analyzeImage, generateImage } = require('../utils/imageUtils');
const { extractFileContent } = require('../utils/fileUtils');

const COLORS = {
  primary: 0x5865F2,
  success: 0x57F287,
  error: 0xED4245,
  warn: 0xFEE75C,
  info: 0x5865F2,
};

class DiscordBot {
  constructor() {
    if (!config.platforms.discord.token) {
      logger.warn('Discord token not set — skipping Discord init');
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

    this.commands = new Collection();
    this._buildCommands();
    this._setupEvents();
  }

  _buildCommands() {
    this.slashCommands = [
      new SlashCommandBuilder().setName('chat').setDescription('Chat with AI')
        .addStringOption(o => o.setName('message').setDescription('Your message').setRequired(true)),
      new SlashCommandBuilder().setName('model').setDescription('Switch AI provider/model'),
      new SlashCommandBuilder().setName('persona').setDescription('Set AI persona'),
      new SlashCommandBuilder().setName('system').setDescription('Set system prompt')
        .addStringOption(o => o.setName('prompt').setDescription('System prompt').setRequired(true)),
      new SlashCommandBuilder().setName('new').setDescription('Start new conversation'),
      new SlashCommandBuilder().setName('clear').setDescription('Clear conversation history'),
      new SlashCommandBuilder().setName('summarize').setDescription('Summarize current conversation'),
      new SlashCommandBuilder().setName('export').setDescription('Export conversation')
        .addStringOption(o => o.setName('format').setDescription('Format').addChoices({ name: 'Text', value: 'text' }, { name: 'JSON', value: 'json' })),
      new SlashCommandBuilder().setName('translate').setDescription('Translate text')
        .addStringOption(o => o.setName('language').setDescription('Target language').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true)),
      new SlashCommandBuilder().setName('image').setDescription('Generate AI image')
        .addStringOption(o => o.setName('prompt').setDescription('Image description').setRequired(true)),
      new SlashCommandBuilder().setName('remind').setDescription('Set a reminder')
        .addStringOption(o => o.setName('time').setDescription('When (e.g. "in 30 minutes", "tomorrow 9am")').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Reminder message').setRequired(true)),
      new SlashCommandBuilder().setName('reminders').setDescription('View your reminders'),
      new SlashCommandBuilder().setName('note').setDescription('Save a note')
        .addStringOption(o => o.setName('content').setDescription('Note content').setRequired(true)),
      new SlashCommandBuilder().setName('notes').setDescription('View your notes'),
      new SlashCommandBuilder().setName('stats').setDescription('View your statistics'),
      new SlashCommandBuilder().setName('help').setDescription('Show help'),
      new SlashCommandBuilder().setName('settings').setDescription('Bot settings'),
      new SlashCommandBuilder().setName('temp').setDescription('Set temperature')
        .addNumberOption(o => o.setName('value').setDescription('0.0 to 2.0').setRequired(true).setMinValue(0).setMaxValue(2)),
      new SlashCommandBuilder().setName('feedback').setDescription('Send feedback')
        .addStringOption(o => o.setName('message').setDescription('Your feedback').setRequired(true)),
      new SlashCommandBuilder().setName('ask').setDescription('Quick single question (no context)')
        .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
    ].map(cmd => cmd.toJSON());
  }

  async deployCommands() {
    try {
      const rest = new REST().setToken(config.platforms.discord.token);
      await rest.put(Routes.applicationCommands(config.platforms.discord.clientId), { body: this.slashCommands });
      logger.info(`✅ Discord slash commands deployed`);
    } catch (err) {
      logger.error(`Failed to deploy Discord commands: ${err.message}`);
    }
  }

  _setupEvents() {
    const { client } = this;

    client.once(Events.ClientReady, async () => {
      logger.info(`🎮 Discord bot ready as ${client.user.tag}`);
      client.user.setActivity('AI-powered conversations', { type: 2 });
      await this.deployCommands();
    });

    // Slash commands
    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) await this._handleSlashCommand(interaction);
      else if (interaction.isButton()) await this._handleButton(interaction);
      else if (interaction.isStringSelectMenu()) await this._handleSelect(interaction);
    });

    // Regular messages (for chat in DMs and AI channels)
    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      if (!message.content) return;

      const isDM = !message.guild;
      const isMentioned = message.mentions.has(client.user);
      const isAIChannel = message.channel.name?.toLowerCase().includes('ai') ||
        message.channel.name?.toLowerCase().includes('chat');

      if (!isDM && !isMentioned && !isAIChannel) return;

      let content = message.content.replace(`<@${client.user.id}>`, '').trim();
      if (!content) return;

      await message.channel.sendTyping();
      const userId = `discord:${message.author.id}`;
      const chatId = String(message.channel.id);

      const user = await userService.getOrCreate('discord', message.author.id, {
        username: message.author.username,
        firstName: message.author.displayName,
      });

      if (user.isBanned) return message.reply('🚫 You have been banned from using this bot.');
      if (!user.canSendMessage(config.limits)) {
        return message.reply('⚠️ Daily message limit reached. Upgrade to Pro for more!');
      }

      // Image attachment?
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith('image/')) {
          const result = await analyzeImage(attachment.url, content || 'Describe this image.', user.aiProvider, user.aiModel);
          const embed = new EmbedBuilder().setColor(COLORS.primary).setDescription(result).setFooter({ text: `${user.aiProvider} / ${user.aiModel}` });
          return message.reply({ embeds: [embed] });
        }
      }

      await this._processMessage(message, content, user, userId, chatId);
    });
  }

  async _handleSlashCommand(interaction) {
    const userId = `discord:${interaction.user.id}`;
    const chatId = String(interaction.channelId);
    const user = await userService.getOrCreate('discord', interaction.user.id, {
      username: interaction.user.username,
      firstName: interaction.user.displayName,
    });

    switch (interaction.commandName) {
      case 'chat': {
        const text = interaction.options.getString('message');
        await interaction.deferReply();
        await this._processInteractionMessage(interaction, text, user, userId, chatId);
        break;
      }
      case 'ask': {
        const question = interaction.options.getString('question');
        await interaction.deferReply();
        const result = await aiService.chat({
          provider: user.aiProvider, model: user.aiModel,
          messages: [{ role: 'user', content: question }],
          maxTokens: user.maxTokens, temperature: user.temperature,
        });
        const embed = new EmbedBuilder().setColor(COLORS.primary).setDescription(result.content)
          .setFooter({ text: `${user.aiProvider} / ${user.aiModel} • No context mode` });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'model': {
        const providers = aiService.getAvailableProviders();
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_provider')
          .setPlaceholder('Choose AI Provider')
          .addOptions(providers.map(p => ({
            label: p.toUpperCase(),
            value: p,
            description: aiService.isFreeProvider(p) ? '🆓 Free tier' : '💎 Paid',
          })));
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: '🤖 Select AI Provider:', components: [row], ephemeral: true });
        break;
      }
      case 'persona': {
        const personas = ['default', 'assistant', 'teacher', 'coder', 'creative', 'analyst', 'therapist', 'comedian', 'scientist', 'chef'];
        const select = new StringSelectMenuBuilder()
          .setCustomId('select_persona')
          .setPlaceholder('Choose Persona')
          .addOptions(personas.map(p => ({ label: p.charAt(0).toUpperCase() + p.slice(1), value: p })));
        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: '🎭 Select Persona:', components: [row], ephemeral: true });
        break;
      }
      case 'system': {
        const prompt = interaction.options.getString('prompt');
        await userService.setSystemPrompt(userId, prompt);
        await interaction.reply({ content: `✅ System prompt set!`, ephemeral: true });
        break;
      }
      case 'new': {
        await contextService.newConversation(userId, chatId);
        await interaction.reply({ content: '🆕 New conversation started!', ephemeral: true });
        break;
      }
      case 'clear': {
        await contextService.clearContext(userId, chatId);
        await interaction.reply({ content: '🗑️ Conversation cleared!', ephemeral: true });
        break;
      }
      case 'summarize': {
        await interaction.deferReply();
        const summary = await contextService.summarizeConversation(userId, chatId, aiService);
        const embed = new EmbedBuilder().setColor(COLORS.info).setTitle('📊 Conversation Summary').setDescription(summary);
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'export': {
        const format = interaction.options.getString('format') || 'text';
        const content = await contextService.exportConversation(userId, chatId, format);
        if (!content) return interaction.reply({ content: 'No conversation to export.', ephemeral: true });
        const filename = `conversation_${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
        const attachment = new AttachmentBuilder(Buffer.from(content), { name: filename });
        await interaction.reply({ files: [attachment], ephemeral: true });
        break;
      }
      case 'translate': {
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
        const embed = new EmbedBuilder().setColor(COLORS.success)
          .setTitle(`🌐 Translation to ${lang}`)
          .addFields({ name: 'Original', value: text.slice(0, 1024) }, { name: 'Translation', value: result.content.slice(0, 1024) });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case 'image': {
        await interaction.deferReply();
        const prompt = interaction.options.getString('prompt');
        try {
          const imageBuffer = await generateImage(prompt);
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'generated.png' });
          const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('🎨 Generated Image').setDescription(`"${prompt}"`).setImage('attachment://generated.png');
          await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (err) {
          await interaction.editReply({ content: `❌ Image generation failed: ${err.message}` });
        }
        break;
      }
      case 'stats': {
        const stats = await userService.getStats(userId);
        const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('📊 Your Statistics')
          .addFields(
            { name: '🎯 Plan', value: stats.plan.toUpperCase(), inline: true },
            { name: '💬 Total Messages', value: String(stats.totalMessages), inline: true },
            { name: '📅 Today', value: `${stats.dailyMessages} (${stats.remaining} left)`, inline: true },
            { name: '🤖 Provider', value: stats.provider, inline: true },
            { name: '🧠 Model', value: stats.model, inline: true },
            { name: '🎭 Persona', value: stats.persona, inline: true },
          );
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      case 'remind': {
        const timeStr = interaction.options.getString('time');
        const msg = interaction.options.getString('message');
        const scheduledAt = reminderService.parseTime(timeStr);
        if (!scheduledAt) return interaction.reply({ content: '❌ Could not parse time. Try "in 30 minutes" or "tomorrow 9am"', ephemeral: true });
        await reminderService.create(userId, 'discord', chatId, msg, scheduledAt);
        await interaction.reply({ content: `⏰ Reminder set for ${scheduledAt.toLocaleString()}: **${msg}**`, ephemeral: true });
        break;
      }
      case 'reminders': {
        const reminders = await reminderService.list(userId);
        if (!reminders.length) return interaction.reply({ content: 'No upcoming reminders.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(COLORS.info).setTitle('⏰ Your Reminders');
        reminders.forEach((r, i) => embed.addFields({ name: `${i + 1}. ${r.text}`, value: `🕐 ${new Date(r.scheduledAt).toLocaleString()}` }));
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      case 'note': {
        const content = interaction.options.getString('content');
        await Note.create({ userId, content });
        await interaction.reply({ content: '📝 Note saved!', ephemeral: true });
        break;
      }
      case 'notes': {
        const notes = await Note.find({ userId }).sort({ createdAt: -1 }).limit(10);
        if (!notes.length) return interaction.reply({ content: 'No notes saved.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(COLORS.info).setTitle('📝 Your Notes');
        notes.forEach((n, i) => embed.addFields({ name: `Note ${i + 1}`, value: n.content.slice(0, 1024) }));
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      case 'temp': {
        const val = interaction.options.getNumber('value');
        await userService.update(userId, { temperature: val });
        await interaction.reply({ content: `🌡️ Temperature set to ${val}`, ephemeral: true });
        break;
      }
      case 'feedback': {
        const msg = interaction.options.getString('message');
        await Feedback.create({ userId, platform: 'discord', type: 'general', content: msg });
        await interaction.reply({ content: '✅ Feedback sent! Thank you.', ephemeral: true });
        break;
      }
      case 'help': {
        const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(`🌟 ${config.app.name} Help`)
          .setDescription('AI-powered chatbot with 12+ providers')
          .addFields(
            { name: '💬 Chat', value: '/chat, /ask, /new, /clear, /summarize, /export' },
            { name: '🤖 AI', value: '/model, /persona, /system, /temp' },
            { name: '🛠️ Tools', value: '/translate, /image, /remind, /reminders' },
            { name: '📝 Notes', value: '/note, /notes' },
            { name: '📊 Account', value: '/stats, /settings, /feedback' },
          )
          .setFooter({ text: 'You can also just mention me or DM me!' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      case 'settings': {
        const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('⚙️ Settings')
          .addFields(
            { name: '🤖 Provider', value: user.aiProvider, inline: true },
            { name: '🧠 Model', value: user.aiModel, inline: true },
            { name: '🎭 Persona', value: user.persona, inline: true },
            { name: '🌡️ Temperature', value: String(user.temperature), inline: true },
            { name: '💬 Context', value: user.contextEnabled ? '✅ ON' : '❌ OFF', inline: true },
          );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('toggle_context').setLabel('Toggle Context').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('toggle_memory').setLabel('Toggle Memory').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        break;
      }
    }
  }

  async _handleButton(interaction) {
    const userId = `discord:${interaction.user.id}`;
    if (interaction.customId === 'toggle_context') {
      const user = await userService.get(userId);
      await userService.update(userId, { contextEnabled: !user.contextEnabled });
      await interaction.reply({ content: `Context ${!user.contextEnabled ? 'enabled' : 'disabled'}`, ephemeral: true });
    }
    if (interaction.customId === 'toggle_memory') {
      const user = await userService.get(userId);
      await userService.update(userId, { memoryEnabled: !user.memoryEnabled });
      await interaction.reply({ content: `Memory ${!user.memoryEnabled ? 'enabled' : 'disabled'}`, ephemeral: true });
    }
  }

  async _handleSelect(interaction) {
    const userId = `discord:${interaction.user.id}`;
    if (interaction.customId === 'select_provider') {
      const provider = interaction.values[0];
      const models = aiService.getModelsForProvider(provider);
      const select = new StringSelectMenuBuilder()
        .setCustomId(`select_model_${provider}`)
        .setPlaceholder('Choose Model')
        .addOptions(models.map(m => ({ label: m, value: `${provider}:${m}` })));
      const row = new ActionRowBuilder().addComponents(select);
      await interaction.update({ content: `🧠 Select Model for ${provider.toUpperCase()}:`, components: [row] });
    }
    if (interaction.customId.startsWith('select_model_')) {
      const [provider, model] = interaction.values[0].split(':');
      await userService.setProvider(userId, provider, model);
      await interaction.update({ content: `✅ Switched to **${provider.toUpperCase()}** / **${model}**`, components: [] });
    }
    if (interaction.customId === 'select_persona') {
      await userService.setPersona(userId, interaction.values[0]);
      await interaction.update({ content: `✅ Persona set to **${interaction.values[0]}**`, components: [] });
    }
  }

  async _processMessage(message, text, user, userId, chatId) {
    try {
      let systemPrompt = user.systemPrompt || '';
      const messages = user.contextEnabled
        ? await contextService.getMessages(userId, chatId, systemPrompt)
        : (systemPrompt ? [{ role: 'system', content: systemPrompt }] : []);

      messages.push({ role: 'user', content: text });

      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel, messages,
        maxTokens: user.maxTokens, temperature: user.temperature,
      });

      const chunks = chunkText(result.content, 2000);
      for (const chunk of chunks) {
        const embed = new EmbedBuilder().setColor(COLORS.primary).setDescription(chunk)
          .setFooter({ text: `${user.aiProvider} / ${user.aiModel}` });
        await message.reply({ embeds: [embed] });
      }

      if (user.contextEnabled) {
        await contextService.addMessage(userId, chatId, 'user', text);
        await contextService.addMessage(userId, chatId, 'assistant', result.content, { provider: user.aiProvider, model: user.aiModel });
      }
      await userService.incrementUsage(userId, result.tokensUsed || 0);
    } catch (err) {
      await message.reply(`❌ ${err.message}`);
    }
  }

  async _processInteractionMessage(interaction, text, user, userId, chatId) {
    try {
      const messages = user.contextEnabled
        ? await contextService.getMessages(userId, chatId, user.systemPrompt || '')
        : [];
      messages.push({ role: 'user', content: text });

      const result = await aiService.chat({
        provider: user.aiProvider, model: user.aiModel, messages,
        maxTokens: user.maxTokens, temperature: user.temperature,
      });

      const chunks = chunkText(result.content, 2000);
      const embed = new EmbedBuilder().setColor(COLORS.primary).setDescription(chunks[0])
        .setFooter({ text: `${user.aiProvider} / ${user.aiModel}` });
      await interaction.editReply({ embeds: [embed] });

      for (let i = 1; i < chunks.length; i++) {
        const e = new EmbedBuilder().setColor(COLORS.primary).setDescription(chunks[i]);
        await interaction.followUp({ embeds: [e] });
      }

      if (user.contextEnabled) {
        await contextService.addMessage(userId, chatId, 'user', text);
        await contextService.addMessage(userId, chatId, 'assistant', result.content, { provider: user.aiProvider, model: user.aiModel });
      }
      await userService.incrementUsage(userId, result.tokensUsed || 0);
    } catch (err) {
      await interaction.editReply(`❌ ${err.message}`);
    }
  }

  registerReminderDispatcher() {
    reminderService.registerDispatcher('discord', async (channelId, text) => {
      const channel = await this.client.channels.fetch(channelId);
      await channel?.send(text);
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
