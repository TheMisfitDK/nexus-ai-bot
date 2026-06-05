// src/utils/audioUtils.js
const axios = require('axios');
const OpenAI = require('openai');
const config = require('../../config');

async function transcribeAudio(fileUrl) {
  const openai = new OpenAI({ apiKey: config.ai.providers.openai?.apiKey });
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const { Readable } = require('stream');
  const stream = Readable.from(Buffer.from(response.data));
  stream.path = 'audio.ogg';
  const transcription = await openai.audio.transcriptions.create({ file: stream, model: 'whisper-1' });
  return transcription.text;
}

module.exports = { transcribeAudio };
