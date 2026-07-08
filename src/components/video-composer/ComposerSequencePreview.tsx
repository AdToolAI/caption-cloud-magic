import { useEffect, useMemo, useRef, useState, useCallback, useReducer } from 'react';
import { Play, Pause, Volume2, VolumeX, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type {
  ComposerScene,
  SubtitlesConfig,
  TextPosition,
  GlobalTextOverlay,
} from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';
import { PreviewTextOverlayLayer } from './PreviewTextOverlayLayer';
import type { SceneAudioClip } from './SoundDesignPanel';

interface Props {
  scenes: ComposerScene[];
  subtitles?: SubtitlesConfig;
  /** Timeline-based overlays that span the full video (independent of scenes). */
  globalTextOverlays?: GlobalTextOverlay[];
  /** Voiceover audio URL — plays in sync with the video timeline. */
  voiceoverUrl?: string | null;
  /** Background music URL — loops underneath the video at the configured volume. */
  backgroundMusicUrl?: string | null;
  /** Background music volume (0..1). Defaults to 0.3. */
  backgroundMusicVolume?: number;
  /** AI-generated ambient/sfx/foley clips — synced to scene offsets so the
   *  preview matches what mux-audio-to-video will mix into the final render. */
  sceneAudioClips?: SceneAudioClip[];
  /** Notifies parent of playhead changes so the editor timeline can stay in sync. */
  onTimeUpdate?: (currentTime: number, totalDuration: number) => void;
}

const POSITION_TO_STYLE: Record<TextPosition, React.CSSProperties> = {
  top: { top: '8%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' },
  bottom: { bottom: '14%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
  'top-left': { top: '6%', left: '5%' },
  'top-right': { top: '6%', right: '5%', textAlign: 'right' },
  'bottom-left': { bottom: '14%', left: '5%' },
  'bottom-right': { bottom: '14%', right: '5%', textAlign: 'right' },
};

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const CROSSFADE_MS = 400;
/** Cut = hard swap, but a few frames of blend hide the src swap glitch. */
const CUT_MS = 60;
/** Resolve the effective preview transition duration (ms) for the LEAVING scene.
 *  Uses the same fields the exporter reads (`transitionType` / `transitionDuration`),
 *  so preview mirrors what the final MP4 will show. `none` → hard cut. */
const resolveTransitionMs = (scene: ComposerScene | undefined): number => {
  if (!scene) return CROSSFADE_MS;
  const type = (scene.transitionType ?? 'crossfade') as string;
  if (type === 'none') return CUT_MS;
  const secs = Number(scene.transitionDuration);
  if (!Number.isFinite(secs) || secs <= 0) return CROSSFADE_MS;
  return Math.round(Math.min(1.5, Math.max(0.2, secs)) * 1000);
};
const STANDBY_BUDGET_MS = 1500;
/** Max wait when standby is buffered enough to start (HAVE_CURRENT_DATA but not FUTURE_DATA). */
const STANDBY_SOFT_WAIT_MS = 200;
const WATCHDOG_MS = 5000;
/** First chunk to range-fetch per clip — covers moov atom + first frames. */
const PREWARM_BYTES = 524288;
/** Max parallel prewarm requests. */
const PREWARM_CONCURRENCY = 2;

type Slot = 'A' | 'B';
type AnySlot = 'A' | 'B' | 'C';

export default function ComposerSequencePreview({
  scenes,
  subtitles,
  globalTextOverlays,
  voiceoverUrl,
  backgroundMusicUrl,
  backgroundMusicVolume = 0.3,
  sceneAudioClips,
  onTimeUpdate,
}: Props) {
  const { t } = useTranslation();

  // Robust image-scene detection: a scene counts as an image when either
  // uploadType is 'image' OR clipSource is 'ai-image' (the latter handles
  // the case where local state hasn't synced uploadType yet after generation).
  const isImageScene = (s: ComposerScene | undefined): boolean =>
    !!s && (s.uploadType === 'image' || s.clipSource === 'ai-image');
  const getImageUrl = (s: ComposerScene | undefined): string | undefined =>
    s?.clipUrl || s?.uploadUrl;

  // A scene is "playable" only when it actually has a finalized clip/image.
  // We intentionally check `clipStatus` so a stale local `clipUrl` cannot
  // bleed through when the DB already moved the scene back to 'pending'
  // (e.g. after a reset / "neu rendern"). Image-scene uploads (`uploadUrl`)
  // are always considered ready.
  const playable = useMemo(
    () =>
      scenes.filter((s) => {
        if (isImageScene(s)) {
          // Image scenes: an uploaded image is always playable; an AI-image
          // clip only when the scene is marked ready.
          if (s.uploadUrl) return true;
          return s.clipStatus === 'ready' && !!s.clipUrl;
        }
        return s.clipStatus === 'ready' && !!s.clipUrl;
      }),
    [scenes],
  );

  const startOffsets = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const s of playable) {
      arr.push(acc);
      acc += s.durationSeconds || 0;
    }
    return arr;
  }, [playable]);

  const totalDuration = useMemo(
    () => playable.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
    [playable],
  );

  const [sceneIdx, setSceneIdx] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  // Force re-render hook for opacity changes (refs alone don't trigger renders).
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  // ── Refs are the source of truth (no stale closures) ──────────
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  /** Hidden prefetch slot — always holds sceneIdx + 2 so the browser
   *  has the moov atom + first frames decoded before that scene is needed. */
  const videoCRef = useRef<HTMLVideoElement>(null);

  /** Which slot DOM element is currently the visible/active player. */
  const activeSlotRef = useRef<Slot>('A');
  /** Maps each slot to the sceneIdx whose src is currently loaded into it. -1 = empty. */
  const slotMapRef = useRef<{ A: number; B: number; C: number }>({ A: -1, B: -1, C: -1 });
  /** Imperative src holders so React doesn't trigger unwanted reloads. */
  const slotASrcRef = useRef<string | undefined>(undefined);
  const slotBSrcRef = useRef<string | undefined>(undefined);
  const slotCSrcRef = useRef<string | undefined>(undefined);
  /** Opacity per slot (driven by ref, mirrored to DOM via forceRender). */
  const slotAOpacityRef = useRef(1);
  const slotBOpacityRef = useRef(0);

  /** Singleton transition lock — prevents overlapping advances. */
  const transitioningRef = useRef(false);
  /** Guards against double-advance from time-cap + onEnded racing. */
  const advancedRef = useRef(false);
  /** Latest scene index — readable inside async callbacks without closure problems. */
  const sceneIdxRef = useRef(0);
  /** Tracks last timeupdate timestamp for the watchdog. */
  const lastTimeUpdateRef = useRef<number>(performance.now());

  /** All pending timers — cleared on unmount or scene reset. */
  const timersRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const imageStartRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Background music audio element — independent linear track, looped under VO. */
  const musicRef = useRef<HTMLAudioElement>(null);
  /** AI SFX/Ambient/Foley audio elements — keyed by clip id (set via JSX refs). */
  const sfxAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  /** Tracks whether SFX elements have been "primed" by a user gesture (autoplay policy). */
  const sfxPrimedRef = useRef(false);

  const playableRef = useRef(playable);
  const startOffsetsRef = useRef(startOffsets);
  const playingRef = useRef(playing);
  const mutedRef = useRef(muted);
  useEffect(() => { playableRef.current = playable; }, [playable]);
  useEffect(() => { startOffsetsRef.current = startOffsets; }, [startOffsets]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { sceneIdxRef.current = sceneIdx; }, [sceneIdx]);

  const currentScene = playable[sceneIdx];
  const isImage = isImageScene(currentScene);
  const mediaUrl = isImage ? getImageUrl(currentScene) : currentScene?.clipUrl;

  const scheduleTimer = useCallback((cb: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      cb();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current.clear();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ── Helpers operating on refs only (no closures over slot state) ──
  const getVideoForSlot = (slot: AnySlot): HTMLVideoElement | null => {
    if (slot === 'A') return videoARef.current;
    if (slot === 'B') return videoBRef.current;
    return videoCRef.current;
  };

  const setSrcForSlot = useCallback((slot: AnySlot, src: string | undefined) => {
    const el = getVideoForSlot(slot);
    if (!el) return;
    if (slot === 'A') {
      if (slotASrcRef.current === src) return;
      slotASrcRef.current = src;
    } else if (slot === 'B') {
      if (slotBSrcRef.current === src) return;
      slotBSrcRef.current = src;
    } else {
      if (slotCSrcRef.current === src) return;
      slotCSrcRef.current = src;
    }
    if (src) {
      el.src = src;
      try { el.load(); } catch { /* noop */ }
    } else {
      try { el.removeAttribute('src'); el.load(); } catch { /* noop */ }
    }
  }, []);

  const setOpacityForSlot = useCallback((slot: Slot, opacity: number) => {
    if (slot === 'A') slotAOpacityRef.current = opacity;
    else slotBOpacityRef.current = opacity;
    const el = getVideoForSlot(slot);
    if (el) el.style.opacity = String(opacity);
    forceRender();
  }, []);

  const preloadSlot = useCallback((slot: AnySlot, idx: number) => {
    const list = playableRef.current;
    const target = list[idx];
    if (!target) {
      slotMapRef.current[slot] = -1;
      return;
    }
    if (isImageScene(target) || !target.clipUrl) {
      slotMapRef.current[slot] = -1;
      return;
    }
    if (slotMapRef.current[slot] === idx) return; // already preloaded
    const prevSrcRef =
      slot === 'A' ? slotASrcRef : slot === 'B' ? slotBSrcRef : slotCSrcRef;
    const srcUnchanged = prevSrcRef.current === target.clipUrl;
    setSrcForSlot(slot, target.clipUrl);
    slotMapRef.current[slot] = idx;
    const el = getVideoForSlot(slot);
    if (el) {
      const twoshotExternal = target.audioPlan?.twoshot?.useExternalAudio === true;
      const hasEmbeddedAudio = !twoshotExternal && (
        !!target.lipSyncAppliedAt ||
        (target.clipSource as string) === 'ai-heygen' ||
        target.clipSource === 'upload'
      );
      if (slot === 'C') {
        // Hidden prefetch slot: always muted, buffer only.
        el.muted = true;
      } else if (slot === activeSlotRef.current) {
        el.muted = twoshotExternal
          ? true
          : (hasEmbeddedAudio ? false : mutedRef.current);
      } else {
        el.muted = true;
      }
      // When the URL is unchanged but the slot was just remapped (e.g. after a
      // playable-list reset), the early-return inside setSrcForSlot skipped
      // `el.load()`. Force a reload so the decoder definitely has a visible
      // first frame — otherwise the slot can stay black after a re-init.
      if (srcUnchanged) {
        try { el.load(); } catch { /* noop */ }
      }
      try { el.currentTime = 0; } catch { /* noop */ }
    }
  }, [setSrcForSlot]);

  // ── Reset when scene set fundamentally changes ─────────────────
  // Use a stable signature (id + clipUrl per playable scene) instead of the
  // playable array reference. Otherwise every parent re-render that produces a
  // new array (but same content) triggers a destructive slot reset, which has
  // been observed to leave Slot A black for scene 1 after scene 2 is added.
  const playableSignature = useMemo(
    () => playable.map((s) => `${s.id}:${s.clipUrl ?? ''}`).join('|'),
    [playable],
  );
  useEffect(() => {
    clearAllTimers();
    transitioningRef.current = false;
    advancedRef.current = false;
    setSceneIdx(0);
    setGlobalTime(0);
    setPlaying(false);
    imageStartRef.current = null;
    activeSlotRef.current = 'A';
    slotMapRef.current = { A: -1, B: -1, C: -1 };
    // Forget which URLs the slots currently hold, so preloadSlot will always
    // re-arm them with a fresh `el.load()` even if the URL happens to match.
    slotASrcRef.current = undefined;
    slotBSrcRef.current = undefined;
    slotCSrcRef.current = undefined;

    if (playableRef.current.length > 0) {
      // The three <video> slots use `key={playableSignature}` so they
      // re-mount whenever the playable list changes. Refs may still be
      // pointing at the OLD detached element on the first synchronous
      // tick of this effect — wait one rAF so the freshly-mounted
      // <video> nodes are wired up before we set `src` on them.
      const armSlots = () => {
        if (
          !videoARef.current ||
          !videoBRef.current ||
          !videoCRef.current
        ) {
          // refs not yet attached → try again next frame.
          requestAnimationFrame(armSlots);
          return;
        }
        // Init: load scene 0 → A, scene 1 → B, scene 2 → hidden prefetch C.
        preloadSlot('A', 0);
        preloadSlot('B', 1);
        preloadSlot('C', 2);
        setOpacityForSlot('A', 1);
        setOpacityForSlot('B', 0);

        // First-Frame Paint Pulse on Slot A: a remounted <video> in
        // Chromium does not paint frame 0 until decode is unblocked by
        // `play()`. We trigger a silent play→pause cycle so the user
        // sees the scene's first frame immediately instead of black.
        const a = videoARef.current;
        if (a && !playingRef.current) {
          const wasMuted = a.muted;
          a.muted = true;
          const p = a.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try {
                a.pause();
                a.currentTime = 0;
                a.muted = wasMuted;
              } catch { /* noop */ }
            }).catch(() => {
              try { a.muted = wasMuted; } catch { /* noop */ }
            });
          }
        }
      };
      requestAnimationFrame(armSlots);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playableSignature]);


  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  // ── HTTP prewarm: range-fetch the first chunk of every clip URL so the
  // browser cache has the moov atom + first frames ready before each slot
  // calls `video.src = …`. Eliminates the 2–3s standby wait that otherwise
  // happens between scene 2 → 3 (and any later transition) when the standby
  // slot only starts loading its bytes after the previous scene already plays.
  useEffect(() => {
    if (playable.length === 0) return;
    const ctrl = new AbortController();
    const urls = playable
      .filter((s) => !isImageScene(s) && !!s.clipUrl)
      .map((s) => s.clipUrl as string);
    if (urls.length === 0) return;

    let active = 0;
    let cursor = 0;
    const pump = () => {
      while (active < PREWARM_CONCURRENCY && cursor < urls.length) {
        const url = urls[cursor++];
        active++;
        fetch(url, {
          method: 'GET',
          headers: { Range: `bytes=0-${PREWARM_BYTES - 1}` },
          cache: 'force-cache',
          signal: ctrl.signal,
        })
          .then((r) => r.arrayBuffer().catch(() => null))
          .catch(() => null)
          .finally(() => {
            active--;
            if (!ctrl.signal.aborted) pump();
          });
      }
    };
    pump();

    return () => { ctrl.abort(); };
  }, [playable]);


  // Helper: scene has embedded audio in the MP4 we should let the video play.
  // Two-shot scenes whose merged dialogue is on an external track must NOT
  // count as embedded — otherwise the lipsync video's last-speaker-only audio
  // plays in addition to the merged track on the timeline.
  const sceneHasEmbeddedAudio = (s: ComposerScene | undefined): boolean => {
    if (!s) return false;
    if (s.audioPlan?.twoshot?.useExternalAudio === true) return false;
    return (
      !!s.lipSyncAppliedAt ||
      (s.clipSource as string) === 'ai-heygen' ||
      s.clipSource === 'upload'
    );
  };

  /** True iff the scene's video MUST be muted regardless of the user's mute
   *  toggle — because its audio is mixed into an external linear track that
   *  the timeline plays separately. Currently only two-shot scenes flagged
   *  with audioPlan.twoshot.useExternalAudio. Without this guard, the
   *  embedded last-pass voice plays simultaneously with the merged track
   *  → echo + "both speakers at once" bug. */
  const sceneShouldForceMute = (s: ComposerScene | undefined): boolean =>
    !!s && s.audioPlan?.twoshot?.useExternalAudio === true;

  const resolveVideoMuted = (s: ComposerScene | undefined): boolean => {
    if (sceneShouldForceMute(s)) return true;
    if (sceneHasEmbeddedAudio(s)) return false;
    return mutedRef.current;
  };

  // ── Active video play/pause sync ───────────────────────────────
  useEffect(() => {
    if (isImage) {
      imageStartRef.current = playing ? performance.now() : null;
      return;
    }
    const v = getVideoForSlot(activeSlotRef.current);
    if (!v) return;
    if (playing) {
      const cur = playableRef.current[sceneIdxRef.current];
      v.muted = resolveVideoMuted(cur);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing, isImage, sceneIdx]);

  // Apply mute changes to the active slot (standby remains muted to avoid
  // double-audio during preload).
  useEffect(() => {
    const active = activeSlotRef.current;
    const va = getVideoForSlot(active);
    const vb = getVideoForSlot(active === 'A' ? 'B' : 'A');
    const cur = playableRef.current[sceneIdxRef.current];
    if (va && !isImage) {
      // For force-mute scenes, ignore the user's mute toggle — the external
      // merged track owns the dialogue. For everything else, honour `muted`.
      va.muted = sceneShouldForceMute(cur)
        ? true
        : (sceneHasEmbeddedAudio(cur) ? false : muted);
    }
    if (vb) vb.muted = true;
  }, [muted, isImage, sceneIdx]);

  // ── The core: stateless ref-based transition ──────────────────
  const performTransition = useCallback((toIdx: number) => {
    if (transitioningRef.current) return;
    const list = playableRef.current;
    if (toIdx >= list.length) {
      setPlaying(false);
      transitioningRef.current = false;
      return;
    }
    const nextScene = list[toIdx];
    if (!nextScene) return;

    const currentIdx = sceneIdxRef.current;
    const fromScene = list[currentIdx];
    const fromIsImage = isImageScene(fromScene);
    const toIsImage = isImageScene(nextScene);

    transitioningRef.current = true;
    advancedRef.current = false;

    // Image-involved transitions: no slot crossfade — instant switch.
    if (fromIsImage || toIsImage) {
      setSceneIdx(toIdx);
      setGlobalTime(startOffsetsRef.current[toIdx] || 0);
      if (!toIsImage && nextScene.clipUrl) {
        // Land the new video in slot A.
        activeSlotRef.current = 'A';
        preloadSlot('A', toIdx);
        setOpacityForSlot('A', 1);
        setOpacityForSlot('B', 0);
        scheduleTimer(() => {
          const v = videoARef.current;
          if (v) {
            try { v.currentTime = 0; } catch { /* noop */ }
            v.muted = resolveVideoMuted(nextScene);
            if (playingRef.current) v.play().catch(() => {});
          }
        }, 30);
        // Preload the next-next into B and the one after into prefetch C.
        preloadSlot('B', toIdx + 1);
        preloadSlot('C', toIdx + 2);
      }
      transitioningRef.current = false;
      return;
    }

    // Video → Video crossfade via ref-based slot mapping.
    const fromSlot = activeSlotRef.current;
    const toSlot: Slot = fromSlot === 'A' ? 'B' : 'A';
    const standby = getVideoForSlot(toSlot);

    if (!standby || !nextScene.clipUrl) {
      // Defensive: just hard-cut sceneIdx so we don't stall.
      setSceneIdx(toIdx);
      setGlobalTime(startOffsetsRef.current[toIdx] || 0);
      transitioningRef.current = false;
      return;
    }

    // Make sure the standby actually holds the toIdx clip.
    if (slotMapRef.current[toSlot] !== toIdx) {
      preloadSlot(toSlot, toIdx);
    }

    const startCrossfade = () => {
      const standbyEl = getVideoForSlot(toSlot);
      if (standbyEl) {
        try { standbyEl.currentTime = 0; } catch { /* noop */ }
        standbyEl.muted = resolveVideoMuted(nextScene);
        if (playingRef.current) standbyEl.play().catch(() => {});
      }
      // Crossfade
      setOpacityForSlot(toSlot, 1);
      setOpacityForSlot(fromSlot, 0);

      scheduleTimer(() => {
        // Pause the now-hidden slot and finalize state.
        const oldEl = getVideoForSlot(fromSlot);
        try { oldEl?.pause(); } catch { /* noop */ }
        // Mute the now-hidden slot, unmute the active one.
        if (oldEl) oldEl.muted = true;

        activeSlotRef.current = toSlot;
        setSceneIdx(toIdx);
        setGlobalTime(startOffsetsRef.current[toIdx] || 0);
        lastTimeUpdateRef.current = performance.now();

        // Preload toIdx + 1 into the now-free slot and toIdx + 2 into prefetch C.
        preloadSlot(fromSlot, toIdx + 1);
        preloadSlot('C', toIdx + 2);

        transitioningRef.current = false;
      }, CROSSFADE_MS);
    };

    // Fast path: standby already has enough buffered to play through.
    if (standby.readyState >= 3) {
      startCrossfade();
    } else if (standby.readyState >= 2) {
      // HAVE_CURRENT_DATA — at least the first frame is ready. Start the
      // crossfade immediately but give the browser a short head-start so
      // playback doesn't stutter right at the cut.
      scheduleTimer(startCrossfade, STANDBY_SOFT_WAIT_MS);
    } else {
      let fired = false;
      const onReady = () => {
        if (fired) return;
        fired = true;
        startCrossfade();
      };
      standby.addEventListener('canplay', onReady, { once: true });
      standby.addEventListener('loadeddata', onReady, { once: true });
      // Hard fallback — always advance, even if buffering.
      scheduleTimer(() => {
        try {
          standby.removeEventListener('canplay', onReady);
          standby.removeEventListener('loadeddata', onReady);
        } catch { /* noop */ }
        if (!fired) {
          console.warn('[Preview] standby budget exceeded — hard advancing');
        }
        onReady();
      }, STANDBY_BUDGET_MS);
    }
  }, [preloadSlot, setOpacityForSlot, scheduleTimer]);

  const advanceScene = useCallback(() => {
    const currentIdx = sceneIdxRef.current;
    const list = playableRef.current;
    if (currentIdx + 1 >= list.length) {
      // End of sequence — stop and reset to start.
      setPlaying(false);
      transitioningRef.current = false;
      setSceneIdx(0);
      setGlobalTime(0);
      activeSlotRef.current = 'A';
      preloadSlot('A', 0);
      preloadSlot('B', 1);
      preloadSlot('C', 2);
      setOpacityForSlot('A', 1);
      setOpacityForSlot('B', 0);
      return;
    }
    performTransition(currentIdx + 1);
  }, [performTransition, preloadSlot, setOpacityForSlot]);

  // ── Image-clip ticker ──────────────────────────────────────────
  useEffect(() => {
    if (!isImage || !playing || !currentScene) return;
    const dur = currentScene.durationSeconds || 3;
    const tick = () => {
      const start = imageStartRef.current ?? performance.now();
      const elapsed = (performance.now() - start) / 1000;
      const local = Math.min(elapsed, dur);
      setGlobalTime((startOffsetsRef.current[sceneIdxRef.current] || 0) + local);
      if (elapsed >= dur) {
        advanceScene();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isImage, playing, currentScene, advanceScene]);

  // ── Watchdog: if no timeupdate for >5s while playing, force advance ──
  useEffect(() => {
    if (!playing || isImage) return;
    lastTimeUpdateRef.current = performance.now();
    const id = window.setInterval(() => {
      if (transitioningRef.current) {
        lastTimeUpdateRef.current = performance.now();
        return;
      }
      const since = performance.now() - lastTimeUpdateRef.current;
      if (since > WATCHDOG_MS) {
        lastTimeUpdateRef.current = performance.now();
        advanceScene();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing, isImage, advanceScene]);

  const onVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (isImage) return;
    if (transitioningRef.current) return;
    // Only honour timeupdates from the active slot.
    const isASource = e.currentTarget === videoARef.current;
    const fromActive =
      (isASource && activeSlotRef.current === 'A') ||
      (!isASource && activeSlotRef.current === 'B');
    if (!fromActive) return;

    lastTimeUpdateRef.current = performance.now();
    const v = e.currentTarget;
    const sceneDur = currentScene?.durationSeconds || 0;
    const local = v.currentTime;

    if (sceneDur > 0 && local >= sceneDur && !advancedRef.current) {
      advancedRef.current = true;
      setGlobalTime((startOffsetsRef.current[sceneIdxRef.current] || 0) + sceneDur);
      advanceScene();
      return;
    }
    setGlobalTime((startOffsetsRef.current[sceneIdxRef.current] || 0) + local);
  };

  const onVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (transitioningRef.current) return;
    const isASource = e.currentTarget === videoARef.current;
    const fromActive =
      (isASource && activeSlotRef.current === 'A') ||
      (!isASource && activeSlotRef.current === 'B');
    if (!fromActive) return;
    if (advancedRef.current) return;
    // Hold-last-frame: if the rendered MP4 is shorter than the planned scene
    // duration (common for lip-synced two-shot clips where the video equals
    // VO length), don't advance immediately. Pause the element on its last
    // frame and let the watchdog/scrub naturally tick globalTime forward.
    const cur = playableRef.current[sceneIdxRef.current];
    const sceneDur = cur?.durationSeconds || 0;
    const v = e.currentTarget;
    if (sceneDur > 0 && v.currentTime + 0.15 < sceneDur) {
      try { v.pause(); v.currentTime = Math.max(0, (v.duration || sceneDur) - 0.05); } catch { /* noop */ }
      // Drive globalTime forward via RAF until we reach scene length, then advance.
      const startWall = performance.now();
      const startGlobal = (startOffsetsRef.current[sceneIdxRef.current] || 0) + v.currentTime;
      const tick = () => {
        if (transitioningRef.current || advancedRef.current) return;
        const elapsed = (performance.now() - startWall) / 1000;
        const g = startGlobal + elapsed;
        const sceneEnd = (startOffsetsRef.current[sceneIdxRef.current] || 0) + sceneDur;
        if (g >= sceneEnd) {
          advancedRef.current = true;
          advanceScene();
          return;
        }
        setGlobalTime(g);
        if (playingRef.current) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    advancedRef.current = true;
    advanceScene();
  };

  const primeSfxAudios = useCallback(() => {
    if (sfxPrimedRef.current) return;
    sfxPrimedRef.current = true;
    sfxAudiosRef.current.forEach((a, id) => {
      try {
        const wasMuted = a.muted;
        a.muted = true;
        const p = a.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            try { a.pause(); a.currentTime = 0; a.muted = wasMuted; } catch { /* noop */ }
          }).catch((err) => {
            console.warn(`[Preview] SFX prime failed clip=${id}`, err?.name || err);
            try { a.muted = wasMuted; } catch { /* noop */ }
          });
        } else {
          try { a.pause(); a.currentTime = 0; a.muted = wasMuted; } catch { /* noop */ }
        }
      } catch (err) {
        console.warn(`[Preview] SFX prime threw clip=${id}`, err);
      }
    });
  }, []);

  const togglePlay = () => {
    primeSfxAudios();
    setPlaying(p => !p);
  };

  const handleScrub = (val: number) => {
    if (totalDuration <= 0) return;
    let idx = 0;
    for (let i = 0; i < playable.length; i++) {
      if (val >= startOffsets[i] && val < startOffsets[i] + (playable[i].durationSeconds || 0)) {
        idx = i;
        break;
      }
      if (i === playable.length - 1) idx = i;
    }
    const localTime = val - startOffsets[idx];
    const target = playable[idx];

    // Cancel any pending transitions/timers — scrub takes priority.
    clearAllTimers();
    transitioningRef.current = false;
    advancedRef.current = false;

    setSceneIdx(idx);
    setGlobalTime(val);

    if (isImageScene(target)) {
      imageStartRef.current = playing ? performance.now() - localTime * 1000 : null;
      // Hide both video slots.
      setOpacityForSlot('A', 0);
      setOpacityForSlot('B', 0);
      return;
    }

    // Hard-cut on scrub: load into slot A, keep B as next-preload.
    activeSlotRef.current = 'A';
    setOpacityForSlot('A', 1);
    setOpacityForSlot('B', 0);
    if (target.clipUrl) {
      const needsLoad = slotMapRef.current.A !== idx;
      if (needsLoad) {
        setSrcForSlot('A', target.clipUrl);
        slotMapRef.current.A = idx;
      }
      // Preload next into B.
      preloadSlot('B', idx + 1);
      preloadSlot('C', idx + 2);

      const apply = () => {
        const v = videoARef.current;
        if (!v) return;
        try { v.currentTime = localTime; } catch { /* noop */ }
        v.muted = mutedRef.current;
        if (playing) v.play().catch(() => {});
      };
      if (needsLoad) {
        const v = videoARef.current;
        if (v) {
          let fired = false;
          const onReady = () => {
            if (fired) return;
            fired = true;
            apply();
          };
          v.addEventListener('loadeddata', onReady, { once: true });
          scheduleTimer(onReady, STANDBY_BUDGET_MS);
        }
      } else {
        apply();
      }
    }
    lastTimeUpdateRef.current = performance.now();
  };

  // Notify parent of playhead changes
  useEffect(() => {
    onTimeUpdate?.(globalTime, totalDuration);
  }, [globalTime, totalDuration, onTimeUpdate]);

  // ── Voiceover audio sync ──────────────────────────────────────
  // VO_LEAD_IN (2026-04-22): mirror the 0.4s breath added by the Remotion
  // template so the editor preview is WYSIWYG with the final render.
  const VO_LEAD_IN_SECONDS = 0.4;

  // SINGLE-SOURCE-OF-TRUTH RULE:
  // If a scene has its own per-scene voiceover clip (kind='voiceover' in
  // scene_audio_clips, generated via SceneDialogStudio), the *global* VO
  // (assemblyConfig.voiceover.audioUrl) MUST be muted during that scene's
  // window — otherwise both tracks play simultaneously and the user hears
  // two voices at once ("Welcome to droneOcular" bug).
  // This also handles scenes with embedded HeyGen / lip-synced audio.
  const perSceneVoSceneIds = useMemo(() => {
    const ids = new Set<string>();
    (sceneAudioClips ?? []).forEach((c) => {
      if (c.kind === 'voiceover' && c.scene_id && c.url) ids.add(c.scene_id);
    });
    playable.forEach((s) => {
      // Two-shot scenes with external merged audio do NOT own their voice
      // via the embedded video — the merged track must play on top.
      if (s.audioPlan?.twoshot?.useExternalAudio === true) return;
      if (
        s.lipSyncAppliedAt ||
        (s.clipSource as string) === 'ai-heygen' ||
        (s.audioPlan?.speakers?.some((sp) => !!sp.audioUrl))
      ) {
        ids.add(s.id);
      }
    });
    return ids;
  }, [sceneAudioClips, playable]);

  /** Two-Shot-Szenen, deren Lip-Sync-Pipeline noch nicht durchgelaufen ist.
   *  Hier MUSS das globale Voiceover gemutet werden — sonst legt sich der
   *  Projekt-VO als „Phantom-Stimme" über stille Charaktere und der User
   *  glaubt, der Lip-Sync funktioniere. */
  const pendingTwoShotSceneIds = useMemo(() => {
    const ids = new Set<string>();
    playable.forEach((s) => {
      const shots = (s as any).characterShots;
      const hasTwoShotConfig =
        Array.isArray(shots) &&
        shots.length >= 2 &&
        s.lipSyncWithVoiceover === true &&
        typeof (s as any).dialogScript === 'string' &&
        (s as any).dialogScript.length > 0;
      if (hasTwoShotConfig && !s.lipSyncAppliedAt) {
        ids.add(s.id);
      }
    });
    return ids;
  }, [playable]);

  /** True when the currently-active scene already has its own spoken audio
   *  (per-scene VO clip OR embedded lip-sync) — OR when it's a Two-Shot
   *  scene whose lip-sync hasn't been applied yet (in which case we mute
   *  the global VO so the user doesn't hear a phantom voiceover). */
  const currentSceneHasOwnVoice =
    !!currentScene &&
    (perSceneVoSceneIds.has(currentScene.id) ||
      pendingTwoShotSceneIds.has(currentScene.id));

  // Auto-unmute when an audible track becomes available — VO, BGM, SFX, OR
  // a lip-sync / HeyGen scene whose audio is embedded directly in the video.
  useEffect(() => {
    const hasEmbeddedAudio = playable.some(
      (s) =>
        s.lipSyncWithVoiceover === true ||
        !!s.lipSyncAppliedAt ||
        (s.clipSource as string) === 'ai-heygen' ||
        s.clipSource === 'upload',
    );
    if (
      voiceoverUrl ||
      backgroundMusicUrl ||
      (sceneAudioClips && sceneAudioClips.length > 0) ||
      hasEmbeddedAudio
    ) {
      setMuted(false);
    }
  }, [voiceoverUrl, backgroundMusicUrl, sceneAudioClips, playable]);

  // Unified audio sync — re-evaluates on globalTime so audio.play() fires
  // automatically once the lead-in threshold is crossed (no scrub needed).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceoverUrl) return;
    audio.muted = muted;

    const targetAudioTime = Math.max(0, globalTime - VO_LEAD_IN_SECONDS);
    if (Math.abs(audio.currentTime - targetAudioTime) > 0.25) {
      try {
        audio.currentTime = Math.min(targetAudioTime, audio.duration || targetAudioTime);
      } catch {}
    }

    // Suppress the global VO during scenes that own their voice (per-scene
    // dialog clip or embedded HeyGen/lip-sync). Prevents the double-voice bug.
    if (currentSceneHasOwnVoice) {
      try { audio.pause(); } catch {}
      return;
    }

    if (playing) {
      if (globalTime < VO_LEAD_IN_SECONDS) {
        // Hold audio at 0 during the 0.4s breath; browser pre-decodes.
        try { audio.currentTime = 0; } catch {}
        audio.pause();
      } else {
        audio.play().catch(() => {});
      }
    } else {
      audio.pause();
    }
  }, [playing, voiceoverUrl, muted, globalTime, currentSceneHasOwnVoice]);

  // ── Background music sync ─────────────────────────────────────
  // BGM is a linear track that loops underneath the video. It mirrors
  // the play/pause state and is mute-controlled via the same toggle.
  useEffect(() => {
    const m = musicRef.current;
    if (!m || !backgroundMusicUrl) return;
    const safeVol = Math.max(0, Math.min(1, backgroundMusicVolume));
    try { m.volume = safeVol; } catch {}
    m.muted = muted;
    m.loop = true;

    const trackDur = m.duration || Math.max(1, totalDuration);
    const targetTime = globalTime % trackDur;
    if (Number.isFinite(targetTime) && Math.abs(m.currentTime - targetTime) > 0.5) {
      try { m.currentTime = targetTime; } catch {}
    }

    if (playing) {
      m.play().catch(() => {});
    } else {
      m.pause();
    }
  }, [playing, backgroundMusicUrl, backgroundMusicVolume, muted, globalTime, totalDuration]);

  // ── AI SFX / Ambient / Foley sync ────────────────────────────
  // Maps each clip to a global timeline offset based on its scene's position
  // in the playable sequence (mirrors what compose-video-assemble does for
  // the final mux). Clips without a matching scene play at start_offset from 0.
  const SFX_FADE_SEC = 0.4;
  const sfxClipsTimeline = useMemo(() => {
    const sceneStart = new Map<string, number>();
    // Scenes that already have a Sync.so lip-synced clip embed the VO inside
    // the video — playing the separate VO track too would double the audio.
    const lipSyncedSceneIds = new Set(
      playable
        .filter(s => !!s.lipSyncAppliedAt && s.audioPlan?.twoshot?.useExternalAudio !== true)
        .map(s => s.id),
    );
    playable.forEach((s, i) => sceneStart.set(s.id, startOffsets[i] || 0));

    const result: Array<{ clip: SceneAudioClip; start: number; end: number }> = [];
    const seenSceneVoiceovers = new Set<string>();

    (sceneAudioClips ?? [])
      .filter(c => !!c.url)
      .filter(c => !(c.kind === 'voiceover' && c.scene_id && lipSyncedSceneIds.has(c.scene_id)))
      .forEach(c => {
        const base = c.scene_id && sceneStart.has(c.scene_id) ? sceneStart.get(c.scene_id)! : 0;
        const start = base + (Number(c.start_offset) || 0);
        const dur = Math.max(0.1, Number(c.duration) || 0);
        result.push({ clip: c, start, end: start + dur });
        if (c.kind === 'voiceover' && c.scene_id) seenSceneVoiceovers.add(c.scene_id);
      });

    // ── Director Console fallback ─────────────────────────────────────────
    // If a scene has a locked AudioPlan (Director Console / SceneDialogStudio
    // TTS) but no matching `scene_audio_clips` rows are loaded yet, synthesize
    // virtual voiceover clips from the plan so playback never goes silent.
    // This guarantees "Sound is back" even when the DB row is delayed,
    // missing, or got wiped by the idempotency cleanup.
    playable.forEach(s => {
      const plan = s.audioPlan;
      if (!plan?.speakers?.length) return;
      if (lipSyncedSceneIds.has(s.id)) return; // HeyGen already embeds audio
      if (seenSceneVoiceovers.has(s.id)) return; // real DB rows take precedence
      const base = sceneStart.get(s.id) ?? 0;
      plan.speakers.forEach((sp, idx) => {
        if (!sp.audioUrl) return;
        const start = base + (sp.startSec || 0);
        const end = base + (sp.endSec || sp.startSec + 1);
        result.push({
          // Cast to SceneAudioClip — UI only reads these fields.
          clip: {
            id: `audioplan:${s.id}:${idx}`,
            scene_id: s.id,
            kind: 'voiceover',
            url: sp.audioUrl,
            start_offset: sp.startSec,
            duration: Math.max(0.1, end - start),
            volume: 1,
            ducking_enabled: true,
          } as unknown as SceneAudioClip,
          start,
          end,
        });
      });
    });

    return result;
  }, [sceneAudioClips, playable, startOffsets]);

  // Log clip list changes (audio elements themselves are created via JSX refs
  // below — that ensures the browser counts them as part of the same user
  // gesture chain as the play button, sidestepping per-element autoplay locks).
  useEffect(() => {
    if (sfxClipsTimeline.length > 0) {
      console.info(
        `[Preview] sceneAudioClips loaded: ${sfxClipsTimeline.length}`,
        sfxClipsTimeline.map(x => ({ id: x.clip.id, kind: x.clip.kind, start: x.start, end: x.end, url: x.clip.url })),
      );
    }
  }, [sfxClipsTimeline]);

  // Cleanup on unmount
  useEffect(() => () => {
    sfxAudiosRef.current.forEach(a => { try { a.pause(); a.src = ''; } catch { /* noop */ } });
    sfxAudiosRef.current.clear();
  }, []);

  // Sync SFX / Voiceover clips against the global playhead.
  // Voiceover clips (kind === 'voiceover') are treated as spoken tracks:
  // no fade window, full volume, hard play/pause at scene boundaries —
  // anything else clips the speech and feels like the VO "isn't playing".
  useEffect(() => {
    const map = sfxAudiosRef.current;
    sfxClipsTimeline.forEach(({ clip, start, end }) => {
      const a = map.get(clip.id);
      if (!a) return;
      const isVoice = clip.kind === 'voiceover';
      const baseVol = Math.max(0, Math.min(1, (clip.volume ?? (isVoice ? 1.0 : 0.5))));

      let inWindow: boolean;
      let gain = baseVol;
      if (isVoice) {
        inWindow = globalTime >= start && globalTime < end + 0.15;
      } else {
        const fade = Math.min(SFX_FADE_SEC, Math.max(0.05, (end - start) / 2));
        const windowStart = Math.max(0, start - fade);
        const windowEnd = end + fade;
        inWindow = globalTime >= windowStart && globalTime < windowEnd;
        if (globalTime < start) {
          gain = baseVol * Math.max(0, (globalTime - windowStart) / fade);
        } else if (globalTime > end - fade && globalTime < end) {
          gain = baseVol * Math.max(0, (end - globalTime) / fade);
        } else if (globalTime >= end) {
          gain = baseVol * Math.max(0, (windowEnd - globalTime) / fade);
        }
      }
      a.volume = Math.max(0, Math.min(1, gain));
      a.muted = muted;

      if (inWindow && playing) {
        const target = Math.max(0, globalTime - start);
        if (Math.abs(a.currentTime - target) > 0.35) {
          try { a.currentTime = target; } catch { /* noop */ }
        }
        if (a.paused) {
          a.play().catch((err) => {
            console.warn(`[Preview] ${isVoice ? 'VO' : 'SFX'} play() rejected clip=${clip.id}`, err?.name || err);
          });
        }
      } else if (isVoice) {
        if (!a.paused) {
          try { a.pause(); } catch { /* noop */ }
        }
      } else {
        // SFX: only pause once fully faded out — avoids click artifacts.
        if (!a.paused && a.volume <= 0.001) a.pause();
      }
    });
  }, [playing, muted, globalTime, sfxClipsTimeline]);

  const activeSubtitle = useMemo(() => {
    if (!subtitles?.enabled || !subtitles.segments?.length) return null;
    return (
      subtitles.segments.find(
        (seg) => globalTime >= seg.startTime && globalTime <= seg.endTime,
      ) || null
    );
  }, [subtitles, globalTime]);

  if (playable.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
        <Film className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('videoComposer.clipsMissingForPreview')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Player */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-lg border border-border/40">
        {isImage && (
          <img
            src={mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain z-10"
          />
        )}

        {/* Slot A */}
        <video
          key={`A:${playableSignature}`}
          ref={videoARef}
          playsInline
          preload="auto"
          onTimeUpdate={onVideoTimeUpdate}
          onEnded={onVideoEnded}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: isImage ? 0 : slotAOpacityRef.current,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />

        {/* Slot B */}
        <video
          key={`B:${playableSignature}`}
          ref={videoBRef}
          playsInline
          preload="auto"
          onTimeUpdate={onVideoTimeUpdate}
          onEnded={onVideoEnded}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: isImage ? 0 : slotBOpacityRef.current,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />

        {/* Slot C — hidden prefetch holder (always sceneIdx + 2). Decodes the
            moov atom + first frame so the next-next transition is instant. */}
        <video
          key={`C:${playableSignature}`}
          ref={videoCRef}
          playsInline
          preload="auto"
          muted
          aria-hidden
          tabIndex={-1}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
            left: -9999,
            top: -9999,
          }}
        />


        {/* Global timeline-based text overlays (independent of scene boundaries) */}
        {globalTextOverlays && globalTextOverlays.length > 0 && (
          <PreviewTextOverlayLayer
            overlays={globalTextOverlays}
            currentTime={globalTime}
            totalDuration={totalDuration}
          />
        )}

        {/* Time-synced subtitle line — only shows the segment matching the playhead */}
        {subtitles?.enabled && activeSubtitle && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm pointer-events-none max-w-[90%] text-center z-20"
            style={{
              top: subtitles.style.position === 'top' ? '6%' : undefined,
              bottom: subtitles.style.position === 'bottom' ? '6%' : undefined,
              color: subtitles.style.color,
              background: subtitles.style.background || 'transparent',
              fontFamily: subtitles.style.font,
              fontSize: Math.max(12, subtitles.style.size / 2.4),
              fontWeight: 600,
              textShadow: subtitles.style.background ? 'none' : '0 2px 6px rgba(0,0,0,0.65)',
              lineHeight: 1.2,
            }}
          >
            {activeSubtitle.text}
          </div>
        )}

        {/* Empty-state hint when subtitles enabled but no segments generated yet */}
        {subtitles?.enabled && !subtitles.segments?.length && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/60 backdrop-blur text-[10px] text-white/70 pointer-events-none z-20">
            {t('videoComposer.subtitlesEmptyHint')}
          </div>
        )}

        {/* Status chip — voiceover + subtitles indicator */}
        {(voiceoverUrl || (subtitles?.enabled && subtitles.segments?.length)) && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white/90 font-medium flex items-center gap-1.5 z-20">
            {voiceoverUrl && <span>🎙️</span>}
            {subtitles?.enabled && subtitles.segments?.length ? (
              <span>{subtitles.segments.length} {t('videoComposer.subtitlesShortLabel')}</span>
            ) : null}
          </div>
        )}

        {/* Scene chip */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white/90 font-medium z-20">
          {t('videoComposer.sceneOf', { current: sceneIdx + 1, total: playable.length })}
        </div>

        {/* Two-Shot Lip-Sync Pending / Failed Badge */}
        {currentScene && pendingTwoShotSceneIds.has(currentScene.id) && (
          (currentScene as any).lipSyncStatus === 'failed' ? (
            (() => {
              const err = String((currentScene as any).clipError ?? '');
              // sync-so-webhook now prefixes the reason with [error_code]
              // (e.g. "syncso_segments_FAILED: [generation_pipeline_failed] …")
              // so we can extract the official Sync.so code and show a
              // concrete diagnostic instead of "unknown error".
              const codeMatch = err.match(/\[([a-z][a-z0-9_]+)\]/i);
              const syncCode = codeMatch ? codeMatch[1] : null;
              const SYNC_CODE_LABELS: Record<string, string> = {
                generation_timeout: 'Sync.so Timeout — bitte „Lip-Sync neu rendern"',
                generation_pipeline_failed: 'Sync.so Pipeline-Fehler — bitte „Lip-Sync neu rendern"',
                generation_unhandled_error: 'Sync.so unerwarteter Fehler — bitte „Lip-Sync neu rendern"',
                generation_database_error: 'Sync.so DB-Fehler — bitte „Lip-Sync neu rendern"',
                generation_infra_storage_error: 'Sync.so Storage-Fehler — bitte „Lip-Sync neu rendern"',
                generation_infra_resource_exhausted: 'Sync.so überlastet — bitte „Lip-Sync neu rendern"',
                generation_infra_service_unavailable: 'Sync.so nicht erreichbar — bitte „Lip-Sync neu rendern"',
                generation_input_audio_invalid: 'Audio-Metadaten ungültig — Voiceover neu generieren',
                generation_media_metadata_missing: 'Audio-/Video-Metadaten fehlen — Voiceover neu generieren',
                generation_audio_length_exceeded: 'Audio länger als 300s — Dialog kürzen',
                generation_text_length_exceeded: 'Script zu lang (>5000 Zeichen) — kürzen',
                generation_unsupported_model: 'Sync.so Modell nicht verfügbar',
                generation_audio_missing: 'Voiceover fehlt — Dialog neu generieren',
                generation_video_missing: 'Quell-Video fehlt — Szene neu rendern',
                generation_input_validation_failed: 'Sync.so hat Input abgelehnt — Format prüfen',
                generation_internal_auth: 'Sync.so Auth-Fehler — Support kontaktieren',
              };
              const willAutoRetry =
                err === 'multi_speaker_scene_routed_to_single_lipsync' ||
                err === 'watchdog_stuck_lipsync_refunded' ||
                /^lipsync_pass_\d+_failed/.test(err) ||
                err.startsWith('auto-retry:');
              const friendly =
                syncCode && SYNC_CODE_LABELS[syncCode] ? SYNC_CODE_LABELS[syncCode]
                : err.startsWith('anchor_identity_clone_detected') || err.startsWith('anchor_identity_duplicate_detected') ? 'Charakter wurde doppelt erkannt — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.startsWith('anchor_extra_person_detected') ? 'Anchor enthält eine zusätzliche Person — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.startsWith('anchor_identity_missing_detected') ? 'Ein Charakter fehlt im Anchor — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.startsWith('anchor_identity_ambiguous') ? 'Anchor-Identitäten unklar — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.startsWith('anchor_missing_speakers') ? 'Anchor zeigt nicht alle Sprecher — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.startsWith('source_clip_missing_speakers') ? 'Video zeigt nicht alle Sprecher — bitte „Clip + Lip-Sync neu rendern" klicken'
                : err.includes('Sync.so lieferte keinen error_code')
                  ? '3-Sprecher-Szene: Sync.so meldete einen generischen Fehler — Audio-Trim wurde versucht. Bitte „Lip-Sync neu rendern" klicken'
                  : err.startsWith('syncso_') ? `Sync.so Providerfehler — bitte „Lip-Sync neu rendern" klicken`
                : willAutoRetry
                  ? 'Lip-Sync fehlgeschlagen — wird neu angestoßen'
                  : 'Lip-Sync fehlgeschlagen — bitte „Lip-Sync neu rendern" klicken';

              return (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-red-500/90 backdrop-blur text-[11px] text-white font-semibold flex items-center gap-1.5 z-20" title={syncCode ? `Sync.so error_code: ${syncCode}` : err.slice(0, 200)}>
                  <span>⚠️</span>
                  <span>{friendly}</span>
                  {syncCode && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-black/30 text-[9px] font-mono uppercase tracking-wide">
                      {syncCode.replace(/^generation_/, '')}
                    </span>
                  )}
                </div>
              );
            })()

          ) : (
            (() => {
              const stage = String((currentScene as any).twoshotStage ?? '');
              const label =
                stage === 'audio' ? 'Voiceover wird gebaut…'
                : stage === 'anchor' ? 'Anchor wird komponiert…'
                : stage === 'master_clip' ? 'Hailuo rendert die Szene…'
                : stage === 'lipsync_1' ? 'Sync.so Pass 1 läuft…'
                : stage === 'lipsync_2' ? 'Sync.so Pass 2 läuft…'
                : stage === 'continuity' ? 'Continuity-Check…'
                : 'Lip-Sync wird vorbereitet…';
              return (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-amber-500/90 backdrop-blur text-[11px] text-black font-semibold flex items-center gap-1.5 z-20 animate-pulse">
                  <span>🎬</span>
                  <span>{label}</span>
                </div>
              );
            })()
          )

        )}

        {/* Hidden voiceover audio — synced with the video timeline */}
        {voiceoverUrl && (
          <audio
            ref={audioRef}
            src={voiceoverUrl}
            preload="auto"
            className="hidden"
          />
        )}

        {/* Hidden background music audio — looped under the timeline */}
        {backgroundMusicUrl && (
          <audio
            ref={musicRef}
            src={backgroundMusicUrl}
            preload="auto"
            className="hidden"
          />
        )}

        {/* Hidden AI SFX/Ambient/Foley audio elements — registered via JSX
            refs so the browser counts them as part of the same gesture chain
            as the play button (avoids per-element autoplay lockouts). */}
        {sfxClipsTimeline.map(({ clip }) => (
          <audio
            key={clip.id}
            ref={(el) => {
              if (el) sfxAudiosRef.current.set(clip.id, el);
              else sfxAudiosRef.current.delete(clip.id);
            }}
            src={clip.url}
            preload="auto"
            crossOrigin="anonymous"
            className="hidden"
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="default"
          onClick={togglePlay}
          className="h-9 w-9 shrink-0"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
          {formatTime(globalTime)} / {formatTime(totalDuration)}
        </div>

        <div className="flex-1">
          <Slider
            value={[Math.min(globalTime, totalDuration)]}
            min={0}
            max={Math.max(totalDuration, 0.1)}
            step={0.05}
            onValueChange={([v]) => handleScrub(v)}
          />
        </div>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => { primeSfxAudios(); setMuted(m => !m); }}
          className="h-9 w-9 shrink-0"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Scene dots */}
      <div className="flex items-center justify-center gap-1.5">
        {playable.map((s, i) => (
          <button
            key={s.id}
            onClick={() => handleScrub(startOffsets[i])}
            className={`h-1.5 rounded-full transition-all ${
              i === sceneIdx ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
            }`}
            aria-label={`Scene ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
