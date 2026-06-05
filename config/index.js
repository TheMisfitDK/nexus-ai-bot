// config/index.js — Central config loader
require('dotenv').config();

module.exports = {
  app: {
    name: process.env.BOT_NAME || 'NexusAI',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    ownerIdTelegram: process.env.BOT_OWNER_ID,
    ownerIdDiscord: process.env.DISCORD_OWNER_ID,
    isDev: process.env.NODE_ENV !== 'production',
  },

  platforms: {
    telegram: {
      enabled: process.env.ENABLE_TELEGRAM !== 'false',
      token: process.env.TELEGRAM_BOT_TOKEN,
    },
    discord: {
      enabled: process.env.ENABLE_DISCORD !== 'false',
      token: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
    },
  },

  db: {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nexus-ai-bot',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  ai: {
    defaultProvider: process.env.DEFAULT_PROVIDER || 'openai',
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o-mini',
    defaultMaxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 2048,
    defaultTemperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7,

    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o1-preview'],
        free: false,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
        free: false,
      },
      google: {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemma-2-9b-it', 'gemma-2-27b-it'],
        free: true,
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        free: true,
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'],
        free: false,
        baseUrl: 'https://api.deepseek.com/v1',
      },
      nvidia: {
        apiKey: process.env.NVIDIA_API_KEY,
        models: ['nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.1-405b-instruct', 'mistralai/mistral-large'],
        free: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
      grok: {
        apiKey: process.env.XAI_API_KEY,
        models: ['grok-2-1212', 'grok-2-vision-1212', 'grok-beta'],
        free: false,
        baseUrl: 'https://api.x.ai/v1',
      },
      mistral: {
        apiKey: process.env.MISTRAL_API_KEY,
        models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest', 'open-mistral-nemo'],
        free: false,
        baseUrl: 'https://api.mistral.ai/v1',
      },
      together: {
        apiKey: process.env.TOGETHER_API_KEY,
        models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
        free: false,
        baseUrl: 'https://api.together.xyz/v1',
      },
      perplexity: {
        apiKey: process.env.PERPLEXITY_API_KEY,
        models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online'],
        free: false,
        baseUrl: 'https://api.perplexity.ai',
      },
      huggingface: {
        apiKey: process.env.HUGGINGFACE_API_KEY,
        models: ['microsoft/Phi-3-mini-4k-instruct', 'HuggingFaceH4/zephyr-7b-beta'],
        free: true,
        baseUrl: 'https://api-inference.huggingface.co/models',
      },
      cohere: {
        apiKey: process.env.COHERE_API_KEY,
        models: ['command-r-plus-08-2024', 'command-r-08-2024', 'command-light'],
        free: false,
        baseUrl: 'https://api.cohere.ai/v1',
      },
    },
  },

  limits: {
    freeDailyMessages: parseInt(process.env.FREE_DAILY_MESSAGES) || 50,
    proDailyMessages: parseInt(process.env.PRO_DAILY_MESSAGES) || 1000,
    maxContextMessages: 50,
    maxFileSize: 20 * 1024 * 1024, // 20MB
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
  },

  features: {
    imageGen: process.env.ENABLE_IMAGE_GEN !== 'false',
    tts: process.env.ENABLE_TTS !== 'false',
    voice: process.env.ENABLE_VOICE !== 'false',
    plugins: process.env.ENABLE_PLUGINS !== 'false',
    webSearch: true,
    codeExec: true,
    fileAnalysis: true,
    imageAnalysis: true,
    reminders: true,
    summarize: true,
    translate: true,
    personas: true,
    stats: true,
    export: true,
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'change_this_in_production',
    encryptionKey: process.env.ENCRYPTION_KEY || 'change_this_32_char_key_in_prod!',
  },

  payments: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    toDB: process.env.LOG_TO_DB === 'true',
  },
};
