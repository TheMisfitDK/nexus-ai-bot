// src/index.js — NexusAI Bot Entry Point
// Owner: TheMisfitDK (https://github.com/TheMisfitDK)
require('dotenv').config();

const mongoose = require('mongoose');
const config = require('../config');
const logger = require('./utils/logger');
const { startServer } = require('./server');
const reminderService = require('./services/ReminderService');

const banner = `
╔═══════════════════════════════════════════╗
║          NEXUS AI BOT  v2.0.0             ║
║   Multi-Platform • Multi-Provider AI      ║
║   by TheMisfitDK — github.com/TheMisfitDK ║
╚═══════════════════════════════════════════╝
`;

async function main() {
  console.log(banner);
  logger.info('🚀 Starting NexusAI Bot...');

  // Connect MongoDB
  try {
    await mongoose.connect(config.db.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('✅ MongoDB connected');
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  // Start web server (required for Heroku/Railway port binding)
  startServer();

  // Start Telegram bot
  if (config.platforms.telegram.enabled) {
    try {
      const telegramBot = require('./handlers/telegram');
      await telegramBot.launch();
    } catch (err) {
      logger.error(`Telegram launch error: ${err.message}`);
    }
  }

  // Start Discord bot
  if (config.platforms.discord.enabled) {
    try {
      const discordBot = require('./handlers/discord');
      await discordBot.launch();
    } catch (err) {
      logger.error(`Discord launch error: ${err.message}`);
    }
  }

  // Start reminder service
  reminderService.start();

  logger.info('🌟 NexusAI Bot fully operational!');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err.message}`, { stack: err.stack });
});

main().catch(err => {
  logger.error(`Fatal error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
