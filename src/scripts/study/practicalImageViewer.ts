import type { PracticalGalleryImage } from '../../types/practicalImages';
import { updateImageCaption } from './imageCaption';
import { getDocumentDownloadUrl } from '../../utils/documentViewer';

export function initPracticalImageViewers(): void {
  document.querySelectorAll<HTMLElement>('[data-practical-viewer]').forEach(root => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const images: PracticalGalleryImage[] = JSON.parse(root.querySelector('[data-practical-images]')?.textContent || '[]');
    if (!images.length) return;
    const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    const image = get<HTMLImageElement>('[data-practical-image]');
    const stage = get('[data-image-stage]');
    const status = get('[data-image-status]');
    const previous = get<HTMLButtonElement>('[data-image-prev]');
    const next = get<HTMLButtonElement>('[data-image-next]');
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-image-key]')];
    const lifecycle = new AbortController();
    let selected = Math.max(0, images.findIndex(item => item.key === new URL(location.href).searchParams.get('image')));
    let zoom = 1;
    let generation = 0;
    function fit(): void {
      zoom = 1; image.style.width = ''; image.style.height = ''; image.style.maxWidth = '100%'; image.style.maxHeight = '100%';
      stage.style.alignItems = 'center'; stage.style.justifyContent = 'center';
      stage.scrollTop = 0; stage.scrollLeft = 0;
    }
    function refresh(): void {
      previous.disabled = selected === 0; next.disabled = selected === images.length - 1;
      buttons.forEach(button => button.setAttribute('aria-current', String(button.dataset.imageKey === images[selected].key)));
    }
    function prefetch(): void {
      if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
      for (const index of [selected - 1, selected + 1]) {
        if (!images[index]) continue;
        const adjacent = new Image(); adjacent.decoding = 'async'; adjacent.src = images[index].url;
      }
    }
    async function select(index: number): Promise<void> {
      if (index < 0 || index >= images.length || index === selected) return;
      selected = index; const current = images[index]; const request = ++generation;
      fit(); image.style.visibility = 'hidden'; stage.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading image…'; status.hidden = false;
      image.alt = current.altText || current.title; image.src = current.url;
      get('[data-image-title]').textContent = current.title;
      const author = get('[data-image-author]'); author.textContent = current.author || ''; author.hidden = !current.author;
      updateImageCaption(root, true, current.description, current.sourceUrls);
      get<HTMLAnchorElement>('[data-image-download]').href = getDocumentDownloadUrl(current.url, current.materialId, current.id) || current.url;
      refresh();
      const url = new URL(location.href); url.searchParams.set('image', current.key); history.replaceState(null, '', url);
      buttons[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      try {
        await image.decode();
        if (request !== generation) return;
        image.style.visibility = ''; status.hidden = true; prefetch();
      } catch {
        if (request !== generation) return;
        status.textContent = 'Image could not load. Select it again to retry.';
      } finally {
        if (request === generation) stage.setAttribute('aria-busy', 'false');
      }
    }
    previous.addEventListener('click', () => { void select(selected - 1); });
    next.addEventListener('click', () => { void select(selected + 1); });
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      if (index === selected && image.style.visibility === 'hidden') selected = -1;
      void select(index);
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-image-zoom]').forEach(button => button.addEventListener('click', () => {
      zoom = Math.max(1, Math.min(5, zoom * Number(button.dataset.imageZoom)));
      if (zoom === 1) { fit(); return; }
      image.style.maxWidth = 'none'; image.style.maxHeight = 'none';
      const aspect = image.naturalWidth / image.naturalHeight || 4 / 3;
      const fittedWidth = Math.min(stage.clientWidth, stage.clientHeight * aspect);
      image.style.width = `${fittedWidth * zoom}px`; image.style.height = 'auto';
      stage.style.alignItems = 'start'; stage.style.justifyContent = 'start';
    }));
    get('[data-image-reset]').addEventListener('click', fit);
    get('[data-image-fullscreen]').addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      get('[data-image-fullscreen]').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; fit();
    }, { signal: lifecycle.signal });
    window.addEventListener('resize', fit, { signal: lifecycle.signal });
    window.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, [contenteditable]'))) return;
      const index = event.key === 'ArrowRight' ? selected + 1 : event.key === 'ArrowLeft' ? selected - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? images.length - 1 : null;
      if (index !== null) { event.preventDefault(); void select(index); }
    }, { signal: lifecycle.signal });
    let start: { x: number; y: number } | null = null;
    stage.addEventListener('touchstart', event => {
      start = zoom === 1 && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    stage.addEventListener('touchend', event => {
      if (!start || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y; start = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) void select(selected + (dx < 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('astro:before-swap', () => { generation++; lifecycle.abort(); }, { once: true });
    refresh();
  });
}
