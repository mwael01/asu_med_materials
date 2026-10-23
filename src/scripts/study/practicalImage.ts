export function updatePracticalImage(root: ParentNode, image: HTMLImageElement, description = '', altText = '', sourceUrls: string[] = []): void {
  const panel = root.querySelector<HTMLElement>('[data-practical-image]');
  if (!panel) return;
  panel.hidden = image.hidden;
  image.alt = altText || image.alt;
  image.style.width = '100%';
  image.style.height = 'auto';
  image.style.maxWidth = 'none';
  image.style.maxHeight = '80vh';
  image.dataset.zoom = '1';
  const text = panel.querySelector<HTMLElement>('[data-image-description]');
  if (text) text.textContent = description;
  const sources = panel.querySelector('[data-image-sources]');
  sources?.replaceChildren(...sourceUrls.filter(url => /^https?:\/\//i.test(url)).map((url, i) => {
    const link = document.createElement('a');
    link.href = url; link.textContent = `Source ${i + 1}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }));
}

export function initPracticalImages(): void {
  document.querySelectorAll<HTMLElement>('[data-practical-image]').forEach(panel => {
    if (panel.dataset.initialized) return;
    panel.dataset.initialized = 'true';
    const container = panel.parentElement;
    const image = container?.querySelector<HTMLImageElement>('img');
    if (!image) return;
    image.style.height = 'auto';
    image.style.maxWidth = 'none';
    image.parentElement!.style.overflow = 'auto';
    panel.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      if (button.hasAttribute('data-image-fullscreen')) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void container?.requestFullscreen?.().catch(() => {});
        return;
      }
      const zoom = button.hasAttribute('data-image-reset') ? 1 : Math.min(5, Math.max(1, Number(image.dataset.zoom || 1) * Number(button.dataset.imageZoom || 1)));
      image.dataset.zoom = String(zoom);
      image.style.width = `${zoom * 100}%`;
      image.style.maxHeight = zoom > 1 ? 'none' : '80vh';
      image.style.flexShrink = '0';
    });
  });
}
