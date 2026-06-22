# Motion Studio Briefing — Cinematic Polish Pass

Close the three gaps from the last review so the Briefing actually looks and behaves like a film-director console.

## 1. Stronger Glass + Visible Gold (StagePanel)

Make panels read as lit glass on a dark stage instead of dark grey rectangles.

- Background: layered gradient `linear-gradient(180deg, rgba(20,26,42,0.72) 0%, rgba(11,17,32,0.55) 100%)` + `backdrop-blur-2xl` + `saturate(140%)`.
- Inner top highlight: `box-shadow: inset 0 1px 0 rgba(255,233,168,0.18), inset 0 0 0 1px rgba(245,199,106,0.12)`.
- Outer gold glow: `0 0 0 1px rgba(245,199,106,0.25), 0 20px 60px -20px rgba(245,199,106,0.18), 0 8px 24px -12px rgba(0,0,0,0.6)`.
- Take-Slate header: real slate look — black bar with diagonal yellow/black hazard stripe edge, `SC 01 · TAKE 1` in mono, gold `●` REC dot with soft pulse.
- Hover: glow intensifies (`rgba(245,199,106,0.4)`), 200ms ease.

## 2. Mode Switch Actually Changes the Stage

Quick / Direct / Studio must produce visibly different briefings, not just hide cards silently.

- **Quick** (2 panels): Category + single combined "Briefing & Format" panel (prompt + aspect + duration inline). Big gold CTA. Stepper hidden, replaced by single "ONE-TAKE" slate.
- **Direct** (5 panels): adds Production Mode, Style & Format, Video Mode. 3-step stepper.
- **Studio** (all panels): full 5-step stepper, Character Manager, Director's Notes between sections.
- Mode indicator strip becomes a real film-strip selector (3 perforated tiles, active tile lit gold, inactive tiles dim with sprocket holes on top/bottom edge).
- Switching mode triggers a 250ms cross-fade on the panel grid so the change is felt.

## 3. Welcome Sequence — Re-triggerable + Upgrade

- Remove any remaining gates; `StageWelcomeMoment` mounts on every entry to `/video-composer` Motion Studio tab.
- Extend from ~1.2s to ~2.6s with 4 beats:
  1. Black screen, gold `●` REC blinks (0 → 0.4s)
  2. Clapperboard slate slams down with `SC 01 · TAKE 1 · MOTION STUDIO` (0.4 → 1.2s, subtle shake)
  3. Cinemascope bars retract, "WELCOME TO ADTOOL AI MOTION STUDIO" types in Playfair (1.2 → 2.2s)
  4. Bars fully open, panel grid fades up (2.2 → 2.6s)
- Skippable via click anywhere or Esc.
- Reduced-motion: collapse to a 400ms fade + static slate.

## 4. CTA + Stepper Polish

- CTA: keep gold gradient, add inner highlight + animated sheen sweep every 4s when ready, lock-icon → arrow morph on hover.
- Stepper: each step becomes a mini film-slate (number in mono, label below, active = gold fill + soft glow, completed = gold outline + check, pending = bone-white 40% opacity).

## Technical Notes

- **Files edited:** `BriefingTab.tsx` (mode-aware grid + film-strip selector + stepper slate), `StagePanel.tsx` (stronger glass + slate header), `StageWelcomeMoment.tsx` (4-beat sequence, no gate), `index.css` (`@keyframes stageRecPulse`, `stageSheen`, `slateSlam`).
- **Files created:** `FilmStripModeSelector.tsx`, `StageStepperSlate.tsx`.
- **No backend, no edge function, no schema changes.** Pure frontend / presentation.
- **Out of scope:** Storyboard tab, audio engine, render pipeline, AI co-pilot.

## Effort

~0.5 day. Frontend only.
