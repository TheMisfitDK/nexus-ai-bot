// src/server.js — Express web server, health check, admin dashboard API
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('../config');
const logger = require('./utils/logger');
const userService = require('./services/UserService');
const { Analytics } = require('./models');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Health check (for Heroku/Railway) ──────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// ── Admin API ───────────────────────────────────────────────
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== config.security.jwtSecret) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

app.get('/api/stats', adminAuth, async (req, res) => {
  try {
    const User = require('./models/User');
    const [totalUsers, authorizedUsers, bannedUsers, topUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isAuthorized: true }),
      User.countDocuments({ isBanned: true }),
      userService.getTopUsers(5),
    ]);

    res.json({
      users: { total: totalUsers, authorized: authorizedUsers, banned: bannedUsers },
      topUsers: topUsers.map(u => ({
        userId: u.userId,
        username: u.username || 'Unknown',
        messages: u.totalMessages,
        tokenBalance: u.tokenBalance,
        isAuthorized: u.isAuthorized,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/broadcast', adminAuth, async (req, res) => {
  const { message, platform } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  // Delegate to platform handlers
  res.json({ status: 'queued', message });
});

app.post('/api/users/:userId/ban', adminAuth, async (req, res) => {
  const { reason } = req.body;
  await userService.ban(req.params.userId, reason);
  res.json({ success: true });
});

app.post('/api/users/:userId/authorize', adminAuth, async (req, res) => {
  const { tokens } = req.body;
  const user = await userService.authorizeUser(req.params.userId, tokens ?? config.app.defaultTokenGrant);
  res.json({ success: true, tokenBalance: user.tokenBalance });
});

function startServer() {
  const port = config.app.port;
  app.listen(port, () => {
    logger.info(`🌐 Web server running on port ${port}`);
  });
}

module.exports = { app, startServer };
