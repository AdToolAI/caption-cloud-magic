## Problem

Im Composer-Master-Preview gibt es zwei Bugs nach dem Hinzufügen von Dialog/Lip-Sync:

1. **Kein Ton** trotz aktiviertem Lautsprecher.
2. **Charaktere in Szene 1 sehen anders aus** als die Avatare — aber **nur seit Lip-Sync**. Davor matchten die Renders die Avatare 1:1.

## Ursachen

### Audio (Bugs in `ComposerSequencePreview.tsx`)

- **Auto-Unmute zu eng** (Z. 596): `muted` startet `true` und wird nur entstummt, wenn `voiceoverUrl`/`backgroundMusicUrl`/`sceneAudioClips` gesetzt sind. Lip-Sync-HeyGen-Videos haben den Ton **im Video selbst** — keiner dieser Trigger feuert.
- **Slot B JSX hartcodiert `muted`** (Z. 781): wird zwar imperativ überschrieben, aber jeder Re-Render setzt zurück.
- **`preloadSlot` mutet immer** (Z. 222): jede Vorbereitung des Standby-Slots stellt `el.muted = true` ein.

Zusätzlich: `SceneDialogStudio.handleGenerate` spawnt Sub-Szenen mit `clipUrl: r.videoUrl ?? undefined`. HeyGen liefert synchron `videoUrl: null` (Polling läuft 1–3 min im Hintergrund). Es gibt **keinen Composer-Poller, der die Sub-Szene später updated** → die Lip-Sync-Szenen erscheinen nie im `playable`-Array, der Player zeigt nur Szene 1 ("Szene 1 von 1").

### Avatar-Drift in Szene 1 (Auslöser: das Re-Roll nach Dialog-Add)

Vor Lip-Sync hatte Szene 1 nur **einen Cast-Member** und der Anchor-Resolver lieferte deterministisch `first-frame-direct` (Portrait direkt) oder die bereits einmalig komponierte und auf der Szene gespeicherte `referenceImageUrl` → Renders sahen 1:1 wie die Avatare aus.

Nach dem Dialog-Setup wurde der Cast auf **2 Charaktere** erweitert. Beim manuellen "Neu generieren €0.75"-Klick lief `prepareSceneAnchor` neu — diesmal mit `multi=true`, also `first-frame-composed` über Nano Banana 2 mit 2 Portraits gleichzeitig. Diese Multi-Portrait-Edit-Pfade (Nano Banana 2) verändern bekanntermaßen Gesichtszüge stärker als Single-Portrait. **Ergebnis: anderer Look als die Avatare.**

Eine einmal erfolgreich genutzte `referenceImageUrl` wird **nicht persistent auf der Szene gespeichert**, also rechnet jeder Re-Roll die Komposition neu — mit potenziell anderem Output.

## Fix

Kein Face-Lock, kein Provider-Switch. Stattdessen: **Determinismus + Audio-Ergonomie**.

### 1. Audio im Master-Preview hörbar machen
**`src/components/video-composer/ComposerSequencePreview.tsx`**
- Auto-Unmute-Effekt erweitern: zusätzlich entmuten, sobald **mind. eine Szene** `lipSyncWithVoiceover === true` hat oder `clipSource === 'ai-heygen'` ist.
- `muted`-Attribut aus Slot-B-JSX entfernen (Z. 781).
- `preloadSlot`: nur dann zwangs-muten, wenn der Slot **nicht aktiv** ist; sonst `mutedRef.current` respektieren.
- Volume-Toggle-Klick auf **alle** Video-Slots anwenden (Schutz gegen Race beim ersten Tap).

### 2. Lip-Sync-Sub-Szenen sichtbar machen (HeyGen-Polling)
**`src/components/video-composer/SceneDialogStudio.tsx`** und **`src/components/video-composer/ClipsTab.tsx`**
- Beim `onAddScene` `replicatePredictionId = data.predictionId` (HeyGen video_id) speichern und `clipStatus: 'generating'` setzen, wenn `videoUrl` initial `null` ist.
- Bestehender `pollScenes` (ClipsTab) prüft die `composer_scenes`-Tabelle alle 5s — `generate-talking-head` muss bei Fertigstellung den passenden Composer-Scene-Datensatz updaten (`clip_url` + `clip_status='ready'`). Wir verifizieren das vor dem Edit; wenn der Hook fehlt, im Edge-Function-Webhook ergänzen.

### 3. Avatar-Look beim Re-Roll deterministisch machen
**`src/lib/motion-studio/prepareSceneAnchor.ts`** + Caller-Pfad in **`ClipsTab.tsx`**
- Nach erfolgreichem Render der Szene den verwendeten First-Frame als `referenceImageUrl` **auf der Szene persistieren** (`onUpdateScenes` + DB-Update). Beim nächsten Re-Roll greift dann der bereits existierende Short-Circuit `if (scene.referenceImageUrl) return { firstFrameUrl: scene.referenceImageUrl }` → **identische Charaktere wie zuvor**, kein erneutes Nano-Banana-Roulette.
- Manuelles "Re-Compose Anchor" bleibt als bewusste User-Aktion möglich (kleiner Button auf der Scene-Card, optional in Phase 2).

Damit:
- Single-Cast-Szenen vor Lip-Sync: bleiben unverändert (nutzten `first-frame-direct`).
- Multi-Cast-Szenen nach Dialog-Add: erste Komposition wird "eingefroren", Re-Rolls reproduzieren denselben Look.
- Kein erzwungener Face-Lock, kein Provider-Switch — der Clip dreht sich nicht plötzlich um den Charakter.

## Bewusst nicht angefasst

- HeyGen-Engine, Provider-Wahl, Vidu-Switch — nichts davon.
- Render-Pipeline (Lambda, Director's Cut).
- SceneClipProgress-Mini-Player (im letzten Edit bereits korrekt entstummt).

## Verifikation

1. Composer öffnen → Szene 1 mit 2 Avataren → "Neu generieren": Charaktere sehen **identisch** zur ersten Generation aus (kein Morph).
2. Dialog hinzufügen → "Dialog generieren": nach 1–3 min erscheinen Sub-Szenen 2/3/… im Player ("Szene 2 von 4").
3. Master-Preview Play: Lautsprecher ist automatisch aktiv, Stimmen + Lippen synchron hörbar.
