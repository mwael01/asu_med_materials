import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  prepareCardHtml,
  normalizeImageKey,
  extractImageKeys,
  stripBalancedTag,
} from '../src/scripts/flashcards/cardHtml.ts';

test('normalizeImageKey correctly resolves filenames from URLs and relative paths', () => {
  assert.equal(normalizeImageKey('tmp123.jpg'), 'tmp123.jpg');
  assert.equal(
    normalizeImageKey('https://asumed.eduvour.com/tmp123.jpg?v=2#hash'),
    'tmp123.jpg',
  );
  assert.equal(
    normalizeImageKey('/assets/images/Diagram%20One.png'),
    'diagram one.png',
  );
});

test('extractImageKeys extracts all images from HTML fragment', () => {
  const html = '<div><img src="foo.png"><p>Text</p><img src="https://example.com/bar.jpg?q=1"></div>';
  const keys = extractImageKeys(html);
  assert.equal(keys.size, 2);
  assert.ok(keys.has('foo.png'));
  assert.ok(keys.has('bar.jpg'));
});

test('stripBalancedTag cleanly removes nested tags by id or class', () => {
  const html = '<div id="io-wrapper"><div id="io-overlay"><img src="q.svg"></div><div id="io-original"><img src="base.jpg"></div></div><div id="io-extra">Notes</div>';
  const cleaned = stripBalancedTag(html, 'div', /id=["']io-wrapper["']/i);
  assert.equal(cleaned, '<div id="io-extra">Notes</div>');
});

test('prepareCardHtml rewrites relative image paths to Cloudflare R2', () => {
  const input = '<img src="anatomy_diagram.jpg" alt="Diagram">';
  const { html } = prepareCardHtml(input);
  assert.ok(html.includes('https://asumed.eduvour.com/anatomy_diagram.jpg'));
});

test('prepareCardHtml strips FrontSide with <hr id="answer"> even when question is only an image', () => {
  const question = '<img src="https://asumed.eduvour.com/diagram.png">';
  const answer = '<img src="https://asumed.eduvour.com/diagram.png"><hr id="answer"><p>Celiac trunk</p>';
  const { html } = prepareCardHtml(answer, question);
  assert.equal(html, '<p>Celiac trunk</p>');
  assert.ok(!html.includes('diagram.png'));
});

test('prepareCardHtml removes duplicate images from answer when present in question', () => {
  const question = '<p>What nerve is shown?</p><img src="https://asumed.eduvour.com/median_nerve.jpg">';
  const answer = '<p><img src="https://asumed.eduvour.com/median_nerve.jpg"></p><p>Median nerve</p>';
  const { html } = prepareCardHtml(answer, question);
  assert.equal(html, '<p>Median nerve</p>');
  assert.ok(!html.includes('median_nerve.jpg'));
});

test('prepareCardHtml preserves unique images in answer that are NOT in question', () => {
  const question = '<p>Symptoms of appendicitis?</p><img src="https://asumed.eduvour.com/clinical_pic.jpg">';
  const answer = '<img src="https://asumed.eduvour.com/clinical_pic.jpg"><p>RLQ pain</p><img src="https://asumed.eduvour.com/histology_slide.jpg">';
  const { html } = prepareCardHtml(answer, question);
  assert.ok(!html.includes('clinical_pic.jpg'));
  assert.ok(html.includes('histology_slide.jpg'));
  assert.ok(html.includes('RLQ pain'));
});

test('prepareCardHtml handles Image Occlusion cards: removes duplicate #io-wrapper from answer and keeps #io-extra', () => {
  const question = `
<div id="io-header"></div>
<div id="io-wrapper">
  <div id="io-overlay"><img src="8cd030905abc400ebba9049d3987d9a7-ao-2-Q.svg"></div>
  <div id="io-original"><img src="tmp6w3unqbm.jpg"></div>
</div>
<div id="io-footer"></div>
`;
  const answer = `
<div id="io-header"></div>
<div id="io-wrapper">
  <div id="io-overlay"><img src="8cd030905abc400ebba9049d3987d9a7-ao-2-A.svg"></div>
  <div id="io-original"><img src="tmp6w3unqbm.jpg"></div>
</div>
<button id="io-revl-btn" onclick="toggle();">Toggle Masks</button>
<div id="io-extra-wrapper">
  <div id="io-extra">
    <p>Clinical note: Innervated by deep peroneal nerve.</p>
  </div>
</div>
`;
  const { html: cleanQ } = prepareCardHtml(question);
  const { html: cleanA } = prepareCardHtml(answer, cleanQ);

  // Question should preserve its own #io-wrapper with R2 URLs and no dead scripts
  assert.ok(cleanQ.includes('id="io-wrapper"'));
  assert.ok(cleanQ.includes('https://asumed.eduvour.com/tmp6w3unqbm.jpg'));

  // Answer should NOT duplicate #io-wrapper or tmp6w3unqbm.jpg or dead buttons
  assert.ok(!cleanA.includes('id="io-wrapper"'));
  assert.ok(!cleanA.includes('tmp6w3unqbm.jpg'));
  assert.ok(!cleanA.includes('Toggle Masks'));
  assert.ok(!cleanA.includes('io-revl-btn'));
  // But answer should keep the clinical note!
  assert.ok(cleanA.includes('Clinical note: Innervated by deep peroneal nerve.'));
});
