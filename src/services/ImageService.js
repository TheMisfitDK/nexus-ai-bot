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

  // Added 'attempted' array to track all failed providers in the current chain
  async generate(prompt, provider = null, model = null, attempted = []) {
    // Auto-select provider
    if (!provider) provider = this._getBestProvider(attempted);
    if (!provider) {
      throw new Error('No available image generation providers left to try. Please check your API keys and config.');
    }

    const p = config.imageGen.providers[provider];
    if (!p?.enabled) {
      attempted.push(provider);
      const fallback = this._getBestProvider(attempted);
      if (!fallback) throw new Error(`Image provider "${provider}" not configured and no fallbacks available.`);
      provider = fallback;
    }

    // Add current provider to attempted list to prevent infinite fallback loops
    attempted.push(provider);

    const useModel = model || config.imageGen.providers[provider].models[0];
    logger.debug(`Image gen attempt: ${provider}/${useModel}`);

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
      // Safely extract Axios error responses (some endpoints return arraybuffers, so we handle that)
      let apiErrorDetails = err.message;
      if (err.response && err.response.data) {
        apiErrorDetails = err.response.data instanceof Buffer 
          ? err.response.data.toString('utf8') 
          : JSON.stringify(err.response.data);
      }

      logger.error(`Image gen error [${provider}]: ${apiErrorDetails}`);
      
      // Try fallback provider, passing the full array of already attempted providers
      const fallback = this._getBestProvider(attempted);
      if (fallback) {
        logger.info(`Falling back to ${fallback} for image gen...`);
        return this.generate(prompt, fallback, null, attempted);
      }
      
      throw new Error(`Image generation failed on all available providers. Last error (${provider}): ${apiErrorDetails}`);
    }
  }

  // Now accepts an array of strings to exclude
  _getBestProvider(excludeArray = []) {
    const order = ['stability', 'dalle', 'together', 'fal', 'huggingface'];
    for (const name of order) {
      if (!excludeArray.includes(name) && config.imageGen.providers[name]?.enabled) {
        return name;
      }
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
    const baseUrl = config.imageGen.providers.stability.baseUrl || 'https://api.stability.ai';

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
    const baseUrl = config.imageGen.providers.huggingface.baseUrl || 'https://api-inference.huggingface.co/models';
    
    const res = await axios.post(
      `${baseUrl}/${model}`,
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout: 120000, 
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
