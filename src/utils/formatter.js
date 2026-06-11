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
 * Escape Telegram MarkdownV2 special chars safely
 * This preserves code blocks, bold (*), italic (_), quotes (>), and links.
 */
function escapeMarkdownV2(text) {
  if (!text) return '';

  // 1. Temporarily extract code blocks and inline code so they remain untouched.
  // We do this so backslashes don't accidentally get inserted inside your code snippets.
  const codeBlocks = [];
  let tempText = text.replace(/(```[\s\S]*?```|`[^`]+`)/g, (match) => {
    codeBlocks.push(match);
    return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
  });

  // 2. Escape ONLY the characters that crash Telegram, while preserving formatting symbols.
  // We removed *, _, `, >, [, ], (, ) from this list so native Markdown still works.
  tempText = tempText.replace(/([.!+\-={}#|~\\])/g, '\\$1');

  // 3. Restore the code blocks perfectly untouched
  codeBlocks.forEach((block, i) => {
    tempText = tempText.replace(`%%CODE_BLOCK_${i}%%`, block);
  });

  return tempText;
}

/**
 * Format code blocks nicely
 */
function formatCode(code, lang = '') {
  if (!code) return '';
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
  if (bytes === 0 || !bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

module.exports = { chunkText, escapeMarkdownV2, formatCode, truncate, formatBytes };
