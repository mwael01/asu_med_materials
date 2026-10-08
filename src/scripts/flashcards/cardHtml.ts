/**
 * Cleans card HTML defensively:
 * - Rewrites relative image sources to Cloudflare R2 public URL
 * - Strips dead "Show hint" buttons and empty snackbars
 * - Extracts real hint if available
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

  // 2. Strip FrontSide / repeated question from start of answer
  if (questionText) {
    const hrMatch = /<hr[^>]*>/i.exec(html);
    if (hrMatch) {
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
      if (
        cleanBeforeText &&
        (cleanBeforeText === cleanQText ||
          cleanBeforeText.startsWith(cleanQText) ||
          cleanQText.startsWith(cleanBeforeText))
      ) {
        html = afterHr;
      }
    }
  }

  // 3. Extract potential hint before stripping dead buttons
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

  // 4. Remove non-functional hint text & dead elements completely
  html = html.replace(
    /<div\s+[^>]*(?:hint_btn|snackbar)[^>]*>.*?<\/div>/gis,
    '',
  );
  html = html.replace(
    /<(?:button|a|span|div)[^>]*>\s*Show hint\s*<\/(?:button|a|span|div)>/gis,
    '',
  );

  // 5. Remove empty boilerplate sections (Images, Extra Section, Etymology, Mnemonics)
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

  // 6. Clean up empty divs, duplicate breaks and bounding horizontal rules
  html = html.replace(/<div\s*>\s*<\/div>/gi, '');
  html = html.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>');
  html = html.replace(/^\s*(?:<hr[^>]*>|<br\s*\/?>)+/gi, '');
  html = html.replace(/(?:<hr[^>]*>|<br\s*\/?>)+\s*$/gi, '');

  return { html: html.trim(), hintText };
}
