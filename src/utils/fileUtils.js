// src/utils/fileUtils.js — File content extraction
const axios = require('axios');

async function extractFileContent(fileUrl, mimeType, fileName = '') {
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const buffer = Buffer.from(response.data);
  const name = fileName.toLowerCase();

  // PDF
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  }

  // DOCX — mime can be 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  //         or legacy 'application/msword' (.doc)
  const isDocx = mimeType?.includes('vnd.openxmlformats') ||
                 mimeType === 'application/msword' ||
                 name.endsWith('.docx') ||
                 name.endsWith('.doc');
  if (isDocx) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // CSV — return raw text (AI will parse it)
  if (mimeType === 'text/csv' || name.endsWith('.csv')) {
    return buffer.toString('utf-8');
  }

  // JSON
  if (mimeType === 'application/json' || name.endsWith('.json')) {
    const raw = buffer.toString('utf-8');
    try {
      // Pretty-print for readability
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch { return raw; }
  }

  // Default: treat as UTF-8 text (txt, md, code files, etc.)
  return buffer.toString('utf-8');
}

module.exports = { extractFileContent };
