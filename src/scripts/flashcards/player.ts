import type {
  FlashcardCard,
  FlashcardDeck,
  FlashcardProgress,
  FlashcardRating,
  ReviewState,
} from '../../types/flashcards';
import {
  createReviewState,
  currentCard,
  reveal,
  rate,
  togglePaused,
  reviewProgress,
} from '../../utils/flashcards/review';
import {
  loadFlashcardProgress,
  saveFlashcardProgress,
  getCachedCards,
  cacheCardsPayload,
  cacheDeckMetadata,
} from '../../utils/flashcards/persistence';
import { rateProgress, resetProgress } from '../../utils/flashcards/progress';
import { getCachedUserProfile } from '../../firebase/auth';
import { cacheDeckImagesOnOpen } from '../../utils/flashcards/caching';
import { getCurrentLanguage, t } from '../../utils/i18n';
import { prepareCardHtml } from './cardHtml';
import { bindCardGestures } from './gestures';
import { createCardAnimations } from './animations';
import { createRatingFlow } from './ratingFlow';

let disposePlayer: (() => void) | undefined;

function initStudyPlayer() {
  disposePlayer?.();
  disposePlayer = undefined;
  const container = document.getElementById('study-player-container');
  if (!container) return;

  const deckData: FlashcardDeck = JSON.parse(
    container.getAttribute('data-deck') || '{}',
  );
  let cards: FlashcardCard[] = JSON.parse(
    container.getAttribute('data-initial-cards') || '[]',
  );

  const cardStage = document.getElementById('card-stage');
  const viewport = document.getElementById('card-stage-viewport');
  if (!cardStage || !viewport) return;
  const lifetime = new AbortController();
  const listenerOptions = { signal: lifetime.signal };
  const questionBody = document.getElementById('card-question-body');
  const answerContainer = document.getElementById('card-answer-container');
  const answerBody = document.getElementById('card-answer-body');
  const cardHintContainer = document.getElementById('card-hint-container');
  const cardHintPanel = document.getElementById('card-hint-panel');
  const btnToggleHint = document.getElementById('btn-toggle-hint');
  const cardOcclusionContainer = document.getElementById('card-occlusion-container');
  const btnToggleOcclusion = document.getElementById('btn-toggle-occlusion');
  const btnToggleOcclusionText = document.getElementById('btn-toggle-occlusion-text');
  const shadeAgain = document.getElementById('shade-again');
  const shadeKnown = document.getElementById('shade-known');
  const controlsUnrevealed = document.getElementById('controls-unrevealed');
  const controlsRevealed = document.getElementById('controls-revealed');
  const progressCounter = document.getElementById('player-progress-counter');
  const progressPercent = document.getElementById('player-progress-percent');
  const progressBar = document.getElementById('player-progress-bar');
  const pausedScreen = document.getElementById('session-paused-screen');
  const completeScreen = document.getElementById('session-complete-screen');
  const emptyScreen = document.getElementById('session-empty-screen');
  const pauseBtn = document.getElementById('btn-pause-session');
  const pauseBtnText = document.getElementById('pause-btn-text');
  const resumeBtn = document.getElementById('btn-resume-session');
  const resetBtn = document.getElementById('btn-reset-session');
  const reviewAgainBtn = document.getElementById('btn-review-again');

  const resetDialog = document.getElementById(
    'dialog-confirm-reset',
  ) as HTMLDialogElement | null;
  const cancelResetBtn = document.getElementById('btn-cancel-reset');
  const confirmResetBtn = document.getElementById('btn-confirm-reset');

  const revealBtn = document.getElementById('btn-reveal-answer');
  const againBtn = document.getElementById('btn-rate-again');
  const knownBtn = document.getElementById('btn-rate-known');

  let reviewState: ReviewState = createReviewState([]);
  let currentProgress: FlashcardProgress;
  let ready = false;
  let isTransitioning = false;
  let renderedCardKey = '';
  let preparedQuestion = '';
  let answerRendered = false;
  let visualGeneration = 0;
  let isOcclusionMaskHidden = false;
  const animations = createCardAnimations(cardStage);
  const flow = createRatingFlow({
    canRate: () =>
      ready &&
      !lifetime.signal.aborted &&
      !isTransitioning &&
      reviewState.revealed &&
      !reviewState.paused &&
      !reviewState.completed,
    commit: (rating) => {
      const card = currentCard(reviewState);
      if (!card) return;
      reviewState = rate(reviewState, rating);
      currentProgress = rateProgress(
        currentProgress,
        card.id,
        rating,
        card.contentHash,
        deckData.activeRevisionId || card.revisionId,
        reviewState.queue,
      );
      renderedCardKey = '';
      saveFlashcardProgress(uid, currentProgress).catch(console.error);
    },
    exit: animations.exit,
    render,
    enter: () =>
      reviewState.paused || reviewState.completed
        ? Promise.resolve(true)
        : animations.enter(),
    reset: animations.reset,
    busy: (value) => {
      isTransitioning = value;
      updateControls();
    },
  });
  const gestures = bindCardGestures(
    cardStage,
    { again: shadeAgain, known: shadeKnown },
    {
      canInteract: () =>
        ready &&
        !lifetime.signal.aborted &&
        !isTransitioning &&
        !reviewState.paused &&
        !!currentCard(reviewState) &&
        !document.querySelector('dialog[open]'),
      canDrag: () => reviewState.revealed,
      reveal: handleReveal,
      rate: requestRating,
      settle: () => {
        isTransitioning = true;
        updateControls();
        const token = ++visualGeneration;
        void animations.settle().then(() => {
          if (token !== visualGeneration || lifetime.signal.aborted) return;
          isTransitioning = false;
          updateControls();
        });
      },
    },
    lifetime.signal,
  );

  function updateControls() {
    for (const button of [
      revealBtn,
      againBtn,
      knownBtn,
      btnToggleHint,
      btnToggleOcclusion,
      pauseBtn,
      resetBtn,
      reviewAgainBtn,
    ]) {
      if (button instanceof HTMLButtonElement) {
        button.disabled =
          !ready ||
          (button === pauseBtn && !currentCard(reviewState)) ||
          ([resetBtn, reviewAgainBtn].includes(button) && reviewState.cards.length === 0) ||
          ([revealBtn, againBtn, knownBtn, btnToggleHint, btnToggleOcclusion].includes(button) &&
            isTransitioning);
      }
    }
    container?.setAttribute('aria-busy', String(!ready || isTransitioning));
  }
  function interruptVisuals() {
    visualGeneration++;
    gestures.cancel();
    flow.interrupt();
  }
  disposePlayer = () => {
    ready = false;
    lifetime.abort();
    interruptVisuals();
  };
  updateControls();
  const cachedUser = getCachedUserProfile();
  const uid = cachedUser?.uid || null;

  async function start() {
    // If initialCards was empty (offline), try local IndexedDB cache
    if ((!cards || cards.length === 0) && deckData.activeRevisionId) {
      const cached = await getCachedCards(
        deckData.id,
        deckData.activeRevisionId,
      );
      if (lifetime.signal.aborted) return;
      if (cached && cached.length > 0) {
        cards = cached;
      }
    }

    // Use the review engine's eligibility and deduplication rules everywhere.
    cards = createReviewState(cards).cards;

    // On-demand caching: Cache deck metadata, cards payload into IndexedDB, and image assets into Cache Storage
    if (cards && cards.length > 0 && deckData.activeRevisionId) {
      cacheDeckMetadata(deckData).catch(() => {});
      cacheCardsPayload(deckData.id, deckData.activeRevisionId, cards).catch(
        () => {},
      );
      cacheDeckImagesOnOpen(cards).catch(() => {});
    }

    const savedProgress = await loadFlashcardProgress(uid, deckData.id);
    if (lifetime.signal.aborted) return;
    currentProgress = savedProgress || {
      deckId: deckData.id,
      revisionId: deckData.activeRevisionId || '',
      checkpointIndex: 0,
      resetVersion: 1,
      updatedAt: Date.now(),
      cards: {},
    };

    reviewState = createReviewState(cards, currentProgress);
    currentProgress = {
      ...currentProgress,
      checkpointIndex: 0,
      pendingCardIds: [...reviewState.queue],
    };
    ready = true;
    render();
    updateControls();
  }

  function render() {
    if (
      !ready ||
      lifetime.signal.aborted ||
      !viewport ||
      !questionBody ||
      !answerBody ||
      !progressCounter
    )
      return;
    const lang = getCurrentLanguage();

    const { known, total, percent } = reviewProgress(reviewState);
    progressCounter.setAttribute('data-i18n-params', JSON.stringify({ known, total }));
    progressCounter.textContent = t('flashcards.progress', lang, { known, total });
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    emptyScreen?.classList.toggle('hidden', total > 0);
    if (total === 0) {
      viewport.classList.add('hidden');
      pausedScreen?.classList.add('hidden');
      completeScreen?.classList.add('hidden');
      return;
    }

    if (reviewState.completed) {
      viewport.classList.add('hidden');
      pausedScreen?.classList.add('hidden');
      completeScreen?.classList.remove('hidden');
      return;
    }

    completeScreen?.classList.add('hidden');

    if (reviewState.paused) {
      viewport.classList.add('hidden');
      pausedScreen?.classList.remove('hidden');
      if (pauseBtnText) pauseBtnText.textContent = t('flashcards.resume', lang);
      return;
    }

    viewport.classList.remove('hidden');
    pausedScreen?.classList.add('hidden');
    if (pauseBtnText) pauseBtnText.textContent = t('flashcards.pause', lang);

    const card = currentCard(reviewState);
    if (!card) return;

    function updateOcclusionVisibility(shouldHide: boolean) {
      if (!questionBody || typeof questionBody.querySelectorAll !== 'function') return;
      const overlays = questionBody.querySelectorAll<HTMLElement>(
        '#io-overlay, .io-overlay, #image-occlusion-overlay',
      );
      if (overlays.length === 0) {
        cardOcclusionContainer?.classList.add('hidden');
        return;
      }
      isOcclusionMaskHidden = shouldHide;
      for (const overlay of overlays) {
        if (shouldHide) {
          overlay.classList.add('is-hidden');
          overlay.style.display = 'none';
        } else {
          overlay.classList.remove('is-hidden');
          overlay.style.display = '';
        }
      }
      const currentLang = getCurrentLanguage();
      if (reviewState.revealed) {
        cardOcclusionContainer?.classList.remove('hidden');
        if (btnToggleOcclusionText) {
          btnToggleOcclusionText.textContent = t(
            shouldHide ? 'flashcards.showMask' : 'flashcards.hideMask',
            currentLang,
          );
        }
      } else {
        cardOcclusionContainer?.classList.add('hidden');
      }
    }

    // Preserve question DOM, images, selection, and hints when only reveal/language changes.
    const cardKey = `${card.id}:${card.contentHash}`;
    if (cardKey !== renderedCardKey) {
      renderedCardKey = cardKey;
      isOcclusionMaskHidden = false;
      cardOcclusionContainer?.classList.add('hidden');
      answerRendered = false;
      answerBody.innerHTML = '';
      // Render front question
      const { html: cleanQ, hintText } = prepareCardHtml(card.questionHtml);
      preparedQuestion = cleanQ;
      const qDir =
        card.questionDirection ||
        (/[\u0600-\u06FF]/.test(cleanQ.replace(/<[^>]+>/g, ''))
          ? 'rtl'
          : 'ltr');
      questionBody.setAttribute('dir', qDir);
      questionBody.className = `card-html text-center text-lg sm:text-xl font-medium leading-relaxed select-text`;
      questionBody.innerHTML = cleanQ;

      // Handle Hint UI
      if (hintText && cardHintContainer && cardHintPanel) {
        cardHintContainer.classList.remove('hidden');
        cardHintPanel.innerHTML = hintText;
        cardHintPanel.classList.add('hidden');
        if (btnToggleHint) {
          const btnSpan = btnToggleHint.querySelector('span');
          if (btnSpan) btnSpan.textContent = t('flashcards.showHint', lang);
        }
      } else if (cardHintContainer) {
        cardHintContainer.classList.add('hidden');
      }
    }

    // Render answer if revealed
    if (reviewState.revealed) {
      if (!answerRendered) {
        const { html: cleanA } = prepareCardHtml(
          card.answerHtml,
          preparedQuestion,
        );
        const aDir =
          card.answerDirection ||
          (/[\u0600-\u06FF]/.test(cleanA.replace(/<[^>]+>/g, ''))
            ? 'rtl'
            : 'ltr');
        answerBody.setAttribute('dir', aDir);
        answerBody.className = `card-html text-center text-base sm:text-lg leading-relaxed select-text`;
        const hasContent =
          cleanA.replace(/<[^>]+>/g, '').trim().length > 0 ||
          /<img\b/i.test(cleanA);
        answerBody.innerHTML = hasContent
          ? cleanA
          : `<p class="text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 italic">${t('flashcards.occlusionRevealed', lang)}</p>`;
        answerRendered = true;
      }
      answerContainer?.classList.remove('hidden');
      controlsUnrevealed?.classList.add('hidden');
      controlsRevealed?.classList.remove('hidden');
      updateOcclusionVisibility(true);
    } else {
      answerContainer?.classList.add('hidden');
      controlsUnrevealed?.classList.remove('hidden');
      controlsRevealed?.classList.add('hidden');
      updateOcclusionVisibility(false);
    }
  }

  function handleReveal() {
    if (
      !ready ||
      reviewState.revealed ||
      reviewState.completed ||
      reviewState.paused ||
      isTransitioning
    )
      return;
    gestures.cancelActive();
    reviewState = reveal(reviewState);
    render();

    animations.reveal(answerContainer, controlsRevealed);
  }

  function requestRating(rating: FlashcardRating) {
    // Buttons/keyboard may interrupt a held pointer; a released toss retains its transform.
    gestures.cancelActive();
    void flow.request(rating).catch(console.error);
  }

  function handlePause() {
    if (!ready) return;
    interruptVisuals();
    reviewState = togglePaused(reviewState);
    render();
  }

  // Toggle Hint panel
  btnToggleHint?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      if (!cardHintPanel) return;
      const isCurrentlyHidden = cardHintPanel.classList.toggle('hidden');
      const btnSpan = btnToggleHint.querySelector('span');
      if (btnSpan) {
        btnSpan.textContent = t(
          isCurrentlyHidden ? 'flashcards.showHint' : 'flashcards.hideHint',
          getCurrentLanguage(),
        );
      }
    },
    listenerOptions,
  );

  // Toggle Occlusion Mask
  btnToggleOcclusion?.addEventListener(
    'click',
    (e) => {
      e.stopPropagation();
      if (!questionBody) return;
      const overlays = questionBody.querySelectorAll<HTMLElement>(
        '#io-overlay, .io-overlay, #image-occlusion-overlay',
      );
      if (overlays.length === 0) return;
      isOcclusionMaskHidden = !isOcclusionMaskHidden;
      for (const overlay of overlays) {
        if (isOcclusionMaskHidden) {
          overlay.classList.add('is-hidden');
          overlay.style.display = 'none';
        } else {
          overlay.classList.remove('is-hidden');
          overlay.style.display = '';
        }
      }
      if (btnToggleOcclusionText) {
        btnToggleOcclusionText.textContent = t(
          isOcclusionMaskHidden ? 'flashcards.showMask' : 'flashcards.hideMask',
          getCurrentLanguage(),
        );
      }
    },
    listenerOptions,
  );

  // Click on diagram directly to toggle mask when revealed
  questionBody?.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          '#io-wrapper, .io-wrapper, #image-occlusion-container, .image-occlusion-container',
        )
      ) {
        if (reviewState.revealed) {
          const overlays = questionBody.querySelectorAll<HTMLElement>(
            '#io-overlay, .io-overlay, #image-occlusion-overlay',
          );
          if (overlays.length === 0) return;
          isOcclusionMaskHidden = !isOcclusionMaskHidden;
          for (const overlay of overlays) {
            if (isOcclusionMaskHidden) {
              overlay.classList.add('is-hidden');
              overlay.style.display = 'none';
            } else {
              overlay.classList.remove('is-hidden');
              overlay.style.display = '';
            }
          }
          if (btnToggleOcclusionText) {
            btnToggleOcclusionText.textContent = t(
              isOcclusionMaskHidden ? 'flashcards.showMask' : 'flashcards.hideMask',
              getCurrentLanguage(),
            );
          }
        }
      }
    },
    listenerOptions,
  );

  // Keyboard navigation:
  // - Space or ArrowUp: Reveal answer
  // - ArrowRight (or 2): Known (Answered right)
  // - ArrowLeft (or 1): Again (Answered wrong)
  function handleKeydown(e: KeyboardEvent) {
    if (
      !ready ||
      isTransitioning ||
      e.repeat ||
      document.querySelector('dialog[open]')
    )
      return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest('button, a, input, textarea, select, [contenteditable]')
    ) {
      return;
    }

    if (e.code === 'Space' || e.key === 'ArrowUp') {
      if (
        !reviewState.revealed &&
        !reviewState.completed &&
        !reviewState.paused
      ) {
        e.preventDefault();
        handleReveal();
      }
    } else if (e.key === 'ArrowRight' || e.key === '2') {
      if (
        reviewState.revealed &&
        !reviewState.completed &&
        !reviewState.paused
      ) {
        e.preventDefault();
        requestRating('known');
      }
    } else if (e.key === 'ArrowLeft' || e.key === '1') {
      if (
        reviewState.revealed &&
        !reviewState.completed &&
        !reviewState.paused
      ) {
        e.preventDefault();
        requestRating('again');
      }
    }
  }

  revealBtn?.addEventListener('click', handleReveal, listenerOptions);
  againBtn?.addEventListener(
    'click',
    () => requestRating('again'),
    listenerOptions,
  );
  knownBtn?.addEventListener(
    'click',
    () => requestRating('known'),
    listenerOptions,
  );
  pauseBtn?.addEventListener('click', handlePause, listenerOptions);
  resumeBtn?.addEventListener('click', handlePause, listenerOptions);

  resetBtn?.addEventListener(
    'click',
    () => {
      if (!ready) return;
      interruptVisuals();
      render();
      resetDialog?.showModal();
    },
    listenerOptions,
  );
  cancelResetBtn?.addEventListener(
    'click',
    () => resetDialog?.close(),
    listenerOptions,
  );

  async function startFreshPass() {
    if (!ready) return;
    interruptVisuals();
    ready = false;
    updateControls();
    reviewState = createReviewState(cards);
    currentProgress = resetProgress(currentProgress, reviewState.queue);
    renderedCardKey = '';
    try {
      await saveFlashcardProgress(uid, currentProgress);
    } catch (error) {
      console.error('Unable to save fresh flashcard pass:', error);
    } finally {
      if (!lifetime.signal.aborted) {
        ready = true;
        render();
        updateControls();
      }
    }
  }

  confirmResetBtn?.addEventListener(
    'click',
    () => {
      if (!ready) return;
      resetDialog?.close();
      void startFreshPass();
    },
    listenerOptions,
  );

  reviewAgainBtn?.addEventListener(
    'click',
    () => { void startFreshPass(); },
    listenerOptions,
  );

  window.addEventListener(
    'asumed-language-changed',
    () => {
      interruptVisuals();
      render();
      const label = btnToggleHint?.querySelector('span');
      if (label)
        label.textContent = t(
          cardHintPanel?.classList.contains('hidden')
            ? 'flashcards.showHint'
            : 'flashcards.hideHint',
          getCurrentLanguage(),
        );
    },
    listenerOptions,
  );
  window.addEventListener('keydown', handleKeydown, listenerOptions);
  document.addEventListener(
    'astro:before-swap',
    () => {
      disposePlayer?.();
      disposePlayer = undefined;
    },
    listenerOptions,
  );
  window.addEventListener(
    'pagehide',
    () => {
      interruptVisuals();
      render();
    },
    listenerOptions,
  );
  // Snap-back or exit animations cannot retain a busy state in a suspended tab.
  const interruptAndRender = () => {
    interruptVisuals();
    render();
  };
  window.addEventListener('blur', interruptAndRender, listenerOptions);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) interruptAndRender();
    },
    listenerOptions,
  );

  void start().catch((error) => {
    if (lifetime.signal.aborted) return;
    console.error('Unable to start flashcard player:', error);
  });
}

initStudyPlayer();
document.addEventListener('astro:after-swap', initStudyPlayer);
