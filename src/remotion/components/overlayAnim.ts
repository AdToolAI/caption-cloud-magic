/**
 * Gemeinsame Animations-Mathematik für Overlay-Elemente (v407).
 *
 * Wird identisch von der Studio-Vorschau (DOM) und vom Remotion-Export
 * benutzt, damit Vorschau und Render pixelgleich laufen.
 */
import type { OverlayAnimation } from '@/types/directors-cut';

export const OVERLAY_ENTER_SECONDS: Partial<Record<OverlayAnimation, number>> = {
  fadeIn: 0.6,
  scaleUp: 0.5,
  bounce: 0.7,
  highlight: 0.6,
  glitch: 0.8,
  slideLeft: 0.5,
  slideRight: 0.5,
  slideUp: 0.5,
  slideDown: 0.5,
  wipe: 0.6,
  pop: 0.45,
  blurIn: 0.6,
  stagger: 0.8,
  tickerLoop: 0,
  none: 0,
};

export const OVERLAY_EXIT_SECONDS = 0.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export interface OverlayVisualState {
  opacity: number;
  transform: string;
  filter?: string;
  /** 0..1 — für Wipe/Highlight/Progress-Masken */
  reveal: number;
  /** Anzahl sichtbarer Zeichen bei Typewriter (Infinity = alle) */
  visibleChars: number;
  /** Endlos-Offset für Ticker in Prozent */
  tickerOffset: number;
  /** Verzögerung pro Wort in Sekunden (Stagger) */
  staggerStep: number;
  /** Fortschritt der gesamten Standzeit 0..1 (für Progress-Bar) */
  lifeProgress: number;
}

export function computeOverlayVisual(params: {
  animation: OverlayAnimation;
  exit?: OverlayAnimation;
  /** Sekunden seit Overlay-Start */
  t: number;
  /** Gesamtdauer in Sekunden (Infinity erlaubt) */
  duration: number;
  textLength: number;
}): OverlayVisualState {
  const { animation, exit, t, duration, textLength } = params;
  const enterDur =
    animation === 'typewriter'
      ? Math.max(0.2, textLength / 15)
      : OVERLAY_ENTER_SECONDS[animation] ?? 0.6;

  const p = enterDur > 0 ? clamp01(t / enterDur) : 1;
  const e = easeOut(p);

  const finite = Number.isFinite(duration) && duration > 0;
  const lifeProgress = finite ? clamp01(t / duration) : 0;

  let opacity = 1;
  let transform = '';
  let filter: string | undefined;
  let reveal = 1;
  let visibleChars = Number.POSITIVE_INFINITY;
  let staggerStep = 0;

  switch (animation) {
    case 'fadeIn':
      opacity = p;
      transform = `translateY(${(1 - e) * 20}px)`;
      break;
    case 'scaleUp':
      opacity = clamp01(p * 2);
      transform = `scale(${0.4 + e * 0.6})`;
      break;
    case 'pop': {
      const overshoot = Math.sin(e * Math.PI) * 0.12;
      opacity = clamp01(p * 3);
      transform = `scale(${0.7 + e * 0.3 + overshoot})`;
      break;
    }
    case 'bounce': {
      const y = p < 0.5 ? -50 * (1 - easeOut(p / 0.5)) : -8 * Math.sin((p - 0.5) * Math.PI * 2) * (1 - p);
      opacity = clamp01(p * 3);
      transform = `translateY(${y}px)`;
      break;
    }
    case 'slideLeft':
      opacity = clamp01(p * 2);
      transform = `translateX(${(1 - e) * 140}px)`;
      break;
    case 'slideRight':
      opacity = clamp01(p * 2);
      transform = `translateX(${-(1 - e) * 140}px)`;
      break;
    case 'slideUp':
      opacity = clamp01(p * 2);
      transform = `translateY(${(1 - e) * 120}px)`;
      break;
    case 'slideDown':
      opacity = clamp01(p * 2);
      transform = `translateY(${-(1 - e) * 120}px)`;
      break;
    case 'wipe':
      reveal = e;
      break;
    case 'highlight':
      reveal = e;
      break;
    case 'blurIn':
      opacity = p;
      filter = `blur(${(1 - e) * 14}px)`;
      break;
    case 'typewriter':
      visibleChars = Math.floor(t * 15);
      break;
    case 'stagger':
      staggerStep = 0.07;
      break;
    case 'glitch': {
      const off = p < 1 ? Math.sin(t * 40) * (1 - p) * 4 : 0;
      opacity = clamp01(p * 4);
      transform = `translateX(${off}px)`;
      break;
    }
    case 'tickerLoop':
    case 'none':
    default:
      break;
  }

  // Ausblenden am Ende der Standzeit
  if (finite && exit && exit !== 'none') {
    const remaining = duration - t;
    if (remaining < OVERLAY_EXIT_SECONDS) {
      const q = clamp01(remaining / OVERLAY_EXIT_SECONDS);
      opacity = Math.min(opacity, q);
      switch (exit) {
        case 'slideLeft':
          transform += ` translateX(${(1 - q) * -140}px)`;
          break;
        case 'slideRight':
          transform += ` translateX(${(1 - q) * 140}px)`;
          break;
        case 'slideUp':
          transform += ` translateY(${(1 - q) * -120}px)`;
          break;
        case 'slideDown':
          transform += ` translateY(${(1 - q) * 120}px)`;
          break;
        case 'scaleUp':
        case 'pop':
          transform += ` scale(${0.85 + q * 0.15})`;
          break;
        case 'blurIn':
          filter = `${filter ? filter + ' ' : ''}blur(${(1 - q) * 12}px)`;
          break;
        case 'wipe':
          reveal = Math.min(reveal, q);
          break;
        default:
          break;
      }
    }
  }

  const tickerOffset = ((t * 12) % 200) - 100;

  return { opacity, transform: transform.trim(), filter, reveal, visibleChars, tickerOffset, staggerStep, lifeProgress };
}
