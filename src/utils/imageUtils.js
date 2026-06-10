// src/utils/imageUtils.js — Vision analysis
const axios = require('axios');
const config = require('../../config');
const logger = require('./logger');

async function analyzeImage(imageUrl, prompt, provider, model) {
  const visionMap = {
    openai: { apiKey: config.ai.providers.openai?.apiKey, model: model || 'gpt-4o' },
    grok:   { apiKey: config.ai.providers.grok?.apiKey, baseUrl: 'https://api.x.ai/v1', model: 'grok-2-vision-1212' },
  };

  // Google (Gemini) vision
  if (provider === 'google' && config.ai.providers.google?.apiKey) {
    return await _googleVision(imageUrl, prompt);
  }

  // Anthropic (Claude) vision — claude-3-haiku/sonnet/opus all support vision
  if (provider === 'anthropic' && config.ai.providers.anthropic?.apiKey) {
    return await _anthropicVision(imageUrl, prompt, model || 'claude-haiku-4-5');
  }

  // OpenAI-compatible providers (openai, grok)
  let useProvider = null;
  if (visionMap[provider]?.apiKey) useProvider = provider;
  else if (visionMap.openai?.apiKey)  useProvider = 'openai';
  else if (visionMap.grok?.apiKey)    useProvider = 'grok';

  if (useProvider) {
    const { apiKey, baseUrl, model: vModel } = visionMap[useProvider];
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
    const res = await client.chat.completions.create({
      model: vModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: prompt || 'Describe this image in detail.' },
        ],
      }],
      max_tokens: 1024,
    });
    return res.choices[0]?.message?.content || 'Could not analyze image.';
  }

  // Final fallback: Google
  if (config.ai.providers.google?.apiKey) return await _googleVision(imageUrl, prompt);
  // Last fallback: Anthropic
  if (config.ai.providers.anthropic?.apiKey) return await _anthropicVision(imageUrl, prompt, 'claude-haiku-4-5');

  throw new Error('No vision-capable provider configured. Add OPENAI_API_KEY, GOOGLE_AI_API_KEY, or ANTHROPIC_API_KEY.');
}

async function _googleVision(imageUrl, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.ai.providers.google.apiKey);
  const gModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const base64 = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type'] || 'image/jpeg';
  const result = await gModel.generateContent([
    { inlineData: { data: base64, mimeType } },
    prompt || 'Describe this image in detail.',
  ]);
  return result.response.text();
}

async function _anthropicVision(imageUrl, prompt, model) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.ai.providers.anthropic.apiKey });
  // Fetch image and convert to base64
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const base64 = Buffer.from(response.data).toString('base64');
  const rawMime = response.headers['content-type'] || 'image/jpeg';
  // Anthropic only allows: image/jpeg, image/png, image/gif, image/webp
  const mimeType = ['image/jpeg','image/png','image/gif','image/webp'].includes(rawMime) ? rawMime : 'image/jpeg';
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt || 'Describe this image in detail.' },
      ],
    }],
  });
  return res.content[0]?.text || 'Could not analyze image.';
}

module.exports = { analyzeImage };
