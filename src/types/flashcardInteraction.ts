import type { FlashcardRating } from './flashcards';

export type GesturePhase = 'pending' | 'scrolling' | 'dragging';
export interface CardGesture {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startedAt: number;
  width: number;
  dx: number;
  dy: number;
  maxDistance: number;
  phase: GesturePhase;
}
export interface PointerSample {
  pointerId: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
  timeStamp: number;
}
export type GestureResult =
  | { type: 'tap' }
  | { type: 'reset' }
  | { type: 'rate'; rating: FlashcardRating };

export interface CardGestureCallbacks {
  canInteract(): boolean;
  canDrag(): boolean;
  reveal(): void;
  rate(rating: FlashcardRating): void;
  settle(): void;
}

export interface RatingCallbacks {
  canRate(): boolean;
  commit(rating: FlashcardRating): void;
  exit(rating: FlashcardRating): Promise<boolean>;
  render(): void;
  enter(): Promise<boolean>;
  reset(): void;
  busy(value: boolean): void;
}
