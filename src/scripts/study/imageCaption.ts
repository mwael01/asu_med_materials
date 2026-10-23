export function updateImageCaption(root: ParentNode, visible: boolean, description = '', sourceUrls: string[] = []): void {
  const panel = root.querySelector<HTMLElement>('[data-image-caption]');
  if (!panel) return;
  panel.hidden = !visible;
  const text = panel.querySelector<HTMLElement>('[data-image-description]');
  if (text) { text.textContent = description; text.hidden = !description; }
  panel.querySelector('[data-image-sources]')?.replaceChildren(...sourceUrls.filter(url => /^https?:\/\//i.test(url)).map((url, i) => {
    const link = document.createElement('a');
    link.href = url; link.textContent = `Source ${i + 1}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'underline';
    return link;
  }));
}
