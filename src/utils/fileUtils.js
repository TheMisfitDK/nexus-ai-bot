// src/utils/fileUtils.js
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractFileContent(fileUrl, mimeType, fileName = '') {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType?.includes('word') || fileName.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Default: treat as text
  return buffer.toString('utf-8');
}

module.exports = { extractFileContent };
