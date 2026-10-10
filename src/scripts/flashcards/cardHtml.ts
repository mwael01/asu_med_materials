/**
 * Normalizes an image source/URL to a canonical lowercase filename or signature
 * to detect duplicates regardless of scheme, host, query params, or hash.
 */
export function normalizeImageKey(src: string): string {
  if (!src) return '';
  const clean = src.trim();
  if (clean.startsWith('data:')) {
    return clean.substring(0, 80);
  }
  const withoutParams = clean.split('?')[0].split('#')[0];
  const filename = withoutParams.split('/').pop() || withoutParams;
  return decodeURIComponent(filename).toLowerCase();
}

/**
 * Extracts all unique image keys from an HTML fragment.
 */
export function extractImageKeys(html: string): Set<string> {
  const keys = new Set<string>();
  if (!html) return keys;
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const key = normalizeImageKey(match[1]);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Strips an HTML element (including its opening and closing tags and all nested content)
 * matching a specific tag and id or class pattern, handling balanced tag nesting correctly.
 */
export function stripBalancedTag(
  html: string,
  tag: string,
  idOrClassPattern: RegExp,
): string {
  let searchStart = 0;
  while (searchStart < html.length) {
    const openTagRegex = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
    openTagRegex.lastIndex = searchStart;
    const match = openTagRegex.exec(html);
    if (!match) break;

    const attributes = match[1];
    if (idOrClassPattern.test(attributes)) {
      const startIndex = match.index;
      let depth = 1;
      let currentIndex = startIndex + match[0].length;
      const tokenRegex = new RegExp(`(<${tag}\\b[^>]*>|<\\/${tag}>)`, 'gi');
      tokenRegex.lastIndex = currentIndex;
      let tokenMatch: RegExpExecArray | null;
      let endIndex = -1;

      while ((tokenMatch = tokenRegex.exec(html)) !== null) {
        if (tokenMatch[0].toLowerCase().startsWith(`</${tag}`)) {
          depth--;
          if (depth === 0) {
            endIndex = tokenMatch.index + tokenMatch[0].length;
            break;
          }
        } else {
          depth++;
        }
      }

      if (endIndex !== -1) {
        html = html.substring(0, startIndex) + html.substring(endIndex);
        searchStart = startIndex;
        continue;
      }
    }
    searchStart = match.index + match[0].length;
  }
  return html;
}

/**
 * Cleans card HTML defensively:
 * - Rewrites relative image sources to Cloudflare R2 public URL
 * - Strips scripts and dead inline event handlers
 * - Strips dead "Show hint" buttons and empty snackbars
 * - Extracts real hint if available
 * - Removes duplicate images already present in question
 * - Removes duplicate Image Occlusion wrappers from answer while preserving extra notes
 * - Removes empty Anki template sections (Images, Extra, Etymology, Mnemonics)
 */
export function prepareCardHtml(
  rawHtml: string,
  questionText?: string,
): { html: string; hintText: string | null } {
  if (!rawHtml) return { html: '', hintText: null };

  // 1. Rewrite relative image paths to Cloudflare R2 public domain
  let html = rawHtml.replace(
    /<img([^>]+)src=["']([^"']+)["']/gi,
    (_match, prefix, src) => {
      let cleanSrc = src.trim();
      if (
        !cleanSrc.startsWith('http://') &&
        !cleanSrc.startsWith('https://') &&
        !cleanSrc.startsWith('data:')
      ) {
        const filename = cleanSrc.split('/').pop() || cleanSrc;
        cleanSrc = `https://asumed.eduvour.com/${filename}`;
      }
      return `<img${prefix}src="${cleanSrc}" loading="eager" decoding="async"`;
    },
  );

  // 2. Strip scripts and dead Anki script tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gis, '');

  // 3. Strip FrontSide / repeated question from start of answer
  if (questionText) {
    const hrMatch = /<hr[^>]*>/i.exec(html);
    if (hrMatch) {
      const isAnswerHr = /id=["']?answer["']?/i.test(hrMatch[0]);
      const beforeHr = html.substring(0, hrMatch.index);
      const afterHr = html.substring(hrMatch.index + hrMatch[0].length);
      const cleanQText = questionText
        .replace(/<[^>]+>/g, '')
        .trim()
        .toLowerCase();
      const cleanBeforeText = beforeHr
        .replace(/<[^>]+>/g, '')
        .trim()
        .toLowerCase();

      const qImgKeys = extractImageKeys(questionText);
      const beforeImgKeys = extractImageKeys(beforeHr);
      let sharesImages = false;
      for (const k of beforeImgKeys) {
        if (qImgKeys.has(k)) {
          sharesImages = true;
          break;
        }
      }

      if (
        isAnswerHr ||
        sharesImages ||
        (cleanBeforeText &&
          (cleanBeforeText === cleanQText ||
            cleanBeforeText.startsWith(cleanQText) ||
            cleanQText.startsWith(cleanBeforeText)))
      ) {
        html = afterHr;
      }
    }
  }

  // 4. Handle Image Occlusion cards: if the question already has an occlusion wrapper,
  // remove the duplicate occlusion wrapper from the answer to prevent stacked/duplicate images,
  // but keep any extra explanation notes (e.g. #io-extra).
  if (questionText && /(?:id|class)=["'][^"']*\b(?:io-wrapper|image-occlusion-wrapper)\b/i.test(questionText)) {
    html = stripBalancedTag(html, 'div', /(?:id|class)=["'][^"']*\b(?:io-wrapper|image-occlusion-wrapper)\b/i);
  }

  // Strip Anki Image Occlusion dead buttons and empty header/footer
  html = html.replace(
    /<button\s+[^>]*(?:id=["']io-revl-btn["']|onclick=["']toggle\(\);?["'])[^>]*>.*?<\/button>/gis,
    '',
  );
  html = html.replace(/<button[^>]*>\s*Toggle Masks?\s*<\/button>/gis, '');
  html = html.replace(
    /<div\s+[^>]*(?:id|class)=["'](?:io-header|io-footer)["'][^>]*>\s*<\/div>/gis,
    '',
  );

  // 5. Remove any image in the answer that is already present in the question
  if (questionText) {
    const questionImgKeys = extractImageKeys(questionText);
    if (questionImgKeys.size > 0) {
      html = html.replace(
        /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
        (imgTag, src) => {
          const key = normalizeImageKey(src);
          if (key && questionImgKeys.has(key)) {
            return ''; // Drop duplicate image!
          }
          return imgTag;
        },
      );
    }
  }

  // 6. Extract potential hint before stripping dead buttons
  let hintText: string | null = null;
  const snackbarMatch = /<div\s+id=["']snackbar["'][^>]*>(.*?)<\/div>/is.exec(
    html,
  );
  if (snackbarMatch && snackbarMatch[1].replace(/<[^>]+>/g, '').trim()) {
    hintText = snackbarMatch[1].trim();
  }
  const hintMatch =
    /<div\s+[^>]*(?:id|class)=["'](?:card-)?hint["'][^>]*>(.*?)<\/div>/is.exec(
      html,
    );
  if (!hintText && hintMatch && hintMatch[1].replace(/<[^>]+>/g, '').trim()) {
    hintText = hintMatch[1].trim();
  }

  // 7. Remove non-functional hint text & dead elements completely
  html = html.replace(
    /<div\s+[^>]*(?:hint_btn|snackbar)[^>]*>.*?<\/div>/gis,
    '',
  );
  html = html.replace(
    /<(?:button|a|span|div)[^>]*>\s*Show hint\s*<\/(?:button|a|span|div)>/gis,
    '',
  );

  // 8. Remove empty boilerplate sections (Images, Extra Section, Etymology, Mnemonics)
  const sectionNames = ['Etymology', 'Mnemonics', 'Extra Section', 'Images'];
  for (const name of sectionNames) {
    const pattern = new RegExp(
      `(?:<hr[^>]*>\\s*)?(?:<div[^>]*>\\s*)?<h[1-6][^>]*>\\s*${name}\\s*<\\/h[1-6]>\\s*(?:<div[^>]*>(.*?)<\\/div>)?\\s*(?:<hr[^>]*>)?\\s*(?:<\\/div>)?`,
      'gis',
    );
    html = html.replace(pattern, (_m, content) => {
      const inner = content || '';
      const hasImg = /<img\b/i.test(inner);
      const text = inner.replace(/<[^>]+>/g, '').trim();
      if (hasImg) {
        return inner; // Keep the image directly, remove the redundant header!
      } else if (text) {
        return `<div>${inner}</div>`;
      }
      return '';
    });
  }

  // 9. Clean up empty paragraphs, links, divs, duplicate breaks and bounding horizontal rules
  html = html.replace(/<p\b[^>]*>\s*<\/p>/gi, '');
  html = html.replace(/<a\b[^>]*>\s*<\/a>/gi, '');
  html = html.replace(/<div\b[^>]*>\s*<\/div>/gi, '');
  html = html.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>');
  html = html.replace(/^\s*(?:<hr[^>]*>|<br\s*\/?>)+/gi, '');
  html = html.replace(/(?:<hr[^>]*>|<br\s*\/?>)+\s*$/gi, '');

  return { html: html.trim(), hintText };
}

