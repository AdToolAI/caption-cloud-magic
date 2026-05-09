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
const STANDBY_BUDGET_MS = 1200;
const WATCHDOG_MS = 5000;

type Slot = 'A' | 'B';

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

  const playable = useMemo(
    () =>
      scenes.filter(
        s => s.clipUrl || (isImageScene(s) && (s.clipUrl || s.uploadUrl)),
      ),
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

  /** Which slot DOM element is currently the visible/active player. */
  const activeSlotRef = useRef<Slot>('A');
  /** Maps each slot to the sceneIdx whose src is currently loaded into it. -1 = empty. */
  const slotMapRef = useRef<{ A: number; B: number }>({ A: -1, B: -1 });
  /** Imperative src holders so React doesn't trigger unwanted reloads. */
  const slotASrcRef = useRef<string | undefined>(undefined);
  const slotBSrcRef = useRef<string | undefined>(undefined);
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
  const getVideoForSlot = (slot: Slot): HTMLVideoElement | null =>
    slot === 'A' ? videoARef.current : videoBRef.current;

  const setSrcForSlot = useCallback((slot: Slot, src: string | undefined) => {
    const el = getVideoForSlot(slot);
    if (!el) return;
    if (slot === 'A') {
      if (slotASrcRef.current === src) return;
      slotASrcRef.current = src;
    } else {
      if (slotBSrcRef.current === src) return;
      slotBSrcRef.current = src;
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

  const preloadSlot = useCallback((slot: Slot, idx: number) => {
    const list = playableRef.current;
    const target = list[idx];
    if (!target) {
      // No more scenes — leave slot as is (but mark empty).
      slotMapRef.current[slot] = -1;
      return;
    }
    if (isImageScene(target) || !target.clipUrl) {
      slotMapRef.current[slot] = -1;
      return;
    }
    if (slotMapRef.current[slot] === idx) return; // already preloaded
    setSrcForSlot(slot, target.clipUrl);
    slotMapRef.current[slot] = idx;
    const el = getVideoForSlot(slot);
    if (el) {
      // Active slot honours the user's mute toggle; standby is always muted
      // until it becomes active to avoid double-audio during preload.
      el.muted = slot === activeSlotRef.current ? mutedRef.current : true;
      try { el.currentTime = 0; } catch { /* noop */ }
    }
  }, [setSrcForSlot]);

  // ── Reset when scene set fundamentally changes ─────────────────
  useEffect(() => {
    clearAllTimers();
    transitioningRef.current = false;
    advancedRef.current = false;
    setSceneIdx(0);
    setGlobalTime(0);
    setPlaying(false);
    imageStartRef.current = null;
    activeSlotRef.current = 'A';
    slotMapRef.current = { A: -1, B: -1 };

    if (playable.length > 0) {
      // Init: load scene 0 → A, scene 1 → B.
      preloadSlot('A', 0);
      preloadSlot('B', 1);
      setOpacityForSlot('A', 1);
      setOpacityForSlot('B', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable]);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  // ── Active video play/pause sync ───────────────────────────────
  useEffect(() => {
    if (isImage) {
      imageStartRef.current = playing ? performance.now() : null;
      return;
    }
    const v = getVideoForSlot(activeSlotRef.current);
    if (!v) return;
    if (playing) {
      v.muted = mutedRef.current;
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
    if (va && !isImage) va.muted = muted;
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
            v.muted = mutedRef.current;
            if (playingRef.current) v.play().catch(() => {});
          }
        }, 30);
        // Preload the next-next into B
        preloadSlot('B', toIdx + 1);
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
        standbyEl.muted = mutedRef.current;
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

        // Preload toIdx + 1 into the now-free slot for the next transition.
        preloadSlot(fromSlot, toIdx + 1);

        transitioningRef.current = false;
      }, CROSSFADE_MS);
    };

    if (standby.readyState >= 2) {
      startCrossfade();
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
      if (
        s.lipSyncAppliedAt ||
        (s.clipSource as string) === 'ai-heygen' ||
        // Director Console — locked AudioPlan with at least one rendered clip
        // owns the scene's spoken track even if the DB row is not yet loaded.
        (s.audioPlan?.speakers?.some((sp) => !!sp.audioUrl))
      ) {
        ids.add(s.id);
      }
    });
    return ids;
  }, [sceneAudioClips, playable]);

  /** True when the currently-active scene already has its own spoken audio
   *  (per-scene VO clip OR embedded lip-sync). Global VO is muted while true. */
  const currentSceneHasOwnVoice = !!currentScene && perSceneVoSceneIds.has(currentScene.id);

  // Auto-unmute when an audible track becomes available — VO, BGM, SFX, OR
  // a lip-sync / HeyGen scene whose audio is embedded directly in the video.
  useEffect(() => {
    const hasEmbeddedAudio = playable.some(
      (s) =>
        s.lipSyncWithVoiceover === true ||
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
      playable.filter(s => !!s.lipSyncAppliedAt).map(s => s.id),
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
