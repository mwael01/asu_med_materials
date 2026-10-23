import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as practicalImages from '../src/scripts/study/practicalImage.ts';
import * as progressHelpers from '../src/utils/studyProgress.ts';
import * as searchHelpers from '../src/utils/search.ts';
import * as documentHelpers from '../src/utils/documentViewer.ts';
import * as folderHelpers from '../src/utils/localFolderManager.ts';

class Element {
  dataset = {}; attributes = new Map(); children = []; listeners = new Map(); selectors = new Map(); lists = new Map();
  textContent = ''; style = {}; hidden = false; value = ''; checked = false; tabIndex = 0; pauseCount = 0;
  classList = { toggle() {} };
  querySelector(selector) { return this.selectors.get(selector) || null; }
  querySelectorAll(selector) { return this.lists.get(selector) || []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'src') this.src = ''; }
  addEventListener(name, callback, options) {
    const list = this.listeners.get(name) || []; list.push({ callback, options }); this.listeners.set(name, list);
  }
  dispatch(name, detail = {}) {
    for (const handler of [...(this.listeners.get(name) || [])]) {
      if (!handler.options?.signal?.aborted) handler.callback({ preventDefault() {}, ...detail });
      if (handler.options?.once) this.listeners.set(name, this.listeners.get(name).filter(item => item !== handler));
    }
  }
  append(...children) { this.children.push(...children); }
  focus() { this.focused = true; }
  pause() { this.pauseCount++; }
  load() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}
async function loadClient(path, dependencies, globals) {
  const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
    return dependencies[name];
  }, URL, URLSearchParams, AbortController, console, ...globals });
  return exports;
}
function browser(url = 'https://example.org/') {
  const window = new Element(), document = new Element();
  let location = new URL(url);
  const state = { get location() { return location; }, window, document,
    history: { replaceState(_state, _unused, href) { location = new URL(href, location); } },
    navigator: { clipboard: { async writeText(value) { state.copied = value; } } },
    storage: new Map(), studied: [], bookmarks: [], changes: [],
    globals() { return { window, document, get location() { return location; }, history: state.history,
      navigator: state.navigator, localStorage: { getItem: key => state.storage.get(key) || null, setItem: (key,value) => state.storage.set(key,value) },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } }; },
  };
  window.dispatchEvent = event => window.dispatch(event.type, event);
  return state;
}
function playerEntry(materialId, itemId, tab = 'videos') {
  return { key: JSON.stringify([materialId, tab, itemId]), materialId, itemId, title: itemId, bundleTitle: materialId,
    tab, url: `https://example.org/${itemId}`, embedUrl: tab === 'links' ? null : `https://example.org/embed/${itemId}`,
    embedType: tab === 'links' ? 'none' : itemId === 'direct' ? 'video' : 'iframe', playlistProgress: tab === 'videos' };
}
async function playerHarness(entries, requested, unavailableStorage = false) {
  const state = browser(`https://example.org/lesson/doctor${requested ? `?${new URLSearchParams({ item: requested })}` : ''}`);
  const root = new Element(); state.document.selectors.set('[data-doctor-player]', root);
  const selectors = ['[data-study-entries]', '[data-study-frame]', '[data-study-video]', '[data-study-audio]', '[data-study-image]', '[data-study-done]', '[data-study-save]', '[data-study-external]', '[data-study-title]', '[data-study-open]', '[data-study-download]', '[data-study-status]', '[data-study-share]'];
  for (const selector of selectors) root.selectors.set(selector, new Element());
  root.querySelector('[data-study-entries]').textContent = JSON.stringify(entries);
  const tabs = [...new Set(entries.map(entry => entry.tab))].map(tab => { const element = new Element(); element.dataset.studyTab = tab; return element; });
  const panels = tabs.map(tab => { const element = new Element(); element.dataset.studyPanel = tab.dataset.studyTab; return element; });
  const items = entries.map(entry => { const element = new Element(); element.dataset.studyItem = entry.key; return element; });
  root.lists.set('[data-study-tab]', tabs); root.lists.set('[data-study-panel]', panels); root.lists.set('[data-study-item]', items);
  state.storage.set('asumed_playlist_bundle', '{"v1":true,"unrelated":true}');
  const storage = { getStoredBookmarkIds: () => state.bookmarks, getStoredStudiedIds: () => state.studied,
    saveStudiedIds(ids) { state.studied = Array.from(ids); state.window.dispatch('studied-updated'); } };
  const exports = await loadClient('scripts/study/doctorPlayer.ts', {
    './practicalImage': practicalImages,
    '../../utils/storage': storage,
    '../../utils/bookmarks': { setMaterialBookmarked(id, added) { state.bookmarks = added ? [...state.bookmarks,id] : state.bookmarks.filter(item => item !== id); state.window.dispatch('bookmarks-updated'); } },
    '../../utils/userSync': { syncStudiedToggle: async (id, done) => state.changes.push([id, done]) },
    '../../utils/studyProgress': progressHelpers,
    '../../utils/documentViewer': documentHelpers,
    '../../utils/localFolderManager': folderHelpers,
  }, { ...state.globals(), ...(unavailableStorage ? { localStorage: {
    getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); },
  } } : {}) });
  exports.initDoctorPlayer();
  return { state, root, tabs, panels, items, init: exports.initDoctorPlayer };
}

test('audio stops and releases its URL when switching to a document', async () => {
  const entry = { ...playerEntry('recording', 'voice', 'audio'), embedType: 'audio' };
  const { root, items } = await playerHarness([entry, playerEntry('notes', 'pdf', 'pdfs')]);
  const audio = root.querySelector('[data-study-audio]');
  assert.equal(audio.hidden, false); assert.equal(audio.src, entry.embedUrl);
  const before = audio.pauseCount;
  items[1].dispatch('click');
  assert.equal(audio.hidden, true); assert.equal(audio.src, ''); assert.ok(audio.pauseCount > before);
});

test('download action follows the active hosted document and hides for external resources', async () => {
  const hosted = playerEntry('notes', 'page-1', 'pdfs');
  hosted.url = `https://asumed.eduvour.com/materials/sha256/${'a'.repeat(64)}.pdf?v=${'a'.repeat(64)}`;
  const { root, items } = await playerHarness([hosted, playerEntry('links', 'external', 'links')]);
  const download = root.querySelector('[data-study-download]');
  assert.equal(download.hidden, false);
  assert.equal(download.href, '/api/material-download?material=notes&document=page-1');
  items[1].dispatch('click');
  assert.equal(download.hidden, true);
});

test('doctor player restores shared PDF, navigates tabs by keyboard and stops hidden media', async () => {
  const entries = [playerEntry('bundle', 'v1'), playerEntry('bundle', 'direct'), playerEntry('notes', 'pdf', 'pdfs'), playerEntry('links', 'link', 'links')];
  const { root, state, tabs, panels, items, init } = await playerHarness(entries, entries[2].key);
  assert.equal(root.querySelector('[data-study-title]').textContent, 'pdf');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(panels[0].hidden, true);
  assert.equal(root.querySelector('[data-study-frame]').style.height, '70vh');
  tabs[1].dispatch('keydown', { key: 'Home' });
  assert.equal(tabs[0].focused, true);
  assert.equal(root.querySelector('[data-study-title]').textContent, 'v1');
  items[1].dispatch('click');
  assert.equal(root.querySelector('[data-study-frame]').hidden, true);
  assert.equal(root.querySelector('[data-study-video]').hidden, false);
  tabs[2].dispatch('click');
  assert.equal(root.querySelector('[data-study-video]').src, '');
  assert.equal(root.querySelector('[data-study-external]').hidden, false);
  assert.equal(root.querySelector('[data-study-open]').href, entries[3].url);
  init(); // Reinitializing must not bind actions twice.
  root.querySelector('[data-study-save]').dispatch('click');
  assert.deepEqual(state.bookmarks, ['links']);
  root.querySelector('[data-study-share]').dispatch('click');
  await Promise.resolve();
  assert.equal(new URL(state.copied).searchParams.get('item'), entries[3].key);
  state.document.dispatch('astro:before-swap');
  assert.equal(root.querySelector('[data-study-frame]').src, '');
});

test('doctor progress preserves legacy video IDs and only completes the whole source after every entry', async () => {
  const entries = [playerEntry('bundle', 'v1'), playerEntry('bundle', 'v2')];
  const { root, state, items } = await playerHarness(entries);
  assert.equal(root.querySelector('[data-study-done]').getAttribute('aria-pressed'), 'true');
  items[1].dispatch('click');
  root.querySelector('[data-study-done]').dispatch('click');
  assert.deepEqual(state.studied, ['bundle']);
  assert.deepEqual(JSON.parse(state.storage.get('asumed_playlist_bundle')), { v1: true, unrelated: true, v2: true });
  items[0].dispatch('click');
  root.querySelector('[data-study-done]').dispatch('click');
  assert.deepEqual(state.studied, []);
  assert.equal(JSON.parse(state.storage.get('asumed_playlist_bundle')).v2, true);
  assert.equal(JSON.parse(state.storage.get('asumed_playlist_bundle')).v1, false);
});

test('image albums switch between ordered pages and release the hidden image source', async () => {
  const image = { ...playerEntry('album', 'page-1', 'pdfs'), embedType: 'image', embedUrl: 'https://example.org/page.jpg' };
  const video = playerEntry('recording', 'direct');
  const { root, items } = await playerHarness([image, video], image.key);
  assert.equal(root.querySelector('[data-study-image]').hidden, false);
  assert.equal(root.querySelector('[data-study-image]').src, image.embedUrl);
  assert.equal(root.querySelector('[data-study-image]').alt, image.title);
  assert.equal(root.querySelector('[data-study-frame]').hidden, true);
  items[1].dispatch('click');
  assert.equal(root.querySelector('[data-study-image]').hidden, true);
  assert.equal(root.querySelector('[data-study-image]').src, '');
  assert.equal(root.querySelector('[data-study-video]').hidden, false);
});

test('saved-year home scopes update immediately and reveal the empty-year state', async () => {
  const state = browser(), root = new Element(), label = new Element(), empty = new Element();
  const sections = [1,2].map(year => { const element = new Element(); element.dataset.scopeYear = String(year); return element; });
  let year = null;
  root.lists.set('[data-scope-year]', sections); root.lists.set('[data-year-label]', [label]); root.selectors.set('[data-year-empty]', empty);
  state.document.selectors.set('[data-saved-year-scope]', root);
  const { initYearScope } = await loadClient('scripts/navigation/yearScope.ts', { '../../utils/storage': { getUserStoredYear: () => year } }, state.globals());
  initYearScope(); assert.equal(sections.every(section => section.hidden), true);
  year = 2; state.window.dispatch('user-preferences-updated');
  assert.equal(sections[1].hidden, false); assert.equal(sections[0].hidden, true); assert.equal(label.textContent, 'Year 2');
  year = 5; state.window.dispatch('storage'); assert.equal(empty.hidden, false);
});

test('first-visit year selection preserves a shared route and can reopen after dismissal', async () => {
  const state = browser('https://example.org/module/test/anatomy'), dialog = new Element(), close = new Element();
  const button = new Element(); button.dataset.selectYear = '3';
  const trigger = new Element(); let year = null;
  dialog.selectors.set('[data-close-year]', close); dialog.lists.set('[data-select-year]', [button]);
  state.document.selectors.set('#year-selector', dialog); state.document.lists.set('.trigger-multistage-selector', [trigger]);
  const { initYearSelector } = await loadClient('scripts/navigation/yearSelector.ts', { '../../utils/storage': {
    getUserStoredYear: () => year, setUserStoredYear(value) { year = value; },
  } }, state.globals());
  initYearSelector(); assert.equal(dialog.open, true);
  close.dispatch('click'); trigger.dispatch('click'); assert.equal(dialog.open, true);
  button.dispatch('click'); assert.equal(year, 3); assert.equal(dialog.open, false);
  assert.equal(state.location.pathname, '/module/test/anatomy');
});

test('search scopes query results to the saved year and keeps explicit all-years URLs shareable', async () => {
  const state = browser('https://example.org/search?q=anatomy'), root = new Element(), input = new Element(), all = new Element(), results = new Element(), grid = new Element(), empty = new Element(), form = new Element(), label = new Element();
  const materials = [1,2].map(year => ({ id: `m${year}`, title: 'Anatomy', type: 'website', year, tags: [], url: 'https://example.org' }));
  const data = new Element(); data.textContent = JSON.stringify({ materials, modules: [] });
  for (const [selector, element] of [['[data-search-data]',data],['#site-search-input',input],['[data-search-all]',all],['[data-search-results]',results],['[data-search-empty]',empty],['form',form],['[data-search-year]',label]]) root.selectors.set(selector,element);
  const cards = materials.map(material => { const element = new Element(); element.dataset.materialId = material.id; return element; });
  results.selectors.set('.materials-grid',grid); results.lists.set('[data-material-id]',cards);
  state.document.selectors.set('[data-search-page]',root); state.document.createDocumentFragment = () => new Element();
  const { initSearchPage } = await loadClient('scripts/search/page.ts', {
    '../../utils/search': searchHelpers, '../../utils/storage': { getUserStoredYear: () => 1 },
  }, { ...state.globals(), setTimeout, clearTimeout });
  initSearchPage(); assert.equal(cards[0].hidden,false); assert.equal(cards[1].hidden,true);
  all.checked = true; all.dispatch('change');
  assert.equal(cards[1].hidden,false); assert.equal(state.location.searchParams.get('year'),'all');
  input.value = 'absentword'; form.dispatch('submit'); assert.equal(empty.hidden,false); assert.equal(results.hidden,true);
});

test('year persistence rejects malformed preferences and remains usable when storage is unavailable', async () => {
  const state = browser();
  const { getUserStoredYear, setUserStoredYear } = await loadClient('utils/storage.ts', {}, state.globals());
  state.storage.set('asumed_user_year','2abc'); assert.equal(getUserStoredYear(),null);
  state.storage.set('asumed_user_year','2.5'); assert.equal(getUserStoredYear(),null);
  state.storage.set('asumed_user_year','7'); assert.equal(getUserStoredYear(),null);
  setUserStoredYear(3); assert.equal(state.storage.get('asumed_user_year'),'3'); assert.equal(getUserStoredYear(),3);
  let changes = 0;
  state.window.addEventListener('user-preferences-updated',() => changes++);
  const unavailable = await loadClient('utils/storage.ts', {}, { ...state.globals(), localStorage: {
    getItem() { throw new Error('Unavailable'); }, setItem() { throw new Error('Unavailable'); },
  } });
  unavailable.setUserStoredYear(4);
  assert.equal(unavailable.getUserStoredYear(),4); assert.equal(changes,1);
});


test('doctor progress remains in memory when browser storage is unavailable', async () => {
  const entries = [playerEntry('bundle', 'v1'), playerEntry('bundle', 'v2')];
  const { root, state, items } = await playerHarness(entries, null, true);
  root.querySelector('[data-study-done]').dispatch('click');
  assert.equal(root.querySelector('[data-study-done]').getAttribute('aria-pressed'), 'true');
  items[1].dispatch('click');
  root.querySelector('[data-study-done]').dispatch('click');
  assert.deepEqual(state.studied, ['bundle']);
});


test('practical image notes switch safely and reset zoom without rendering markup', () => {
  const root = new Element(), panel = new Element(), text = new Element(), sources = new Element(), image = new Element();
  root.selectors.set('[data-practical-image]', panel);
  panel.selectors.set('[data-image-description]', text);
  panel.selectors.set('[data-image-sources]', sources);
  sources.replaceChildren = (...children) => { sources.children = children; };
  practicalImages.updatePracticalImage(root, image, '<script>not HTML</script>', 'Bronchiole micrograph', []);
  assert.equal(text.textContent, '<script>not HTML</script>');
  assert.equal(image.alt, 'Bronchiole micrograph');
  assert.equal(panel.hidden, false);
  image.dataset.zoom = '3';
  practicalImages.updatePracticalImage(root, image, 'Second image', 'Lung section', []);
  assert.equal(text.textContent, 'Second image');
  assert.equal(image.dataset.zoom, '1');
  image.hidden = true;
  practicalImages.updatePracticalImage(root, image);
  assert.equal(panel.hidden, true);
  assert.equal(text.textContent, '');
});


test('image controls zoom, reset and initialize once', async () => {
  const state = browser(), panel = new Element(), container = new Element(), image = new Element();
  panel.parentElement = container; image.parentElement = container;
  container.selectors.set('img', image);
  state.document.lists.set('[data-practical-image]', [panel]);
  const controller = await loadClient('scripts/study/practicalImage.ts', {}, state.globals());
  controller.initPracticalImages(); controller.initPracticalImages();
  const zoom = { dataset: { imageZoom: '1.25' }, hasAttribute: () => false };
  panel.dispatch('click', { target: { closest: () => zoom } });
  assert.equal(image.dataset.zoom, '1.25');
  assert.equal(image.style.width, '125%');
  assert.equal(image.style.maxHeight, 'none');
  const reset = { dataset: {}, hasAttribute: key => key === 'data-image-reset' };
  panel.dispatch('click', { target: { closest: () => reset } });
  assert.equal(image.dataset.zoom, '1');
  assert.equal(image.style.width, '100%');
  assert.equal(image.style.maxHeight, '80vh');
  assert.equal(panel.listeners.get('click').length, 1);
});
