// src/utils/imageUtils.js — Vision analysis
const axios = require('axios');
const config = require('../../config');
const logger = require('./logger');

async function analyzeImage(imageUrl, prompt, provider, model) {
  // Vision-capable providers
  const visionMap = {
    openai: { apiKey: config.ai.providers.openai?.apiKey, model: 'gpt-4o' },
    grok: { apiKey: config.ai.providers.grok?.apiKey, baseUrl: 'https://api.x.ai/v1', model: 'grok-2-vision-1212' },
    google: null, // handled separately
  };

  // Use Google vision if selected and configured
  if (provider === 'google' && config.ai.providers.google?.apiKey) {
    return await _googleVision(imageUrl, prompt);
  }

  // Find a configured vision provider
  let useProvider = null;
  if (visionMap[provider]?.apiKey) useProvider = provider;
  else if (visionMap.openai?.apiKey) useProvider = 'openai';
  else if (visionMap.grok?.apiKey) useProvider = 'grok';

  if (!useProvider) {
    // Fallback to Google
    if (config.ai.providers.google?.apiKey) return await _googleVision(imageUrl, prompt);
    throw new Error('No vision-capable provider configured. Add OPENAI_API_KEY or GOOGLE_AI_API_KEY.');
  }

  const { apiKey, baseUrl, model: vModel } = visionMap[useProvider];
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

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

async function _googleVision(imageUrl, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.ai.providers.google.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Fetch image as base64
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const base64 = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type'] || 'image/jpeg';

  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    prompt || 'Describe this image in detail.',
  ]);
  return result.response.text();
}

module.exports = { analyzeImage };
