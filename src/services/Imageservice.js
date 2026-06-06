// src/services/ImageService.js — Multi-provider image generation
const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

class ImageService {
  getAvailableProviders() {
    return Object.entries(config.imageGen.providers)
      .filter(([, p]) => p.enabled)
      .map(([name]) => name);
  }

  async generate(prompt, provider = null, model = null) {
    // Auto-select provider
    if (!provider) provider = this._getBestProvider();
    if (!provider) throw new Error('No image generation provider configured. Add STABILITY_API_KEY, HUGGINGFACE_API_KEY, or TOGETHER_API_KEY to env vars.');

    const p = config.imageGen.providers[provider];
    if (!p?.enabled) {
      const fallback = this._getBestProvider();
      if (!fallback) throw new Error(`Image provider "${provider}" not configured.`);
      provider = fallback;
    }

    const useModel = model || config.imageGen.providers[provider].models[0];
    logger.debug(`Image gen: ${provider}/${useModel}`);

    try {
      switch (provider) {
        case 'dalle': return await this._dalle(prompt, useModel);
        case 'stability': return await this._stability(prompt, useModel);
        case 'together': return await this._together(prompt, useModel);
        case 'huggingface': return await this._huggingface(prompt, useModel);
        case 'fal': return await this._fal(prompt, useModel);
        default: throw new Error(`Unknown image provider: ${provider}`);
      }
    } catch (err) {
      logger.error(`Image gen error [${provider}]: ${err.message}`);
      // Try fallback provider
      const fallback = this._getBestProvider(provider);
      if (fallback) {
        logger.info(`Falling back to ${fallback} for image gen`);
        return this.generate(prompt, fallback);
      }
      throw new Error(`Image generation failed: ${err.message}`);
    }
  }

  _getBestProvider(exclude = null) {
    const order = ['stability', 'dalle', 'together', 'fal', 'huggingface'];
    for (const name of order) {
      if (name !== exclude && config.imageGen.providers[name]?.enabled) return name;
    }
    return null;
  }

  async _dalle(prompt, model = 'dall-e-3') {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: config.imageGen.providers.dalle.apiKey });
    const res = await client.images.generate({
      model,
      prompt: prompt.slice(0, 1000),
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });
    return {
      buffer: Buffer.from(res.data[0].b64_json, 'base64'),
      provider: 'DALL-E', model,
    };
  }

  async _stability(prompt, model = 'stable-image-core') {
    const apiKey = config.imageGen.providers.stability.apiKey;
    const baseUrl = config.imageGen.providers.stability.baseUrl;

    // Stability AI v2beta API
    const FormData = require('form-data');
    const form = new FormData();
    form.append('prompt', prompt.slice(0, 10000));
    form.append('output_format', 'png');

    const endpoint = model.includes('ultra') ? '/v2beta/stable-image/generate/ultra'
      : model.includes('core') ? '/v2beta/stable-image/generate/core'
        : '/v2beta/stable-image/generate/sd3';

    const res = await axios.post(`${baseUrl}${endpoint}`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    return { buffer: Buffer.from(res.data), provider: 'Stability AI', model };
  }

  async _together(prompt, model = 'black-forest-labs/FLUX.1-schnell-Free') {
    const apiKey = config.imageGen.providers.together.apiKey;
    const res = await axios.post(
      'https://api.together.xyz/v1/images/generations',
      { model, prompt: prompt.slice(0, 1500), n: 1, width: 1024, height: 1024 },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    // Together returns URL or b64
    const data = res.data?.data?.[0];
    if (data?.b64_json) return { buffer: Buffer.from(data.b64_json, 'base64'), provider: 'Together/FLUX', model };
    if (data?.url) {
      const imgRes = await axios.get(data.url, { responseType: 'arraybuffer', timeout: 30000 });
      return { buffer: Buffer.from(imgRes.data), provider: 'Together/FLUX', model };
    }
    throw new Error('No image data returned from Together');
  }

  async _huggingface(prompt, model = 'stabilityai/stable-diffusion-xl-base-1.0') {
    const apiKey = config.imageGen.providers.huggingface.apiKey;
    const res = await axios.post(
      `${config.imageGen.providers.huggingface.baseUrl}/${model}`,
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 120000, // HF can be slow on cold start
      }
    );
    return { buffer: Buffer.from(res.data), provider: 'HuggingFace/SD', model };
  }

  async _fal(prompt, model = 'fal-ai/flux/schnell') {
    const apiKey = config.imageGen.providers.fal.apiKey;
    const res = await axios.post(
      `https://fal.run/${model}`,
      { prompt, image_size: 'landscape_4_3', num_images: 1, num_inference_steps: 4 },
      {
        headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );
    const url = res.data?.images?.[0]?.url;
    if (!url) throw new Error('No image URL from fal.ai');
    const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return { buffer: Buffer.from(imgRes.data), provider: 'fal.ai/FLUX', model };
  }
}

module.exports = new ImageService();
