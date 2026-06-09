// config/index.js — NexusAI Central Config
// Owner: TheMisfitDK — github.com/TheMisfitDK
require('dotenv').config();

// Helper to prevent API key 401 errors from spaces/quotes in .env
function cleanKey(key) {
  if (!key) return undefined;
  return key.trim().replace(/['"]/g, '');
}

// Parse pre-authorized users from env
function parseAuthorizedUsers() {
  const raw = process.env.AUTHORIZED_USERS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map(entry => {
    const parts = entry.trim().split(':');
    if (parts.length < 2) return null;
    return {
      platform: parts[0],
      userId: parts[1],
      tokens: parts[2] ? parseInt(parts[2]) : null,
    };
  }).filter(Boolean);
}

module.exports = {
  app: {
    name: process.env.BOT_NAME || 'NexusAI',
    version: '3.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    ownerIdTelegram: process.env.BOT_OWNER_ID,
    ownerIdDiscord: process.env.DISCORD_OWNER_ID,
    isDev: process.env.NODE_ENV !== 'production',
    defaultTokenGrant: parseInt(process.env.DEFAULT_TOKEN_GRANT) || 10000,
    preAuthorizedUsers: parseAuthorizedUsers(),
  },

  platforms: {
    telegram: {
      enabled: process.env.ENABLE_TELEGRAM !== 'false',
      token: process.env.TELEGRAM_BOT_TOKEN,
      apiId: process.env.TELEGRAM_API_ID ? parseInt(process.env.TELEGRAM_API_ID) : null,
      apiHash: process.env.TELEGRAM_API_HASH || null,
      sessionString: process.env.TELEGRAM_SESSION_STRING || null,
      userbotEnabled: !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
    },
    discord: {
      enabled: process.env.ENABLE_DISCORD !== 'false',
      token: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
    },
  },

  db: {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nexus-ai-bot',
  },

  ai: {
    defaultProvider: process.env.DEFAULT_PROVIDER || 'groq',
    defaultModel: process.env.DEFAULT_MODEL || 'llama-3.3-70b-versatile',
    defaultMaxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 2048,
    defaultTemperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7,

    providers: {
      openai: {
        apiKey: cleanKey(process.env.OPENAI_API_KEY),
        defaultModel: 'gpt-4o',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        free: false,
      },
      anthropic: {
        apiKey: cleanKey(process.env.ANTHROPIC_API_KEY),
        defaultModel: 'claude-sonnet-4-5',
        models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
        free: false,
      },
      google: {
        apiKey: cleanKey(process.env.GOOGLE_AI_API_KEY),
        defaultModel: 'gemini-2.0-flash',
        models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        free: true,
      },
      groq: {
        apiKey: cleanKey(process.env.GROQ_API_KEY),
        defaultModel: 'llama-3.3-70b-versatile',
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        free: true,
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      deepseek: {
        apiKey: cleanKey(process.env.DEEPSEEK_API_KEY),
        defaultModel: 'deepseek-chat',
        models: ['deepseek-chat', 'deepseek-reasoner'],
        free: false,
        baseUrl: 'https://api.deepseek.com/v1',
      },
      nvidia: {
        apiKey: cleanKey(process.env.NVIDIA_API_KEY),
        defaultModel: 'meta/llama-3.3-70b-instruct',
        models: [
          'meta/llama-3.3-70b-instruct',
          'meta/llama-3.1-8b-instruct',
          'mistralai/mistral-7b-instruct-v0.3',
          'microsoft/phi-3-mini-128k-instruct',
        ],
        free: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
      grok: {
        apiKey: cleanKey(process.env.XAI_API_KEY),
        defaultModel: 'grok-2-1212',
        models: ['grok-2-1212', 'grok-beta'],
        free: false,
        baseUrl: 'https://api.x.ai/v1',
      },
      mistral: {
        apiKey: cleanKey(process.env.MISTRAL_API_KEY),
        defaultModel: 'mistral-large-latest',
        models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'],
        free: false,
        baseUrl: 'https://api.mistral.ai/v1',
      },
      together: {
        apiKey: cleanKey(process.env.TOGETHER_API_KEY),
        defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        models: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
        free: false,
        baseUrl: 'https://api.together.xyz/v1',
      },
      perplexity: {
        apiKey: cleanKey(process.env.PERPLEXITY_API_KEY),
        defaultModel: 'llama-3.1-sonar-large-128k-online',
        models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online'],
        free: false,
        baseUrl: 'https://api.perplexity.ai',
      },
      huggingface: {
        apiKey: cleanKey(process.env.HUGGINGFACE_API_KEY),
        defaultModel: 'HuggingFaceH4/zephyr-7b-beta',
        models: ['microsoft/Phi-3-mini-4k-instruct', 'HuggingFaceH4/zephyr-7b-beta'],
        free: true,
        baseUrl: 'https://api-inference.huggingface.co/models',
      },
      cohere: {
        apiKey: cleanKey(process.env.COHERE_API_KEY),
        defaultModel: 'command-r-plus-08-2024',
        models: ['command-r-plus-08-2024', 'command-r-08-2024'],
        free: false,
        baseUrl: 'https://api.cohere.ai/v1',
      },
    },
  },

  imageGen: {
    defaultProvider: process.env.IMAGE_GEN_PROVIDER || 'stability',
    providers: {
      dalle: {
        apiKey: cleanKey(process.env.OPENAI_API_KEY),
        models: ['dall-e-3', 'dall-e-2'],
        enabled: !!cleanKey(process.env.OPENAI_API_KEY),
      },
      stability: {
        apiKey: cleanKey(process.env.STABILITY_API_KEY),
        models: ['stable-diffusion-3-5-large', 'stable-image-core', 'stable-image-ultra'],
        enabled: !!cleanKey(process.env.STABILITY_API_KEY),
        baseUrl: 'https://api.stability.ai',
      },
      together: {
        apiKey: cleanKey(process.env.TOGETHER_API_KEY),
        models: ['black-forest-labs/FLUX.1-schnell-Free', 'black-forest-labs/FLUX.1.1-pro'],
        enabled: !!cleanKey(process.env.TOGETHER_API_KEY),
        baseUrl: 'https://api.together.xyz/v1',
      },
      huggingface: {
        apiKey: cleanKey(process.env.HUGGINGFACE_API_KEY),
        models: ['stabilityai/stable-diffusion-xl-base-1.0', 'runwayml/stable-diffusion-v1-5'],
        enabled: !!cleanKey(process.env.HUGGINGFACE_API_KEY),
        baseUrl: 'https://api-inference.huggingface.co/models',
      },
      fal: {
        apiKey: cleanKey(process.env.FAL_API_KEY),
        models: ['fal-ai/flux/schnell', 'fal-ai/flux-realism'],
        enabled: !!cleanKey(process.env.FAL_API_KEY),
        baseUrl: 'https://fal.run',
      },
      nvidia: {
        apiKey: cleanKey(process.env.NVIDIA_IMAGE_API_KEY),
        models: ['qwen/qwen-image'], // Fixed the prefix here!
        enabled: !!cleanKey(process.env.NVIDIA_IMAGE_API_KEY),
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
    },
  },

  limits: {
    maxContextMessages: 40,
    maxFileSize: 20 * 1024 * 1024,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'change_in_production',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
