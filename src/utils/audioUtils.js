// src/utils/audioUtils.js — Voice transcription via Whisper (OpenAI or Groq)
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const config = require('../../config');
const logger = require('./logger');

async function transcribeAudio(fileUrl, filename) {
  const openaiKey = config.ai.providers.openai?.apiKey;
  const groqKey   = config.ai.providers.groq?.apiKey;

  if (!openaiKey && !groqKey) {
    throw new Error('Voice transcription requires OPENAI_API_KEY or GROQ_API_KEY.');
  }

  // Download the audio file
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const audioBuffer = Buffer.from(response.data);

  // Detect content type & filename from URL or caller hint
  const detectedName = filename || _filenameFromUrl(fileUrl);
  const contentType  = _mimeFromName(detectedName);

  // Try OpenAI Whisper first, then Groq Whisper
  if (openaiKey) {
    return await _whisperRequest('https://api.openai.com/v1/audio/transcriptions', openaiKey, audioBuffer, detectedName, contentType, 'whisper-1');
  }
  return await _whisperRequest('https://api.groq.com/openai/v1/audio/transcriptions', groqKey, audioBuffer, detectedName, contentType, 'whisper-large-v3');
}

async function _whisperRequest(endpoint, apiKey, audioBuffer, filename, contentType, model) {
  const form = new FormData();
  form.append('file', audioBuffer, { filename, contentType });
  form.append('model', model);
  form.append('response_format', 'text');

  try {
    const res = await axios.post(endpoint, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` },
      timeout: 120000,
    });
    return typeof res.data === 'string' ? res.data.trim() : res.data?.text?.trim() || '';
  } catch (err) {
    logger.error(`Whisper transcription error (${endpoint}): ${err.message}`);
    throw new Error(`Transcription failed: ${err.response?.data?.error?.message || err.message}`);
  }
}

function _filenameFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const base = path.basename(p);
    return base.includes('.') ? base : 'audio.ogg';
  } catch { return 'audio.ogg'; }
}

function _mimeFromName(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.mp3': 'audio/mpeg', '.mp4': 'audio/mp4',
    '.wav': 'audio/wav', '.webm': 'audio/webm',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  };
  return map[ext] || 'audio/ogg';
}

module.exports = { transcribeAudio };
