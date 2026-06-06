// src/utils/audioUtils.js — Voice transcription via Whisper
const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');
const logger = require('./logger');

async function transcribeAudio(fileUrl) {
  const apiKey = config.ai.providers.openai?.apiKey;
  if (!apiKey) {
    throw new Error('Voice transcription requires OPENAI_API_KEY (Whisper API).');
  }

  try {
    // Download audio file
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const audioBuffer = Buffer.from(response.data);

    // Build multipart form
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    form.append('response_format', 'text');

    const res = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    return typeof res.data === 'string' ? res.data.trim() : res.data?.text?.trim() || '';
  } catch (err) {
    logger.error(`Audio transcription error: ${err.message}`);
    throw new Error(`Transcription failed: ${err.response?.data?.error?.message || err.message}`);
  }
}

module.exports = { transcribeAudio };
