

# Phase 2: Animationen freischalten (r55-Bundle deployed)

## Was sich ändert

Das neue r55-Bundle auf S3 enthält die Dimension-Fixes für `PopInElement` und `FlyInElement` (`position: absolute, inset: 0, width/height: 100%`). Damit können die bisher geblockten Animationen sicher freigeschaltet werden.

## Änderungen

### 1. Blacklist reduzieren (`auto-generate-universal-video/index.ts`)

**Zeile 1290-1291** — Blacklist anpassen:
- `popIn` → **freischalten** (Dimension-Fix im r55-Bundle)
- `flyIn` → **freischalten** (Dimension-Fix im r55-Bundle)
- `kenBurns` → bleibt: nur mit Bild (bereits korrekt implementiert)
- `parallax` → **freischalten** (r55-Fix vorhanden)
- `morphIn` → **freischalten** (Standard-Animation, kein Layout-Bug)

Neue Blacklist: **leer** — alle Animationen erlaubt.

### 2. Default-Animationen auf Loft-Film Niveau upgraden

**`getDefaultAnimation()`** (Zeile 2399) — Scene-Type-basierte Premium-Animationen:
- `hook` → `popIn` (statt `zoomIn`) — aufmerksamkeitsstark
- `problem` → `kenBurns` (statt `slideLeft`) — Loft-Film Signature
- `solution` → `flyIn` (statt `slideRight`) — dynamisch
- `feature` → `parallax` (statt `slideUp`) — Tiefenwirkung
- `cta` → `popIn` (statt `bounce`) — professioneller

### 3. Scene-Type-basierte Transitions aktivieren

**Zeile 1291 + 1308** — Morph-Transition Blacklist entfernen und `disableMorphTransitions` (Zeile 1350) auf `false` setzen.

**Zeile 1341** — Transition-Typ je nach Scene-Type zuweisen statt immer `fade`:
- Hook → Problem: `crossfade`
- Problem → Solution: `slide`
- Solution → Feature: `fade`
- Feature/Proof → CTA: `wipe`
- Default: `fade`

### 4. Bundle-Canary aktualisieren

Canary-String auf `2026-03-10-r55-animations-unlocked` setzen als Verifizierung.

### Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` — Blacklists entfernen, Default-Animationen upgraden, Transitions aktivieren
- Edge Function neu deployen

### Risiko-Minimierung
Falls eine Animation doch crasht, fällt die `validateEnum()`-Funktion automatisch auf `fadeIn` zurück. Der Fallback-Mechanismus bleibt intakt.

