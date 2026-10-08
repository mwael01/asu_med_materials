import type {
  FlashcardCard,
  FlashcardDeck,
  FlashcardProgress,
  FlashcardRating,
} from '../../types/flashcards';
import {
  createReviewState,
  currentCard,
  reveal,
  rate,
  togglePaused,
  reviewAll,
  type ReviewState,
} from '../../utils/flashcards/review';
import {
  loadFlashcardProgress,
  saveFlashcardProgress,
  rateProgress,
  resetProgress,
  getCachedCards,
  cacheCardsPayload,
  cacheDeckMetadata,
} from '../../utils/flashcards/persistence';
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
  const shadeAgain = document.getElementById('shade-again');
  const shadeKnown = document.getElementById('shade-known');
  const controlsUnrevealed = document.getElementById('controls-unrevealed');
  const controlsRevealed = document.getElementById('controls-revealed');
  const progressCounter = document.getElementById('player-progress-counter');
  const progressPercent = document.getElementById('player-progress-percent');
  const progressBar = document.getElementById('player-progress-bar');
  const pausedScreen = document.getElementById('session-paused-screen');
  const completeScreen = document.getElementById('session-complete-screen');
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
      currentProgress = rateProgress(
        currentProgress,
        card.id,
        rating,
        card.contentHash,
        deckData.activeRevisionId || card.revisionId,
      );
      currentProgress.checkpointIndex = reviewState.currentIndex + 1;
      reviewState = rate(reviewState, rating);
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
        !reviewState.completed &&
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
      pauseBtn,
      resetBtn,
      reviewAgainBtn,
    ]) {
      if (button instanceof HTMLButtonElement) {
        button.disabled =
          !ready ||
          ([revealBtn, againBtn, knownBtn, btnToggleHint].includes(button) &&
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

    // Defensive deduplication across cards
    const seen = new Set<string>();
    const deduped: FlashcardCard[] = [];
    for (const c of cards) {
      const key =
        c.sourceNoteGuid && typeof c.sourceTemplateOrdinal === 'number'
          ? `${c.sourceNoteGuid}:${c.sourceTemplateOrdinal}`
          : c.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }
    cards = deduped;

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

    if (reviewState.completed) {
      viewport.classList.add('hidden');
      pausedScreen?.classList.add('hidden');
      completeScreen?.classList.remove('hidden');
      progressCounter.textContent = t('common.completed', lang);
      if (progressPercent) progressPercent.textContent = '100%';
      if (progressBar) progressBar.style.width = '100%';
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

    // Update progress bar and counter
    const currentPos = reviewState.currentIndex + 1;
    const totalInQueue = reviewState.queue.length;
    progressCounter.textContent = t('flashcards.progress', lang, {
      current: currentPos,
      total: totalInQueue,
    });
    const pct =
      totalInQueue > 0
        ? Math.round(((currentPos - 1) / totalInQueue) * 100)
        : 0;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    // Preserve question DOM, images, selection, and hints when only reveal/language changes.
    const cardKey = `${reviewState.currentIndex}:${card.id}:${card.contentHash}`;
    if (cardKey !== renderedCardKey) {
      renderedCardKey = cardKey;
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
        answerBody.innerHTML = cleanA;
        answerRendered = true;
      }
      answerContainer?.classList.remove('hidden');
      controlsUnrevealed?.classList.add('hidden');
      controlsRevealed?.classList.remove('hidden');
    } else {
      answerContainer?.classList.add('hidden');
      controlsUnrevealed?.classList.remove('hidden');
      controlsRevealed?.classList.add('hidden');
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
  confirmResetBtn?.addEventListener(
    'click',
    () => {
      if (!ready) return;
      resetDialog?.close();
      interruptVisuals();
      currentProgress = resetProgress(currentProgress);
      saveFlashcardProgress(uid, currentProgress).catch(console.error);
      reviewState = createReviewState(cards, currentProgress);
      renderedCardKey = '';
      render();
    },
    listenerOptions,
  );

  reviewAgainBtn?.addEventListener(
    'click',
    () => {
      if (!ready) return;
      interruptVisuals();
      reviewState = reviewAll(cards);
      renderedCardKey = '';
      render();
    },
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
