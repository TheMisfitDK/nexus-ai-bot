// src/utils/imageUtils.js
const OpenAI = require('openai');
const axios = require('axios');
const config = require('../../config');

async function analyzeImage(imageUrl, prompt, provider, model) {
  // Vision via OpenAI-compatible API
  const visionProviders = ['openai', 'grok', 'google'];
  const useProvider = visionProviders.includes(provider) ? provider : 'openai';

  const openai = new OpenAI({ apiKey: config.ai.providers[useProvider]?.apiKey });
  const res = await openai.chat.completions.create({
    model: useProvider === 'openai' ? 'gpt-4o' : model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    }],
    max_tokens: 1024,
  });
  return res.choices[0].message.content;
}

async function generateImage(prompt) {
  const openai = new OpenAI({ apiKey: config.ai.providers.openai?.apiKey });
  const res = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });
  return Buffer.from(res.data[0].b64_json, 'base64');
}

module.exports = { analyzeImage, generateImage };

// ─────────────────────────────────────────────────────────────
// src/utils/audioUtils.js
// (Appended here for single-file simplicity; split if needed)
async function transcribeAudio(fileUrl) {
  const axios = require('axios');
  const FormData = require('form-data');
  const OpenAI = require('openai');

  const openai = new OpenAI({ apiKey: config.ai.providers.openai?.apiKey });
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const { Readable } = require('stream');
  const stream = Readable.from(Buffer.from(response.data));
  stream.path = 'audio.ogg'; // Whisper needs a filename

  const transcription = await openai.audio.transcriptions.create({
    file: stream,
    model: 'whisper-1',
  });
  return transcription.text;
}

module.exports.transcribeAudio = transcribeAudio;
