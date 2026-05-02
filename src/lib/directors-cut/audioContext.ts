/**
 * Singleton AudioContext for the Director's Cut Studio.
 *
 * Why a singleton?
 * - Browsers limit the number of AudioContexts per page (~6).
 * - `createMediaElementSource()` permanently re-routes a media element's
 *   audio output. If we ever close/recreate the context, the media element
 *   becomes silent forever. Using one shared context avoids this.
 * - We need a single "unlock on user gesture" point that every audio
 *   producer (video, voiceover, music) can rely on.
 */

let _ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!_ctx) {
    const Ctor: typeof AudioContext | undefined =
      (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) || undefined;

    if (!Ctor) {
      throw new Error('Web Audio API not supported in this browser');
    }
    _ctx = new Ctor();
  }
  return _ctx;
}

/**
 * Resume the shared AudioContext. MUST be called from inside a user
 * gesture handler (click, key press, touch) — otherwise the browser
 * keeps it suspended and ALL audio routed through Web Audio is silent.
 */
export async function unlockAudio(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (err) {
    console.warn('[audioContext] unlockAudio failed:', err);
  }
}

/**
 * Best-effort "prime" of an HTMLAudioElement during a user gesture so a
 * later programmatic `play()` (from a setInterval / requestAnimationFrame
 * loop) is not blocked by the autoplay policy.
 */
export async function primeAudioElement(el: HTMLAudioElement): Promise<void> {
  try {
    const wasMuted = el.muted;
    el.muted = true;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === 'function') {
      await playPromise.catch(() => {});
    }
    el.pause();
    el.currentTime = 0;
    el.muted = wasMuted;
  } catch {
    /* ignore — we'll surface real errors on the actual play */
  }
}
