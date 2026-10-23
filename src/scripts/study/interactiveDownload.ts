import { isHostedHtmlDocument } from '../../utils/documentViewer';

/** Fetch in the student's browser: the CDN challenges server-side HTML clients. */
export async function fetchInteractiveDocument(url: string, fetchFile: typeof fetch = fetch): Promise<Blob> {
  if (!isHostedHtmlDocument(url)) throw new Error('Unsupported interactive document');
  const response = await fetchFile(url, { credentials: 'omit', redirect: 'error' });
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('text/html')) {
    throw new Error('Interactive file unavailable');
  }
  return response.blob();
}

let initialized = false;
export function initInteractiveDownloads(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', async event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-html-download]');
    const url = link?.dataset.htmlDownload;
    if (!link || !url || !isHostedHtmlDocument(url)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (link.dataset.downloading) return;
    link.dataset.downloading = 'true';
    try {
      const blob = await fetchInteractiveDocument(url);
      const objectUrl = URL.createObjectURL(blob);
      const save = document.createElement('a');
      save.href = objectUrl; save.download = link.download || 'interactive.html';
      document.body.append(save); save.click(); save.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      delete link.dataset.downloading;
    }
  }, { capture: true });
}
