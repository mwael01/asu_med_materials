import type { StudyEntry, StudyTab } from '../../types/lessons';
import { getStoredBookmarkIds, getStoredStudiedIds, saveStudiedIds } from '../../utils/storage';
import { setMaterialBookmarked } from '../../utils/bookmarks';
import { syncStudiedToggle } from '../../utils/userSync';
import { entryProgressStorage, parseProgress } from '../../utils/studyProgress';

export function initDoctorPlayer(): void {
  const root = document.querySelector<HTMLElement>('[data-doctor-player]');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';
  const entries: StudyEntry[] = JSON.parse(root.querySelector('[data-study-entries]')?.textContent || '[]');
  if (!entries.length) return;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const frame = get<HTMLIFrameElement>('[data-study-frame]');
  const video = get<HTMLVideoElement>('[data-study-video]');
  const done = get<HTMLButtonElement>('[data-study-done]');
  const saved = get<HTMLButtonElement>('[data-study-save]');
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-study-tab]')];
  const itemButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-study-item]')];
  const lifecycle = new AbortController();
  const progress = new Map<string, Record<string, boolean>>();
  let current = entries[0];

  function readProgress(entry: StudyEntry): Record<string, boolean> {
    const { key } = entryProgressStorage(entry);
    if (!progress.has(key)) {
      try { progress.set(key, parseProgress(localStorage.getItem(key))); }
      catch { progress.set(key, {}); }
    }
    return progress.get(key)!;
  }
  function completed(entry: StudyEntry): boolean {
    return getStoredStudiedIds().includes(entry.materialId) || Boolean(readProgress(entry)[entryProgressStorage(entry).itemId]);
  }
  function refresh() {
    const isDone = completed(current);
    done.textContent = isDone ? 'Completed' : 'Mark completed';
    done.setAttribute('aria-pressed', String(isDone));
    const isSaved = getStoredBookmarkIds().includes(current.materialId);
    saved.textContent = isSaved ? 'Saved' : 'Save';
    saved.setAttribute('aria-pressed', String(isSaved));
    for (const button of itemButtons) {
      const entry = entries.find(item => item.key === button.dataset.studyItem)!;
      button.setAttribute('aria-current', String(entry.key === current.key));
      button.textContent = `${completed(entry) ? '✓ ' : ''}${entry.title}`;
    }
  }
  function showTab(tab: StudyTab) {
    for (const button of tabs) {
      const active = button.dataset.studyTab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    root!.querySelectorAll<HTMLElement>('[data-study-panel]').forEach(panel => { panel.hidden = panel.dataset.studyPanel !== tab; });
  }
  function select(entry: StudyEntry, updateUrl = true) {
    current = entry;
    // Removing inactive sources stops media and avoids retaining hidden embeds.
    frame.removeAttribute('src');
    video.pause(); video.removeAttribute('src'); video.load();
    frame.hidden = entry.embedType !== 'iframe';
    video.hidden = entry.embedType !== 'video';
    get('[data-study-external]').hidden = entry.embedType !== 'none';
    if (entry.embedUrl && entry.embedType === 'iframe') frame.src = entry.embedUrl;
    if (entry.embedUrl && entry.embedType === 'video') video.src = entry.embedUrl;
    frame.title = entry.title;
    frame.classList.toggle('aspect-video', entry.tab !== 'pdfs');
    frame.style.height = entry.tab === 'pdfs' ? '70vh' : '';
    get('[data-study-title]').textContent = entry.title;
    get<HTMLAnchorElement>('[data-study-open]').href = entry.url;
    get('[data-study-status]').textContent = '';
    showTab(entry.tab);
    if (updateUrl) {
      const url = new URL(location.href); url.searchParams.set('item', entry.key);
      history.replaceState(null, '', url);
    }
    refresh();
  }
  for (const button of itemButtons) button.addEventListener('click', () => {
    const entry = entries.find(item => item.key === button.dataset.studyItem);
    if (entry) select(entry);
  });
  function activateTab(button: HTMLButtonElement) {
    const tab = button.dataset.studyTab as StudyTab;
    const entry = entries.find(item => item.tab === tab)!;
    if (current.tab === tab) showTab(tab); else select(entry);
  }
  for (const [index, button] of tabs.entries()) {
    button.addEventListener('click', () => activateTab(button));
    button.addEventListener('keydown', event => {
      let next: number;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); tabs[next].focus(); activateTab(tabs[next]);
    });
  }
  done.addEventListener('click', () => {
    const next = !completed(current);
    const siblings = entries.filter(entry => entry.materialId === current.materialId);
    // Expand an existing whole-material completion before toggling an individual item.
    if (getStoredStudiedIds().includes(current.materialId)) {
      for (const entry of siblings) readProgress(entry)[entryProgressStorage(entry).itemId] = true;
    }
    readProgress(current)[entryProgressStorage(current).itemId] = next;
    for (const [key, value] of progress) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory progress remains usable. */ }
    }
    const allDone = siblings.every(entry => Boolean(readProgress(entry)[entryProgressStorage(entry).itemId]));
    const studied = new Set(getStoredStudiedIds());
    if (allDone) studied.add(current.materialId); else studied.delete(current.materialId);
    saveStudiedIds([...studied], current.materialId);
    void syncStudiedToggle(current.materialId, allDone);
    const videoProgress = progress.get(`asumed_playlist_${current.materialId}`);
    if (videoProgress) window.dispatchEvent(new CustomEvent('playlist-progress-updated', { detail: { id: current.materialId, watched: videoProgress } }));
    refresh();
  });
  saved.addEventListener('click', () => setMaterialBookmarked(current.materialId, !getStoredBookmarkIds().includes(current.materialId)));
  get('[data-study-share]').addEventListener('click', async () => {
    try {
      const url = new URL(location.href); url.searchParams.set('item', current.key);
      await navigator.clipboard.writeText(url.href);
      get('[data-study-status]').textContent = 'Link copied.';
    } catch { get('[data-study-status]').textContent = 'Copy this page’s address to share it.'; }
  });
  const refreshFromStorage = () => { progress.clear(); refresh(); };
  window.addEventListener('bookmarks-updated', refresh, { signal: lifecycle.signal });
  window.addEventListener('studied-updated', refresh, { signal: lifecycle.signal });
  window.addEventListener('playlist-progress-updated', event => {
    const detail = (event as CustomEvent<{ id: string; watched: Record<string, boolean> }>).detail;
    if (detail?.id && detail.watched) progress.set(`asumed_playlist_${detail.id}`, detail.watched);
    refresh();
  }, { signal: lifecycle.signal });
  window.addEventListener('storage', refreshFromStorage, { signal: lifecycle.signal });
  window.addEventListener('popstate', () => select(entries.find(entry => entry.key === new URL(location.href).searchParams.get('item')) || entries[0], false), { signal: lifecycle.signal });
  document.addEventListener('astro:before-swap', () => { lifecycle.abort(); video.pause(); frame.removeAttribute('src'); }, { once: true });
  select(entries.find(entry => entry.key === new URL(location.href).searchParams.get('item')) || entries[0], false);
}
