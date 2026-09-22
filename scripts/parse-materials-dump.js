#!/usr/bin/env node
/**
 * scripts/parse-materials-dump.js
 * 
 * Helper CLI script for ASU Med Materials maintainers to parse dumped WhatsApp messages,
 * raw text blocks, or GitHub issues and extract structured draft MaterialItem entries.
 *
 * Usage:
 *   node scripts/parse-materials-dump.js "ملخص الباثولوجي https://drive.google.com/xyz وقناة التليجرام https://t.me/asu"
 *   node scripts/parse-materials-dump.js --file ./scratch/message.txt
 *   node scripts/parse-materials-dump.js --issue 12
 */

import fs from 'node:fs';

function detectType(url) {
  const u = url.toLowerCase();
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('t.me') || u.includes('telegram.me')) return 'telegram';
  if (u.includes('youtube.com/playlist')) return 'playlist';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('chat.whatsapp.com') || u.includes('wa.me')) return 'whatsapp';
  if (u.endsWith('.pdf') || u.includes('mega.nz') || u.includes('mediafire.com')) return 'summary';
  return 'other';
}

function slugify(text, index = 0) {
  const clean = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  const rand = Math.random().toString(36).substring(2, 6);
  return clean ? `${clean}-${rand}` : `mat-${Date.now().toString(36)}-${index + 1}`;
}

function parseDumpText(rawText, options = {}) {
  const lines = rawText.split(/\r?\n/);
  const items = [];
  const urlRegex = /(?:https?:\/\/|www\.|(?:t\.me|drive\.google\.com|youtube\.com|youtu\.be|mega\.nz|mediafire\.com)\/)[^\s<>"'{}|\\^`\[\]]+/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const urls = line.match(urlRegex);
    if (!urls) continue;

    for (const rawUrl of urls) {
      let cleanUrl = rawUrl.trim().replace(/[\.\,\:\;\!\؟\?]+$/, '');
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }

      // Context extraction: remove url from the line to find title/description
      let lineTitle = line
        .replace(rawUrl, '')
        .replace(/^[\d\.\-\*\#\:\s]+/, '')
        .trim()
        .replace(/[:\-–ـ،,\s]+$/, '')
        .trim();

      // If line had no title, check previous line
      if (!lineTitle && i > 0 && !lines[i - 1].match(urlRegex)) {
        lineTitle = lines[i - 1]
          .replace(/^[\d\.\-\*\#\:\s]+/, '')
          .trim()
          .replace(/[:\-–ـ،,\s]+$/, '')
          .trim();
      }

      const type = detectType(cleanUrl);
      const title = lineTitle || `مصدر ${type.toUpperCase()}`;

      items.push({
        id: slugify(title, items.length),
        title,
        url: cleanUrl,
        type,
        year: options.year || 2,
        moduleId: options.moduleId || 'year2-blood',
        subject: options.subject || 'عام',
        author: options.author || undefined,
        addedBy: options.contributor || options.addedBy || 'فاعل خير',
        tags: [type, options.subject || 'عام'].filter(Boolean)
      });
    }
  }

  return items;
}

async function fetchIssueBody(issueNumber) {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN;
  const headers = {
    'User-Agent': 'ASU-Med-Materials-Parser',
    'Accept': 'application/vnd.github+json'
  };
  if (token) headers['Authorization'] = `Bearer ${token.trim()}`;

  const res = await fetch(`https://api.github.com/repos/mwael01/asu_med_materials/issues/${issueNumber}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch issue #${issueNumber}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const rawBody = data.body || '';

  // Extract metadata if available
  const issueMeta = {};
  const contribMatch = rawBody.match(/\|\s*👤\s*\*\*المساهم[^\*]*\*\*\s*\|\s*([^\|]+)\|/);
  if (contribMatch && contribMatch[1].trim() && !contribMatch[1].includes('فاعل خير')) {
    issueMeta.contributor = contribMatch[1].trim();
  }

  const yearMatch = rawBody.match(/\|\s*🎓\s*\*\*السنة[^\*]*\*\*\s*\|\s*[^0-9]*([1-5])/);
  if (yearMatch) {
    issueMeta.year = parseInt(yearMatch[1], 10);
  }

  const moduleMatch = rawBody.match(/\|\s*📚\s*\*\*الموديول\*\*\s*\|\s*([^\|]+)\|/);
  if (moduleMatch && moduleMatch[1].trim() && !moduleMatch[1].includes('غير محدد')) {
    issueMeta.moduleId = moduleMatch[1].trim();
  }

  // Extract raw dumped text inside ```text ... ``` block if present
  const codeBlockMatch = rawBody.match(/```text\s*([\s\S]*?)\s*```/);
  const textContent = codeBlockMatch ? codeBlockMatch[1].trim() : rawBody;

  return { text: textContent, meta: issueMeta };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
ASU Med Materials - Materials Dump Parser
=========================================
Extracts URLs and draft MaterialItem objects from WhatsApp messages or text dumps.

Usage:
  node scripts/parse-materials-dump.js "<text>"
  node scripts/parse-materials-dump.js --file <path-to-file>
  node scripts/parse-materials-dump.js --issue <github-issue-number>

Options:
  --year <1-5>             Academic year (default: 2)
  --module <moduleId>      Module ID (default: year2-blood)
  --added-by <name>        Contributor name
`);
    process.exit(0);
  }

  let textToParse = '';
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      textToParse = fs.readFileSync(args[i + 1], 'utf8');
      i++;
    } else if (args[i] === '--issue' && args[i + 1]) {
      console.log(`Fetching issue #${args[i + 1]} from GitHub...`);
      const { text, meta } = await fetchIssueBody(args[i + 1]);
      textToParse = text;
      Object.assign(options, meta);
      i++;
    } else if (args[i] === '--year' && args[i + 1]) {
      options.year = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--module' && args[i + 1]) {
      options.moduleId = args[i + 1];
      i++;
    } else if (args[i] === '--added-by' && args[i + 1]) {
      options.contributor = args[i + 1];
      i++;
    } else if (!textToParse && !args[i].startsWith('--')) {
      textToParse = args[i];
    }
  }

  if (!textToParse) {
    console.error('Error: No text or input provided.');
    process.exit(1);
  }

  console.log('--- Raw Content Preview ---');
  console.log(textToParse.slice(0, 300) + (textToParse.length > 300 ? '...\n' : '\n'));

  const results = parseDumpText(textToParse, options);
  console.log(`\nFound ${results.length} material(s):\n`);

  console.log('// Copy-paste into src/data/materials.ts:');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
