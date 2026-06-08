<div align="center">

<img src="https://img.shields.io/badge/⚡-NexusAI_Bot-7c6af5?style=for-the-badge&labelColor=0a0a0f" />

**Feature-rich, multi-platform AI chatbot for Telegram & Discord**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-6+-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?style=flat-square&logo=telegram&logoColor=white)](https://telegram.org)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square)](LICENSE)
[![Deploy on Railway](https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=flat-square&logo=railway)](https://railway.app)

**by [TheMisfitDK](https://github.com/TheMisfitDK)**

</div>

---

## What is NexusAI?

NexusAI is a production-ready AI chatbot that runs on both **Telegram** and **Discord** simultaneously. It abstracts 12+ AI providers behind a single clean interface — switch from GPT-4o to Claude to Gemini to LLaMA with one command, mid-conversation. All history, settings, and preferences persist in MongoDB.

Built to deploy anywhere: Railway, Heroku, Render, Docker, or any VPS.

---

## 🤖 AI Providers

| Provider | Models | Tier |
|---|---|:---:|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-Turbo, GPT-3.5-Turbo | 💳 |
| **Anthropic** | Claude Opus 4.5, Sonnet 4.5, Haiku 3.5 | 💳 |
| **Google** | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash | 🆓 |
| **Groq** | LLaMA 3.3 70B, LLaMA 3.1 8B, Mixtral 8x7B, Gemma2 9B | 🆓 |
| **NVIDIA NIM** | LLaMA 3.1 405B, Nemotron 70B, Mistral Large | 🆓 |
| **DeepSeek** | DeepSeek Chat, Reasoner, Coder | 💳 |
| **xAI Grok** | Grok-2, Grok-2-Vision | 💳 |
| **Mistral AI** | Mistral Large, Codestral, Nemo | 💳 |
| **Together AI** | LLaMA, Qwen 2.5 72B, 100+ models | 💳 |
| **Perplexity** | Sonar Large/Small (live web search) | 💳 |
| **HuggingFace** | Phi-3, Zephyr, thousands more | 🆓 |
| **Cohere** | Command R+, Command R | 💳 |

> 🆓 = free tier available · 💳 = paid API key required

---

## ✨ Features

### 🧠 AI Core
- **Streaming responses** — real-time typewriter output on both platforms
- **Conversation memory** — full context window, persisted to MongoDB
- **Hot-swap providers** — change model mid-conversation with `/model`
- **10 AI Personas** — Teacher, Coder, Creative, Analyst, Therapist, Chef, and more
- **Custom system prompts** — per-user, persistent across sessions
- **Temperature control** — tune from deterministic to creative (`/temp 0.0–2.0`)
- **Token budget** — configurable max tokens per response

### 🛠️ Tools
- **Image generation** — Stability AI (SD3/SDXL), DALL-E 3, FLUX via Together/fal.ai, HuggingFace — prompt via `/image`
- **Vision / image analysis** — send any photo for AI description
- **Voice transcription** — send voice messages, Whisper transcribes + replies
- **File analysis** — upload PDF, DOCX, TXT, CSV, or code files for AI analysis
- **Translation** — any language pair via `/translate`
- **Smart reminders** — natural language time parsing ("in 30 minutes", "tomorrow 9am"), recurring support
- **Notes** — save, list, pin notes per user
- **Conversation export** — download full history as Markdown or JSON

### 👤 Account & Plans
- **Free / Pro / Enterprise** tiers with daily message limits
- **Referral system** — unique codes, track invite count
- **Usage statistics** — message count, token usage, plan info
- **Context toggle** — disable history for stateless queries
- **Memory mode** — AI remembers long-term preferences across conversations

### 👑 Admin
- **Broadcast** — send announcements to all users
- **Ban / unban** users with reason
- **Upgrade users** to Pro (specify days)
- **Web dashboard** — real-time status at `/` with uptime + stats

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or [MongoDB Atlas free tier](https://www.mongodb.com/cloud/atlas))
- At least one AI provider API key

### 1. Clone & install
```bash
git clone https://github.com/TheMisfitDK/nexus-ai-bot
cd nexus-ai-bot
npm install
```

### 2. Configure
```bash
cp .env.example .env
```

Minimum `.env` to get running:
```env
TELEGRAM_BOT_TOKEN=       # @BotFather → /newbot
DISCORD_BOT_TOKEN=        # discord.com/developers → New Application → Bot
DISCORD_CLIENT_ID=        # same portal, Application ID
MONGODB_URI=              # mongodb+srv://... (Atlas free works)
GROQ_API_KEY=             # free at console.groq.com — used by default
BOT_OWNER_ID=             # your Telegram numeric user ID
DISCORD_OWNER_ID=         # your Discord numeric user ID
```

**Default provider is Groq** (free). To switch: set `DEFAULT_PROVIDER=openai` + `OPENAI_API_KEY=...`.

### 3. Run
```bash
npm start        # production
npm run dev      # development with auto-reload
```

---

## ☁️ Deployment

### Railway *(recommended — one click)*
1. Fork this repo
2. Create new project at [railway.app](https://railway.app) → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Railway auto-detects Node.js, uses `railway.json` config

### Heroku
```bash
heroku create your-bot-name
heroku addons:create mongolab:sandbox   # free MongoDB
heroku config:set TELEGRAM_BOT_TOKEN=your_token   # repeat for all vars
git push heroku main
```

### Render
- Connect GitHub repo → Render auto-reads `render.yaml`
- Set env vars in Render dashboard → deploy

### Docker
```bash
docker build -t nexus-ai-bot .
docker run -d --env-file .env -p 3000:3000 nexus-ai-bot
```

### VPS / Ubuntu
```bash
npm install -g pm2
pm2 start src/index.js --name nexus-ai-bot
pm2 save && pm2 startup
```

---

## 📱 Telegram Commands

| Command | Description |
|---|---|
| `/start` | Welcome, onboarding |
| `/help` | Full command reference |
| `/model` | Switch AI provider & model |
| `/persona` | Set AI personality |
| `/system <prompt>` | Set custom system instruction |
| `/temp <0.0–2.0>` | Adjust response randomness |
| `/new` | Start fresh conversation |
| `/clear` | Clear context history |
| `/summarize` | Summarize current chat |
| `/export [json]` | Download conversation |
| `/translate <lang> <text>` | Translate text |
| `/image <prompt>` | Generate image |
| `/remind <time> <message>` | Set reminder |
| `/reminders` | List upcoming reminders |
| `/note <text>` | Save a note |
| `/notes` | View saved notes |
| `/stats` | Usage statistics |
| `/settings` | Settings menu |
| `/feedback <text>` | Send feedback |
| `/referral` | Referral link & code |

**Admin only:** `/broadcast`, `/ban`, `/unban`

**Also works:** Send photos (vision), voice messages (transcription), documents (file analysis).

---

## 🎮 Discord Slash Commands

All features available as slash commands: `/chat`, `/ask`, `/model`, `/persona`, `/system`, `/temp`, `/new`, `/clear`, `/summarize`, `/export`, `/translate`, `/image`, `/remind`, `/reminders`, `/note`, `/notes`, `/stats`, `/settings`, `/feedback`, `/help`.

Bot also responds to:
- **@mentions** in any channel
- **DMs** (always active)
- Any channel named `#ai-*` or `#chat-*` (auto-detected)

---

## 🏗️ Architecture

```
nexus-ai-bot/
├── src/
│   ├── index.js                  # Boot: DB + platforms + services
│   ├── server.js                 # Express web server + admin API
│   ├── handlers/
│   │   ├── telegram.js           # Full Telegraf bot (commands, media, callbacks)
│   │   └── discord.js            # Full Discord.js bot (slash, buttons, selects)
│   ├── services/
│   │   ├── AIService.js          # Unified abstraction over 12 providers
│   │   ├── ContextService.js     # Conversation history + summarize + export
│   │   ├── UserService.js        # User CRUD, plans, stats, memory
│   │   └── ReminderService.js    # node-cron scheduler, natural lang parser
│   ├── models/
│   │   ├── User.js               # Mongoose user schema + plan logic
│   │   └── index.js              # Conversation, Reminder, Note, Analytics, Feedback
│   └── utils/
│       ├── logger.js             # Winston structured logging
│       ├── formatter.js          # Text chunking, escaping, truncation
│       ├── imageUtils.js         # Vision (GPT-4o) + DALL-E 3 generation
│       ├── audioUtils.js         # Whisper transcription
│       └── fileUtils.js          # PDF (pdf-parse), DOCX (mammoth) extraction
├── config/
│   └── index.js                  # Central config from env vars
├── public/
│   └── dashboard.html            # Admin status dashboard (dark, premium UI)
├── .env.example                  # All env vars documented
├── .gitignore
├── Procfile                      # Heroku
├── railway.json                  # Railway
├── render.yaml                   # Render
└── Dockerfile                    # Docker + healthcheck
```

---

## 🔧 Configuration Reference

Key `.env` variables:

| Variable | Required | Description |
|---|:---:|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `DISCORD_BOT_TOKEN` | ✅ | Discord Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Discord Developer Portal, Application ID |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `DEFAULT_PROVIDER` | — | Default AI provider (default: `groq`) |
| `DEFAULT_MODEL` | — | Default model (default: `llama-3.3-70b-versatile`) |
| `IMAGE_GEN_PROVIDER` | — | Default image provider (default: `stability`) |
| `FREE_DAILY_MESSAGES` | — | Daily limit for free users (default: `50`) |
| `PRO_DAILY_MESSAGES` | — | Daily limit for Pro (default: `1000`) |
| `BOT_OWNER_ID` | — | Telegram ID for admin commands |
| `DISCORD_OWNER_ID` | — | Discord ID for admin commands |
| `TELEGRAM_API_ID` | — | MTProto userbot (optional, from my.telegram.org) |
| `TELEGRAM_API_HASH` | — | MTProto userbot (optional) |
| `TELEGRAM_SESSION_STRING` | — | MTProto session (optional) |
| `ENABLE_TELEGRAM` | — | Set `false` to disable (default: `true`) |
| `ENABLE_DISCORD` | — | Set `false` to disable (default: `true`) |
| `JWT_SECRET` | — | Secret for web dashboard auth |
| `LOG_LEVEL` | — | Winston log level (default: `info`) |

See `.env.example` for full list.

---

## 📄 License

MIT © [TheMisfitDK](https://github.com/TheMisfitDK)

---

<div align="center">
<sub>⚡ NexusAI — Built to last, built to scale</sub>
</div>
