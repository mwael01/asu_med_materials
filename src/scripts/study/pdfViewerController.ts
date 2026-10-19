import * as pdfjsLib from 'pdfjs-dist';

// Configure standard local worker script to avoid CDN latency and enable offline PWA operation
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
}

export interface PdfViewerInstance {
  load(url: string, title?: string): Promise<void>;
  destroy(): void;
  goToPage(pageNum: number): Promise<void>;
  nextPage(): Promise<void>;
  prevPage(): Promise<void>;
  zoomIn(): Promise<void>;
  zoomOut(): Promise<void>;
  fitWidth(): Promise<void>;
  getCurrentPage(): number;
  getTotalPages(): number;
}

export function createPdfViewer(root: HTMLElement): PdfViewerInstance {
  const prevBtn = root.querySelector<HTMLButtonElement>('.pdf-prev-btn');
  const nextBtn = root.querySelector<HTMLButtonElement>('.pdf-next-btn');
  const pageInput = root.querySelector<HTMLInputElement>('.pdf-page-input');
  const totalPagesEl = root.querySelector<HTMLElement>('.pdf-total-pages');
  const titleEl = root.querySelector<HTMLElement>('.pdf-doc-title');
  const zoomInBtn = root.querySelector<HTMLButtonElement>('.pdf-zoom-in-btn');
  const zoomOutBtn = root.querySelector<HTMLButtonElement>('.pdf-zoom-out-btn');
  const fitWidthBtn = root.querySelector<HTMLButtonElement>('.pdf-fit-width-btn');
  const zoomLabel = root.querySelector<HTMLElement>('.pdf-zoom-label');
  const viewportEl = root.querySelector<HTMLElement>('.pdf-viewport');
  const canvas = root.querySelector<HTMLCanvasElement>('.pdf-canvas');
  const loadingOverlay = root.querySelector<HTMLElement>('.pdf-loading-overlay');
  const loadingText = root.querySelector<HTMLElement>('.pdf-loading-text');
  const errorOverlay = root.querySelector<HTMLElement>('.pdf-error-overlay');
  const errorMessage = root.querySelector<HTMLElement>('.pdf-error-message');
  const retryBtn = root.querySelector<HTMLButtonElement>('.pdf-retry-btn');
  const openOriginalBtn = root.querySelector<HTMLAnchorElement>('.pdf-open-original-btn');

  let currentUrl = root.dataset.initialUrl || '';
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  let currentLoadingTask: any = null;
  let currentRenderTask: any = null;
  let currentPage = 1;
  let totalPages = 1;
  let currentZoom = 1.0;
  let isFitWidth = true;
  let isDestroyed = false;

  const abortController = new AbortController();
  const { signal } = abortController;

  function setLoading(visible: boolean, text = 'Connecting stream...'): void {
    if (!loadingOverlay) return;
    if (loadingText) loadingText.textContent = text;
    if (visible) {
      loadingOverlay.classList.remove('hidden');
      loadingOverlay.classList.remove('opacity-0');
    } else {
      loadingOverlay.classList.add('opacity-0');
      setTimeout(() => {
        if (!visible) loadingOverlay.classList.add('hidden');
      }, 200);
    }
  }

  function showError(msg: string): void {
    setLoading(false);
    if (!errorOverlay) return;
    if (errorMessage) errorMessage.textContent = msg;
    if (openOriginalBtn && currentUrl) {
      openOriginalBtn.href = currentUrl;
      openOriginalBtn.hidden = false;
    }
    errorOverlay.classList.remove('hidden');
  }

  function hideError(): void {
    if (errorOverlay) errorOverlay.classList.add('hidden');
  }

  function updateControls(): void {
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (pageInput) {
      pageInput.value = String(currentPage);
      pageInput.max = String(totalPages);
    }
    if (totalPagesEl) totalPagesEl.textContent = String(totalPages);
    if (zoomLabel) {
      zoomLabel.textContent = isFitWidth ? 'Fit' : `${Math.round(currentZoom * 100)}%`;
    }
  }

  async function renderCurrentPage(): Promise<void> {
    if (!pdfDoc || !canvas || !viewportEl || isDestroyed) return;
    if (currentPage < 1 || currentPage > totalPages) return;

    if (currentRenderTask) {
      try {
        currentRenderTask.cancel();
      } catch {}
      currentRenderTask = null;
    }

    try {
      const page = await pdfDoc.getPage(currentPage);
      if (isDestroyed) return;

      const unscaledViewport = page.getViewport({ scale: 1.0 });

      let scale = currentZoom;
      if (isFitWidth) {
        // Calculate container available width minus padding (32px)
        const availableWidth = Math.max(240, viewportEl.clientWidth - 32);
        scale = availableWidth / unscaledViewport.width;
        currentZoom = scale;
      }

      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap to 2.5x to balance crispness with memory

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      const renderContext = {
        canvas: canvas,
        canvasContext: ctx,
        viewport: viewport,
        intent: 'display'
      };

      const renderTask = page.render(renderContext);
      currentRenderTask = renderTask;
      await renderTask.promise;
      currentRenderTask = null;

      updateControls();
      setLoading(false);

      // Preload next page in background for instant page flipping
      if (currentPage < totalPages) {
        pdfDoc.getPage(currentPage + 1).catch(() => {});
      }
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') {
        // Expected when zooming or switching pages while previous render is underway
        return;
      }
      console.error('PDF.js render page error:', err);
      showError('Failed to render page.');
    }
  }

  async function load(url: string, title?: string): Promise<void> {
    if (!url || isDestroyed) return;
    currentUrl = url;
    if (title && titleEl) titleEl.textContent = title;

    hideError();
    setLoading(true, 'Connecting PDF stream...');

    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch {}
      currentRenderTask = null;
    }
    if (currentLoadingTask) {
      try { currentLoadingTask.destroy(); } catch {}
      currentLoadingTask = null;
    }
    if (pdfDoc) {
      try { pdfDoc.cleanup(); } catch {}
      pdfDoc = null;
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
        rangeChunkSize: 65536,
        disableAutoFetch: false,
        withCredentials: false
      });

      loadingTask.onProgress = (progressData: { loaded: number; total: number }) => {
        if (progressData.total > 0) {
          const pct = Math.min(100, Math.round((progressData.loaded / progressData.total) * 100));
          setLoading(true, `Streaming PDF (${pct}%)...`);
        }
      };

      currentLoadingTask = loadingTask;
      const loadedPdf = await loadingTask.promise;
      if (isDestroyed) {
        loadedPdf.cleanup();
        return;
      }

      pdfDoc = loadedPdf;
      totalPages = loadedPdf.numPages;
      currentPage = 1;
      updateControls();

      await renderCurrentPage();
    } catch (err: any) {
      if (isDestroyed) return;
      console.error('PDF.js document loading error:', err);
      showError('Unable to stream PDF. Tap "Open Original" or retry.');
    }
  }

  async function goToPage(pageNum: number): Promise<void> {
    const target = Math.max(1, Math.min(totalPages, pageNum));
    if (target === currentPage) return;
    currentPage = target;
    setLoading(true, `Loading page ${currentPage}...`);
    await renderCurrentPage();
  }

  async function nextPage(): Promise<void> {
    if (currentPage < totalPages) {
      await goToPage(currentPage + 1);
    }
  }

  async function prevPage(): Promise<void> {
    if (currentPage > 1) {
      await goToPage(currentPage - 1);
    }
  }

  async function zoomIn(): Promise<void> {
    isFitWidth = false;
    currentZoom = Math.min(3.5, currentZoom * 1.25);
    await renderCurrentPage();
  }

  async function zoomOut(): Promise<void> {
    isFitWidth = false;
    currentZoom = Math.max(0.35, currentZoom / 1.25);
    await renderCurrentPage();
  }

  async function fitWidth(): Promise<void> {
    isFitWidth = true;
    await renderCurrentPage();
  }

  // --- Attach Controls & Event Listeners ---
  prevBtn?.addEventListener('click', () => { prevPage(); }, { signal });
  nextBtn?.addEventListener('click', () => { nextPage(); }, { signal });

  pageInput?.addEventListener('change', () => {
    const val = parseInt(pageInput.value, 10);
    if (!isNaN(val)) goToPage(val);
  }, { signal });

  pageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(pageInput.value, 10);
      if (!isNaN(val)) goToPage(val);
      pageInput.blur();
    }
  }, { signal });

  zoomInBtn?.addEventListener('click', () => { zoomIn(); }, { signal });
  zoomOutBtn?.addEventListener('click', () => { zoomOut(); }, { signal });
  fitWidthBtn?.addEventListener('click', () => { fitWidth(); }, { signal });
  retryBtn?.addEventListener('click', () => { if (currentUrl) load(currentUrl); }, { signal });

  // Touch Swipe for mobile slide-flipping
  let touchStartX = 0;
  let touchStartY = 0;
  viewportEl?.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { signal, passive: true });

  viewportEl?.addEventListener('touchend', (e: TouchEvent) => {
    if (e.changedTouches.length === 1 && isFitWidth) {
      const diffX = e.changedTouches[0].clientX - touchStartX;
      const diffY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.6) {
        if (diffX < 0) {
          nextPage();
        } else {
          prevPage();
        }
      }
    }
  }, { signal, passive: true });

  // Keyboard navigation when viewer is focused or hovered
  viewportEl?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      nextPage();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      prevPage();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToPage(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToPage(totalPages);
    }
  }, { signal });

  // Debounced Container Resize Observer
  let resizeTimer: any = null;
  const resizeObserver = new ResizeObserver(() => {
    if (isFitWidth && pdfDoc) {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!isDestroyed && isFitWidth) {
          renderCurrentPage();
        }
      }, 150);
    }
  });

  if (viewportEl) {
    resizeObserver.observe(viewportEl);
  }

  // Load initial URL if present
  if (currentUrl) {
    const initialTitle = root.dataset.title || '';
    load(currentUrl, initialTitle);
  }

  function destroy(): void {
    isDestroyed = true;
    abortController.abort();
    resizeObserver.disconnect();
    clearTimeout(resizeTimer);

    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch {}
      currentRenderTask = null;
    }
    if (currentLoadingTask) {
      try { currentLoadingTask.destroy(); } catch {}
      currentLoadingTask = null;
    }
    if (pdfDoc) {
      try { pdfDoc.cleanup(); } catch {}
      pdfDoc = null;
    }
  }

  return {
    load,
    destroy,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    fitWidth,
    getCurrentPage: () => currentPage,
    getTotalPages: () => totalPages
  };
}
