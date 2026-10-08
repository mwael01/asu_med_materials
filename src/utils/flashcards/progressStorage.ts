import type { FlashcardProgress, FlashcardProgressStorageAdapter } from '../../types/flashcards';
import { selectProgress } from './progress';

/** Serialize cache writes separately from cloud writes so offline sync cannot block study. */
export function createProgressStorage(adapter: FlashcardProgressStorageAdapter, remoteReadTimeoutMs = 5000) {
  const localWrites = new Map<string, Promise<void>>();
  const remoteWrites = new Map<string, Promise<void>>();
  const keyFor = (uid: string | null, deckId: string) => `${uid || 'guest'}:${deckId}`;

  function enqueue(tasks: Map<string, Promise<void>>, key: string, task: () => Promise<void>): Promise<void> {
    const next = (tasks.get(key) || Promise.resolve()).catch(() => {}).then(task);
    tasks.set(key, next);
    const cleanup = () => { if (tasks.get(key) === next) tasks.delete(key); };
    void next.then(cleanup, cleanup);
    return next;
  }

  async function readRemote(uid: string, deckId: string): Promise<FlashcardProgress | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        adapter.loadRemote(uid, deckId),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), remoteReadTimeoutMs); }),
      ]);
    } catch (error) {
      console.warn('[Persistence] Cloud progress read failed:', error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readLocal(uid: string | null, deckId: string): Promise<FlashcardProgress | null> {
    try {
      return await adapter.loadLocal(uid, deckId);
    } catch (error) {
      console.warn('[Persistence] Local progress read failed:', error);
      return null;
    }
  }

  async function load(uid: string | null, deckId: string): Promise<FlashcardProgress | null> {
    if (!deckId) return null;
    const key = keyFor(uid, deckId);
    await localWrites.get(key)?.catch(() => {});
    const local = await readLocal(uid, deckId);
    if (!uid || !adapter.isOnline()) return local;
    const remote = await readRemote(uid, deckId);
    if (!remote) {
      await localWrites.get(key)?.catch(() => {});
      return selectProgress(local, await readLocal(uid, deckId));
    }

    let selected = selectProgress(local, remote);
    // Recheck within the write queue: a rating saved during the cloud read must win.
    await enqueue(localWrites, key, async () => {
      const latest = await readLocal(uid, deckId);
      selected = selectProgress(latest || local, remote);
      if (selected && selected !== latest) {
        try {
          await adapter.saveLocal(uid, selected);
        } catch (error) {
          console.warn('[Persistence] Could not cache cloud progress:', error);
        }
      }
    });
    return selected;
  }

  function save(uid: string | null, progress: FlashcardProgress): Promise<void> {
    if (!progress.deckId) return Promise.resolve();
    // Snapshot before queuing: later UI mutations must not alter an earlier save.
    const snapshot: FlashcardProgress = {
      ...progress,
      checkpointIndex: 0,
      cards: Object.fromEntries(Object.entries(progress.cards).map(([id, card]) => [id, { ...card }])),
      ...(progress.pendingCardIds ? { pendingCardIds: [...progress.pendingCardIds] } : {}),
    };
    const key = keyFor(uid, snapshot.deckId);
    return enqueue(localWrites, key, async () => {
      try {
        await adapter.saveLocal(uid, snapshot);
      } finally {
        if (uid && adapter.isOnline()) {
          void enqueue(remoteWrites, key, async () => {
            try {
              if (!await adapter.saveRemote(uid, snapshot)) {
                console.warn('[Persistence] Cloud progress sync failed; local progress retained.');
              }
            } catch (error) {
              console.warn('[Persistence] Cloud progress sync failed; local progress retained:', error);
            }
          });
        }
      }
    });
  }

  return { load, save };
}
