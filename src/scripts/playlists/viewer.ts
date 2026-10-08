import type { WatchedVideos } from '../../types/playlists';
import { getStoredStudiedIds, saveStudiedIds } from '../../utils/storage';
import { syncStudiedToggle } from '../../utils/userSync';

export function initPlaylistViewer(): void {
  const root = document.querySelector<HTMLElement>('[data-playlist-viewer]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const playlistId = root.dataset.playlistViewer!;
  const items = [...root.querySelectorAll<HTMLElement>('.playlist-video-item, .playlist-checkpoint-item')];
  const videos = items.filter(item => item.matches('.playlist-video-item'));
  const key = `asumed_playlist_${playlistId}`;
  const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`);
  const itemId = (item: HTMLElement) => item.dataset.videoId || item.dataset.checkpointId || '';
  let watched: WatchedVideos = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) watched = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'));
  } catch { /* Storage unavailable; progress still works in memory. */ }
  let current = 0;
  const lifecycle = new AbortController();
  const en = () => document.documentElement.lang === 'en';
  function importStudied() {
    const studied = new Set(getStoredStudiedIds());
    for (const item of items) {
      if (item.dataset.sourceMaterialId) watched[itemId(item)] = studied.has(playlistId) || studied.has(item.dataset.sourceMaterialId);
      else if (studied.has(playlistId)) watched[itemId(item)] = true;
    }
  }
  function render() {
    const count = items.filter(item => watched[itemId(item)]).length;
    const percent = items.length ? Math.round(count / items.length * 100) : 0;
    const bar = get('progress-bar-fill'); if (bar) bar.style.width = `${percent}%`;
    const percentage = get('progress-percent-label'); if (percentage) percentage.textContent = `${percent}%`;
    const label = get('progress-count-label'); if (label) label.textContent = en() ? `${count} of ${items.length} completed` : `${count} من ${items.length} مكتمل`;
    for (const [index, item] of items.entries()) {
      const title = item.querySelector<HTMLElement>('.video-title');
      if (title) title.textContent = (en() ? item.dataset.titleEn : item.dataset.titleAr) || item.dataset.title || '';
      const done = Boolean(watched[itemId(item)]);
      const active = videos.length > 0 && index === current;
      const box = item.querySelector<HTMLElement>('[role="checkbox"], .checkpoint-done-checkbox');
      box?.setAttribute('aria-checked', String(done));
      for (const name of ['bg-emerald-600', 'border-emerald-600']) box?.classList.toggle(name, done);
      box?.querySelector('.checkmark-icon')?.classList.toggle('hidden', !done);
      item.querySelector('.video-title')?.classList.toggle('line-through', done);
      item.classList.toggle('ring-2', active); item.classList.toggle('ring-emerald-500', active);
      const playing = item.querySelector('.now-playing-badge'); playing?.classList.toggle('hidden', !active); playing?.classList.toggle('flex', active);
    }
    const currentTitle = get('current-video-title');
    if (currentTitle && videos.length) currentTitle.textContent = (en() ? videos[current].dataset.titleEn : videos[current].dataset.titleAr) || videos[current].dataset.title || '';
    const done = videos.length ? Boolean(watched[itemId(videos[current])]) : count === items.length;
    const toggle = get('toggle-done-text'); if (toggle) toggle.textContent = done ? (en() ? 'Completed' : 'مكتمل') : (en() ? 'Mark completed' : 'تحديد كمكتمل');
    const stepper = get('video-stepper-label'); if (stepper) stepper.textContent = en() ? `${current + 1} of ${videos.length}` : `${current + 1} من ${videos.length}`;
    const prev = get<HTMLButtonElement>('prev-video-btn'); if (prev) prev.disabled = current === 0;
    const next = get<HTMLButtonElement>('next-video-btn'); if (next) next.disabled = current === videos.length - 1;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(watched)); } catch { /* Keep in-memory progress. */ }
    const before = new Set(getStoredStudiedIds());
    const studied = new Set(before);
    for (const item of items) {
      const source = item.dataset.sourceMaterialId;
      if (source) {
        const done = Boolean(watched[itemId(item)]);
        if (done) studied.add(source); else studied.delete(source);
      }
    }
    const complete = items.length > 0 && items.every(item => watched[itemId(item)]);
    if (complete) studied.add(playlistId); else studied.delete(playlistId);
    saveStudiedIds([...studied], playlistId);
    for (const id of studied) {
      if (!before.has(id)) void syncStudiedToggle(id, true);
    }
    for (const id of before) {
      if (!studied.has(id)) void syncStudiedToggle(id, false);
    }
    render();
  }
  function switchVideo(index: number, autoplay = false) {
    if (index < 0 || index >= videos.length) return;
    current = index; const item = videos[index];
    const iframe = get<HTMLIFrameElement>('yt-embed-player');
    if (iframe && item.dataset.youtubeId) iframe.src = `https://www.youtube-nocookie.com/embed/${item.dataset.youtubeId}?rel=0${autoplay ? '&autoplay=1' : ''}`;
    const title = get('current-video-title'); if (title) title.textContent = item.dataset.title || '';
    const external = get<HTMLAnchorElement>('current-video-external'); if (external && item.dataset.youtubeId) external.href = `https://www.youtube.com/watch?v=${item.dataset.youtubeId}`;
    render();
  }
  for (const [index, item] of items.entries()) {
    item.addEventListener('keydown', event => {
      if (event.target === item && ['Enter', ' '].includes(event.key)) { event.preventDefault(); if (videos.length) switchVideo(index, true); }
    }, {signal: lifecycle.signal});
    item.addEventListener('click', event => {
      if ((event.target as Element).closest('.video-done-checkbox, .checkpoint-done-checkbox') || !videos.length) {
        event.preventDefault(); watched[itemId(item)] = !watched[itemId(item)]; save();
      } else switchVideo(index, true);
    }, {signal: lifecycle.signal});
  }
  get('toggle-current-done-btn')?.addEventListener('click', () => {
    if (videos.length) watched[itemId(videos[current])] = !watched[itemId(videos[current])];
    else { const done = !items.every(item => watched[itemId(item)]); for (const item of items) watched[itemId(item)] = done; }
    save();
  }, {signal: lifecycle.signal});
  get('mark-all-done-btn')?.addEventListener('click', () => { for (const item of items) watched[itemId(item)] = true; save(); }, {signal: lifecycle.signal});
  get('reset-progress-btn')?.addEventListener('click', () => {
    if (confirm(en() ? 'Reset watch progress?' : 'إعادة ضبط سجل المشاهدة؟')) { watched = {}; save(); }
  }, {signal: lifecycle.signal});
  get('prev-video-btn')?.addEventListener('click', () => switchVideo(current - 1, true), {signal: lifecycle.signal});
  get('next-video-btn')?.addEventListener('click', () => switchVideo(current + 1, true), {signal: lifecycle.signal});
  window.addEventListener('playlist-progress-updated', event => {
    const detail = (event as CustomEvent<{id: string; watched: WatchedVideos}>).detail;
    if (detail.id === playlistId) { watched = detail.watched; render(); }
  }, {signal: lifecycle.signal});
  window.addEventListener('asumed-language-changed', render, {signal: lifecycle.signal});
  window.addEventListener('studied-updated', event => {
    if ((event as CustomEvent<{sourceId?: string}>).detail?.sourceId === playlistId) return;
    importStudied(); render();
  }, {signal: lifecycle.signal});
  document.addEventListener('astro:before-swap', () => lifecycle.abort(), {once: true, signal: lifecycle.signal});
  importStudied();
  const requested = new URL(window.location.href).searchParams.get('video');
  const selected = requested ? videos.findIndex(item => itemId(item) === requested || item.dataset.sourceMaterialId === requested) : 0;
  if (videos.length) switchVideo(Math.max(0, selected)); else render();
}
