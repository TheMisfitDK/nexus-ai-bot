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

NexusAI is a production-ready AI chatbot running on **Telegram** and **Discord** simultaneously. Abstracts 12+ AI providers behind one interface — switch GPT-4o → Claude → Gemini → LLaMA mid-conversation with `/model`. All history, settings, and preferences persist in MongoDB.

**Key design:** bot only responds when explicitly called via `/nexus <query>` in groups/servers, keeping channels clean. DMs and @mentions always work.

Deploys anywhere: Railway, Heroku, Render, Docker, VPS.

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
- **Hot-swap providers** — change model mid-conversation with `/model`; fetches **live model list** from provider API on every click
- **Live model detection** — `modelRegistry` queries each provider's API at runtime; 1-hour cache, falls back to static list on error
- **12 AI Personas** — Teacher, Coder, Creative, Analyst, Therapist, Comedian, Scientist, Chef, Lawyer, Finance, and more
- **Custom system prompts** — per-user, persistent across sessions
- **Temperature control** — tune from deterministic to creative (`/temp 0.0–2.0`)
- **Token budget** — configurable max tokens per response (`/tokens 100–8000`)

### 🛠️ Tools
- **Image generation** — Stability AI, DALL-E 3, FLUX via Together/fal.ai, HuggingFace — via `/image`
- **Vision / image analysis** — send any photo; supports OpenAI, Grok, Google Gemini, **and Anthropic Claude** vision
- **Voice transcription** — send voice messages; Whisper transcribes + passes to AI. Falls back to **Groq Whisper** if no OpenAI key
- **File analysis** — PDF, DOCX, TXT, CSV, JSON, and code files. Correct MIME detection for all types
- **Video note transcription** (Telegram) — circle video audio extracted and transcribed
- **Discord voice messages** — native Discord voice message attachments transcribed automatically
- **Translation** — any language pair via `/translate`
- **Smart reminders** — natural language time parsing (`in 30 minutes`, `tomorrow 9am`)
- **Notes** — save and list notes per user
- **Conversation export** — full history as Markdown or JSON

### 🔒 Group Chat Design
- **Telegram groups** — bot ignores all plain text; only responds to `/nexus <query>` and media (photos, voice, files)
- **Discord servers** — bot ignores all channel messages; only responds to `/nexus`, other slash commands, or explicit @mentions
- **DMs always work** — private chats respond to freeform text normally
- Eliminates accidental triggers and token waste in busy servers

### 👤 Account & Access
- **Token-based access control** — owner grants token balances to users
- **Usage statistics** — message count, tokens used, tokens granted, member since
- **Context toggle** — disable history for stateless queries
- **Memory mode** — AI remembers long-term preferences across conversations
- **Per-user settings** — provider, model, persona, temperature, system prompt all persist

### 👑 Admin (Owner Only)
- **Authorize / deauthorize** users with token grants
- **Add tokens** to any user
- **List authorized users** with balances and message counts
- **Broadcast** announcements to all users (Telegram)
- **Ban / unban** users
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
GROQ_API_KEY=             # free at console.groq.com — default provider
BOT_OWNER_ID=             # your Telegram numeric user ID
DISCORD_OWNER_ID=         # your Discord numeric user ID
```

**Default provider is Groq** (free). To switch: set `DEFAULT_PROVIDER=openai` + `OPENAI_API_KEY=...`.

**Voice transcription** uses OpenAI Whisper if `OPENAI_API_KEY` is set, falls back to Groq Whisper if only `GROQ_API_KEY` is set.

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
heroku addons:create mongolab:sandbox
heroku config:set TELEGRAM_BOT_TOKEN=your_token   # repeat for all vars
git push heroku main
```

### Render
Connect GitHub repo → Render auto-reads `render.yaml` → set env vars → deploy.

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

> In **groups**, use `/nexus <query>` to chat. All other text is ignored.  
> In **DMs**, send any text directly.

| Command | Description |
|---|---|
| `/nexus <query>` | **Chat with AI — works in groups and DMs** |
| `/start` | Welcome message + status |
| `/help` | Full command reference |
| `/model` | Switch AI provider & model — fetches live models from API on click |
| `/persona` | Set AI personality (12 options) |
| `/system <prompt>` | Set custom system instruction |
| `/temp <0.0–2.0>` | Adjust response randomness |
| `/tokens <100–8000>` | Set max response tokens |
| `/new` | Start fresh conversation |
| `/clear` | Clear context history |
| `/summarize` | Summarize current chat |
| `/export [json]` | Download conversation as Markdown or JSON |
| `/translate <lang> <text>` | Translate text |
| `/image <prompt>` | Generate image |
| `/imgprovider` | Switch image generation provider |
| `/remind <time> <message>` | Set reminder (`in 30 minutes`, `tomorrow 9am`) |
| `/reminders` | List upcoming reminders |
| `/note <text>` | Save a note |
| `/notes` | View saved notes |
| `/stats` | Usage stats + token balance |
| `/settings` | Settings menu (inline) |
| `/feedback <text>` | Send feedback |

**Owner only:** `/auth <id> [tokens]`, `/deauth <id>`, `/addtokens <id> <amount>`, `/authed`, `/broadcast <msg>`, `/ban <id>`, `/unban <id>`

**Also works:** send photos (vision analysis), voice messages (transcription → AI reply), video notes (transcription → AI reply), documents (PDF/DOCX/TXT/CSV/JSON/code analysis).

---

## 🎮 Discord Slash Commands

> In **servers**, use `/nexus <query>` or any slash command. Plain messages ignored unless you @mention the bot.  
> In **DMs** and **@mentions**, bot always responds.

| Command | Description |
|---|---|
| `/nexus <query>` | **Chat with AI — works in any channel** |
| `/chat <message>` | Chat with conversation context |
| `/ask <question>` | Single question, no context |
| `/model` | Switch AI provider/model — fetches live models from API on click |
| `/persona` | Set AI personality |
| `/system <prompt>` | Set custom system prompt |
| `/temp <value>` | Set temperature 0.0–2.0 |
| `/new` | Start new conversation |
| `/clear` | Clear history |
| `/summarize` | Summarize conversation |
| `/export [format]` | Export as Markdown or JSON file |
| `/image <prompt> [provider]` | Generate image |
| `/translate <language> <text>` | Translate text |
| `/remind <time> <message>` | Set reminder |
| `/reminders` | List reminders |
| `/note <content>` | Save note |
| `/notes` | View notes |
| `/stats` | Usage statistics |
| `/settings` | Settings (buttons) |
| `/feedback <message>` | Send feedback |
| `/help` | Show help |

**Owner only:** `/authorize <user_id> [tokens]`, `/deauthorize <user_id>`, `/addtokens <user_id> <amount>`, `/authed`

**Also works via @mention or DM:** attach images (vision analysis), audio/voice messages (transcription → AI reply), files (PDF/DOCX/TXT/CSV/JSON/code analysis).

---

## 🖼️ Vision Provider Fallback

Image analysis tries providers in this order:
1. User's configured provider (if vision-capable)
2. OpenAI (`gpt-4o`)
3. Grok (`grok-2-vision-1212`)
4. Google Gemini (`gemini-1.5-flash`)
5. Anthropic Claude (`claude-haiku-4-5`)

At least one of `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`, or `GROK_API_KEY` required for vision.

---

## 🏗️ Architecture

```
nexus-ai-bot/
├── src/
│   ├── index.js                  # Boot: DB + platforms + services
│   ├── server.js                 # Express web server + admin API
│   ├── handlers/
│   │   ├── telegram.js           # Telegraf bot — commands, media, callbacks
│   │   └── discord.js            # Discord.js bot — slash, buttons, selects, media
│   ├── services/
│   │   ├── AIService.js          # Unified abstraction over 12+ providers
│   │   ├── ContextService.js     # Conversation history, summarize, export
│   │   ├── UserService.js        # User CRUD, token balance, stats, memory
│   │   └── ReminderService.js    # node-cron scheduler, natural language parser
│   ├── models/
│   │   ├── User.js               # Mongoose user schema + access logic
│   │   └── index.js              # Conversation, Reminder, Note, Feedback
│   └── utils/
│       ├── logger.js             # Winston structured logging
│       ├── formatter.js          # Text chunking, escaping, truncation
│       ├── imageUtils.js         # Vision: OpenAI / Grok / Google / Anthropic
│       ├── audioUtils.js         # Whisper transcription: OpenAI + Groq fallback
│       ├── fileUtils.js          # PDF (pdf-parse), DOCX (mammoth), CSV, JSON
│       └── modelRegistry.js      # Live model fetcher per provider + 1hr cache
├── config/
│   └── index.js                  # Central config from env vars
├── public/
│   └── dashboard.html            # Admin status dashboard
├── .env.example
├── Procfile                      # Heroku
├── railway.json                  # Railway
├── render.yaml                   # Render
└── Dockerfile
```

---

## 🔧 Configuration Reference

| Variable | Required | Description |
|---|:---:|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `DISCORD_BOT_TOKEN` | ✅ | Discord Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ | Discord Developer Portal, Application ID |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `BOT_OWNER_ID` | ✅ | Telegram numeric user ID (admin commands) |
| `DISCORD_OWNER_ID` | ✅ | Discord numeric user ID (admin commands) |
| `DEFAULT_PROVIDER` | — | Default AI provider (default: `groq`) |
| `DEFAULT_MODEL` | — | Default model (default: `llama-3.3-70b-versatile`) |
| `IMAGE_GEN_PROVIDER` | — | Default image provider (default: `stability`) |
| `DEFAULT_TOKEN_GRANT` | — | Tokens granted on `/auth` (default: `10000`) |
| `AUTHORIZED_USERS` | — | Pre-authorize on boot: `telegram:123:5000,discord:456:10000` |
| `GROQ_API_KEY` | — | Free at console.groq.com — default provider + Whisper fallback |
| `OPENAI_API_KEY` | — | OpenAI GPT + Whisper transcription |
| `ANTHROPIC_API_KEY` | — | Claude models + vision |
| `GOOGLE_AI_API_KEY` | — | Gemini models + vision |
| `XAI_API_KEY` | — | xAI Grok models + vision |
| `STABILITY_API_KEY` | — | Stability AI image generation |
| `TOGETHER_API_KEY` | — | Together AI models + FLUX images |
| `MISTRAL_API_KEY` | — | Mistral models |
| `DEEPSEEK_API_KEY` | — | DeepSeek models |
| `PERPLEXITY_API_KEY` | — | Perplexity Sonar (web search) |
| `HUGGINGFACE_API_KEY` | — | HuggingFace models + images |
| `COHERE_API_KEY` | — | Cohere Command models |
| `NVIDIA_API_KEY` | — | NVIDIA NIM models |
| `ENABLE_TELEGRAM` | — | Set `false` to disable (default: `true`) |
| `ENABLE_DISCORD` | — | Set `false` to disable (default: `true`) |
| `LOG_LEVEL` | — | Winston log level (default: `info`) |
| `JWT_SECRET` | — | Secret for web dashboard auth |

---

## 📄 License

MIT © [TheMisfitDK](https://github.com/TheMisfitDK)

---

<div align="center">
<sub>⚡ NexusAI — Built to last, built to scale</sub>
</div>
