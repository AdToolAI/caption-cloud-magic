# Universal Creator — Original-Sound Feature + schwarzer Bildschirm

## Diagnose

### Schwarzer Bildschirm in Schritt 4
Bei Wechsel von Schritt 3 → 4 wechselt die Vorschau vom einfachen HTML-`<video>` zum vollständigen Remotion-`Player` mit `UniversalCreatorVideo`. Hauptursache:

**`delayRender`-Deadlock in `SafeVideo`.** Remotions `<Video>` in `SafeVideo` ruft `delayRender()` beim Mount und wartet auf `onLoadedData`. Solange das Video im Preview-Player nicht dekodiert ist, bleibt der komplette Player-Frame schwarz — bis zu 20 s (dann Fallback). Bei Stock-Videos mit CORS-Preflight ist das exakt das Symptom: schwarz + VO läuft weiter (VO läuft extern via HTMLAudio).

Zusätzlich: `voiceoverDuration` wird in `buildUniversalCreatorCustomizations` (Zeile 128) mit der Gesamt-Composition-Dauer überschrieben — sauberer zu trennen.

### Original-Sound-Feature fehlt komplett
`SafeVideo` rendert Remotions `<Video>` mit hart-kodiertem `muted`. Der Original-Audiotrack der Hintergrundvideos ist weder im Preview noch im Lambda-Render hörbar. Es gibt aktuell keinen State, keinen UI-Regler, kein Feld im Render-Payload.

## Änderungen

### 1. Datenmodell erweitern

**`src/types/universal-creator.ts` — `ContentConfig`:**
```ts
useOriginalAudio?: boolean;   // globaler Toggle, default false
originalAudioVolume?: number; // 0..1, default 0.6
```

**`src/types/scene.ts` — `Scene`:**
```ts
originalAudio?: {
  muted?: boolean;   // NEU: harter Mute-Override je Szene (aus Schritt 2 gesetzt)
  enabled?: boolean; // aktivieren, überschreibt globalen Toggle
  volume?: number;   // 0..1, überschreibt globalen Volume
};
```

Auflösungslogik (in Payload-Builder + Template gleich):
1. Wenn `scene.originalAudio.muted === true` → immer stumm (Schritt-2-Override gewinnt).
2. Sonst wenn `scene.originalAudio.enabled` gesetzt → dieser Wert gewinnt.
3. Sonst globaler Toggle `contentConfig.useOriginalAudio`.
4. Volume analog: Szene > Global > Default 0.6.

### 2. UI in Schritt 2 — Szenen-Auswahl (dauerhafter Mute)

Im Szenen-Editor jeder Szene mit Video-Background ein kleines **Lautsprecher-Icon** (Mute-Toggle) neben Dauer/Transition:
- Klick togglet `scene.originalAudio.muted`.
- Persistent auf der Szene gespeichert — bleibt beim Wechsel zu Schritt 3/4 erhalten.
- Tooltip: „Originalton dieser Szene dauerhaft stumm schalten".
- Für Nicht-Video-Backgrounds ausgeblendet.

`useSceneManager.updateScene` reicht bereits aus — kein neuer Hook nötig.

### 3. UI in Schritt 4 — Audio-Mix

Neue Sektion **„Szenen-Originalton"**:
- `Switch`: „Original-Videoton der Szenen mitverwenden" → `contentConfig.useOriginalAudio`.
- `Slider` 0–100 % (aktiv nur wenn Switch = an) → `contentConfig.originalAudioVolume`.
- Hinweistext: „Voiceover wird darüber gemischt. In Schritt 2 stummgeschaltete Szenen bleiben stumm — dieser Regler betrifft nur die übrigen."
- Aufklappbarer Bereich „Pro Szene anpassen" mit Slider je Szene (nur Video-Backgrounds, überschreibt globalen Wert). In Schritt 2 gemutete Szenen erscheinen hier ausgegraut mit Hinweis „In Schritt 2 stummgeschaltet".

### 4. Payload-Builder

**`src/lib/universalCreatorRenderPayload.ts`:**
- `normalizeScenesForUniversalCreatorVideo`: `originalAudio` unverändert durchreichen (inkl. `muted`).
- `buildUniversalCreatorCustomizations`: neue Top-Level-Felder `useOriginalAudio`, `originalAudioVolume` (via `clampAudioVolume`).
- Zeile 128 (`voiceoverDuration: durationSeconds`) → `voiceoverDuration: contentConfig?.actualVoiceoverDuration ?? contentConfig?.voiceoverDuration ?? durationSeconds`.

### 5. Remotion-Template

**`src/remotion/templates/UniversalCreatorVideo.tsx`:**
- Prop-Schema (Zod): `useOriginalAudio: boolean`, `originalAudioVolume: number`.
- `SafeVideo` erhält Props `muted: boolean` und `volume: number`, an `<Video>` weitergereicht. Default `muted = true` (unverändertes Verhalten für alle bestehenden Aufrufer außerhalb des Scene-Background-Pfads).
- Im Scene-Background-Renderpfad (`background.type === 'video'`): Auflösungslogik aus Abschnitt 1 anwenden:
  ```ts
  const forcedMute = scene.originalAudio?.muted === true;
  const sceneWantsAudio = scene.originalAudio?.enabled ?? globalUseOriginalAudio;
  const muted = forcedMute || !sceneWantsAudio;
  const volume = clampAudioVolume(scene.originalAudio?.volume ?? globalOriginalAudioVolume ?? 0.6);
  ```
- **Schwarz-Bildschirm-Fix:** `SafeVideo` bekommt einen zusätzlichen Preview-Modus (`diag.silentRender` oder neues `previewMode`-Flag): im Preview `delayRender`-Handle nach spätestens 2 s freigeben statt 20 s. `<Video>` rendert dann weiter, sobald Daten kommen — Composition ist nicht mehr blockiert. Lambda-Pfad behält 20 s Timeout, um saubere Frames zu garantieren.

### 6. Preview-Player

**`src/components/universal-creator/RemotionPreviewPlayer.tsx`:**
- VO + Musik weiterhin extern via HTMLAudio (unverändert).
- Original-Videoton läuft über Remotions internes `<Video>` → wird automatisch vom Player-Master-Mute/Volume gesteuert (Player unmuted bei erster Interaktion). Kein separater Audio-Tag nötig.
- `numberOfSharedAudioTags` unverändert bei 0; bei Bedarf im Test später auf 2 heben.

### 7. Lambda-Render

Für Universal-Creator-Payloads mit `useOriginalAudio === true` **oder** irgendeiner Szene mit `originalAudio.enabled` und `!muted`:
- `hasAudio` in `compose-video-assemble` (bzw. Universal-Creator-Renderpfad) darf nicht `false` werden.
- Wir setzen pro betroffener Szene ein `withAudio: true`-Flag im Remotion-Scene-Payload — die bestehende Aggregation (siehe Memory `Composer hasAudio + v5 sync-segments fix`) schaltet Lambda-`muted` automatisch auf `false`, sodass ffmpeg den Track nicht strippt.
- Preview-Parität = Export-Parität.

### 8. i18n

Neue Keys in `src/i18n/*` (DE/EN/ES):
- Schritt 2: `uc.scenes.muteOriginalAudio` (Tooltip)
- Schritt 4: `uc.audio.originalTone.title`, `.enable`, `.volume`, `.hint`, `.perScene`, `.mutedInStep2`

## Scope-Grenzen

- **Nicht angefasst:** Motion Studio, Director's Cut, Composer, Lip-Sync-Pipeline, Preise/Landing.
- **Keine DB-Migration**: rein Frontend + Payload-Feld.
- **Kein Auto-Ducking** in dieser Iteration — statische Volumes. Ducking als Folge-Feature vermerkt.

## Test-Plan

1. Schritt 2: Szene stummschalten → Icon zeigt gemuteten Zustand, Wechsel zu Schritt 4 zeigt Szene als „gemutet".
2. Szene 15 s + VO 10 s: Preview zeigt Video ab Frame 0 (Schwarz-Bug weg); ab 10 s läuft ggf. Originalton (falls Toggle an) weiter.
3. Global Toggle aus → nur VO hörbar.
4. Global Toggle an @ 50 % → alle Nicht-Schritt-2-gemuteten Szenen bei 50 % + VO in voll.
5. Schritt-2-Mute + globaler Toggle an → betroffene Szene bleibt stumm, andere spielen ab.
6. Lambda-Export mit gemischtem Setup → MP4 spiegelt Preview exakt.
7. Bestehende Projekte ohne die neuen Felder → Verhalten unverändert (rückwärtskompatibel).

## Risiken

- Lauter Original-Stockmusik-Track kann VO überdecken → Default 60 % + Hinweis; Ducking als Folge.
- Preview-`delayRender`-Kurztimeout könnte kurz einen leeren Frame zeigen bevor Video anläuft — akzeptabel im Preview, Lambda unberührt.
