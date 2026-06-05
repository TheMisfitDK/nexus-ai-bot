// src/utils/formatter.js
/**
 * Split text into chunks respecting word/sentence boundaries
 */
function chunkText(text, maxLen = 4000) {
  if (!text || text.length <= maxLen) return [text];
  const chunks = [];
  let current = '';
  const paragraphs = text.split('\n\n');

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Escape Telegram MarkdownV2 special chars
 */
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Format code blocks nicely
 */
function formatCode(code, lang = '') {
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLen = 100) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

module.exports = { chunkText, escapeMarkdownV2, formatCode, truncate, formatBytes };
