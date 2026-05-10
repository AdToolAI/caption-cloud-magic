## Was ist passiert

Beim Two-Shot Cinematic-Sync läuft die Pipeline durch (Hailuo i2v → Sync.so/lipsync-2 mit gemerged-tem VO), aber:

1. **Voiceover ist nicht hörbar** — die finale Lip-Sync-MP4 enthält den gemischten VO als eingebetteten Audio-Track, aber der Player startet stumm und entmutet sich nicht zuverlässig.
2. **Gesichter werden nicht 1:1 übernommen** — Nano Banana 2 weicht beim Multi-Portrait-Compose stärker ab als beim Single-Portrait-Anchor.

## Root-Cause-Analyse

**Issue 1 — Auto-Unmute greift nicht zuverlässig:**
`ComposerSequencePreview` entmutet automatisch nur, wenn `s.lipSyncWithVoiceover === true` ODER ein globaler `voiceoverUrl` vorhanden ist. Beim Cinematic-Sync gibt es keinen globalen VO (er ist im MP4 eingebettet), und der Flag-Roundtrip (SceneDialogStudio → DB → Reload) läuft erst, wenn die nächste Polling-Runde die Szene neu lädt. Folge: Wenn der Player die fertige Lip-Sync-Szene zeigt, bleibt das `<video>`-Element auf `muted=true`, und der eingebettete VO ist unhörbar.

Außerdem filtert `sfxClipsTimeline` (Zeile 715-717) per-szenen Voiceover-Clips raus, sobald `lipSyncAppliedAt` gesetzt ist — die separate VO-Spur, die sonst hörbar wäre, wird also explizit unterdrückt. Wenn das eingebettete Audio im stummen Video nicht durchkommt, hört der User gar nichts.

**Issue 2 — Multi-Portrait-Prompt ist zu generisch:**
Im `compose-scene-anchor`-Prompt steht zwar "Preserve each person's individual identity exactly", aber die Reihenfolge der Portraits wird nicht stark mit den Namen verknüpft, und es fehlt eine Klausel die fordert, dass die Gesichter aus den Referenzbildern *unverändert* übernommen werden (Nano Banana 2 neigt zu Gesichts-Neuinterpretation, wenn der Scene-Prompt sehr konkret ist).

## Plan

### 1. `ComposerSequencePreview.tsx` — Robust-Auto-Unmute

Den Auto-Unmute-Effekt (Zeile ~631) zusätzlich auf `lipSyncAppliedAt` triggern lassen — egal ob `lipSyncWithVoiceover` persistiert ist oder nicht:

```ts
const hasEmbeddedAudio = playable.some(
  (s) =>
    s.lipSyncWithVoiceover === true ||
    !!s.lipSyncAppliedAt ||                    // ← NEU
    (s.clipSource as string) === 'ai-heygen' ||
    s.clipSource === 'upload',
);
```

Zusätzlich: Wenn die aktive Szene `lipSyncAppliedAt` ODER `clipSource==='ai-heygen'` hat, beim Slot-Swap das Video **explizit entmuten** (in dem Effekt der `el.muted = mutedRef.current` setzt — Zeilen ~222 und ~263). Der lip-syncte MP4 trägt sein eigenes Audio; in diesem Fall gewinnt der Mute-Toggle nicht über die Embedded-Audio-Erwartung.

### 2. `ComposerSequencePreview.tsx` — Embedded-Audio-Garantie auf Slot-Swap

Im Slot-Swap-Path (Zeilen ~313-360) für Szenen mit `lipSyncAppliedAt` zusätzlich:

```ts
const hasEmbedded = !!scene.lipSyncAppliedAt || scene.clipSource === 'ai-heygen';
standbyEl.muted = hasEmbedded ? false : mutedRef.current;
```

So ist garantiert, dass das fertige Two-Shot-MP4 hörbar abspielt, sobald es aktiv wird — unabhängig vom Toggle-Zustand.

### 3. `compose-scene-anchor/index.ts` — Identity-Lock-Prompt für Multi-Portrait

Den Multi-Clause für >1 Portrait verschärfen:

```ts
const multiClause = isMulti
  ? ` CRITICAL: Each face must be COPIED PIXEL-FOR-PIXEL from its reference portrait. ` +
    `Do NOT generalize, beautify, or re-imagine any face. ` +
    `All ${portraits.length} characters MUST appear in the SAME frame, ` +
    `positioned naturally per the scene (e.g. side by side, facing each other). ` +
    `If the scene lighting differs from the portrait, only adapt skin tone — never the underlying face geometry.`
  : "";
```

Außerdem den `nameClause` enger an die Reihenfolge binden: "Image #1 = NAME_A, Image #2 = NAME_B" statt einer Komma-Liste.

### 4. Out of Scope

- Per-Sprecher-Stitching (mehrere Sync.so-Pässe)
- Wechsel des i2v-Providers
- Player-UI-Änderungen außer dem Auto-Unmute
- Anchor-Caching anpassen (Cache greift weiter über `promptHash`)

## Verifikation

1. Two-Shot-Szene rendern → sobald die Lip-Sync-MP4 ankommt, startet der Player automatisch entmutet und der gemischte Voiceover ist hörbar.
2. Toggle-Mute funktioniert weiter normal — beim erneuten Aktivieren der Szene wird Embedded-Audio aber wieder zwangs-entmutet.
3. Anchor-Bild zeigt beide Gesichter erkennbar nahe an den Original-Portraits (subjektiv besser als vorher).
