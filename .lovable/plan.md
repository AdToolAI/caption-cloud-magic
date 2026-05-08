# HeyGen Lip-Sync echt in den Render-Flow integrieren

## Problem

Der **„🎙️ HeyGen Lip-Sync"-Badge** im Storyboard ist aktuell nur ein **Hinweis**. Wenn du in der Clips-Tab auf „Generieren" klickst, wird **trotzdem Hailuo** verwendet — denn `compose-video-clips` liest nur `scene.clipSource` (z.B. `ai-hailuo`) und kennt HeyGen gar nicht. Das Voiceover wird zwar erzeugt, aber als reine Audio-Spur drüber gelegt — kein echter Lip-Sync.

## Ziel

Wenn `recommendEngineForScene(scene) === 'heygen-talking-head'`, soll die Clips-Pipeline für genau diese Szene **HeyGen Photo-Avatar** rendern statt Hailuo. Bei Multi-Speaker-Dialog werden mehrere HeyGen-Cuts sequentiell generiert und in der Szene aneinandergehängt.

---

## Schritt 1 — Sichtbarkeit & UX in der Clips-Tab

In `ClipsTab.tsx` neben jeder Szene ein klares Engine-Indikator-Pill anzeigen:

- **„🎙️ HeyGen Lip-Sync"** (gold) — wenn Cast + Dialog vorhanden
- **„🎬 Hailuo B-Roll"** (grau) — Standard
- Im „Generieren"-Button: Cost ist die Summe aus Hailuo-Cost UND/ODER HeyGen-Cost (je nach Engine).

So sieht der User direkt: „diese Szene wird HeyGen, nicht Hailuo".

## Schritt 2 — Render-Routing serverseitig

In `compose-video-clips/index.ts` pro Szene **vor dem Hailuo-Call** prüfen:

```
if (scene.dialogScript && scene.castCharacterPortraits.length >= 1) {
  → invoke('generate-talking-head') pro Sprecher
  → bei mehreren Sprechern: sequentiell rendern,
    danach mit ffmpeg/Remotion-Stitch zu einem Clip zusammenfügen
  → in scene.clipUrl speichern, status = 'ready'
} else {
  → bestehender Hailuo-Pfad
}
```

`generate-talking-head` existiert bereits (HeyGen Photo-Avatar API, `~0.30€/Video`, idempotenter Refund). Wir reused diese Funktion.

## Schritt 3 — Multi-Speaker im Composer

Für Szenen mit `[Matthew] ... [Sarah] ...` Dialog:

1. **Voiceover-Generierung** (bereits vorhanden) erzeugt 1 Audio pro Sprecher.
2. **Clip-Generierung** ruft `generate-talking-head` einmal pro Sprecher auf (Portrait + Voiceover-URL des Sprechers).
3. Server-side stitchen wir die N HeyGen-MP4s mit ffmpeg zu einem Clip in Szenen-Dauer.
4. Resultat = `scene.clipUrl`, `scene.clipStatus = 'ready'`.

## Schritt 4 — Sicherheits-Netz (Override)

In der SceneCard ein kleines Dropdown unter dem Engine-Badge:

- **Auto** (default — Engine-Router entscheidet)
- **Erzwinge HeyGen** — auch wenn nur 1 Sprecher / kein Dialog
- **Erzwinge Hailuo** — überspringt HeyGen, klassischer B-Roll
- **B-Roll + Sync.so Polish** — Hailuo + Lip-Sync-Pass danach

Override wird in `scene.engineOverride: 'auto' | 'heygen' | 'broll' | 'sync-polish'` gespeichert.

## Schritt 5 — Cost-Anzeige aktualisieren

`getClipCost()` erweitern: wenn Szene auf HeyGen geroutet wird, Cost = `0.30€ × Anzahl_Sprecher` statt Hailuo-Cost. Die Gesamt-Schätzung oben (€5.40) wird entsprechend angepasst.

---

## Nicht-Ziele

- **Kein neuer Edge-Function-Code** für HeyGen — `generate-talking-head` bleibt unverändert.
- **Kein Refactor der Voiceover-Pipeline** — Hume/ElevenLabs-VO läuft weiter, dient nur als Audio-Quelle für HeyGen.
- **Kein Wav2Lip / MuseTalk** auf KI-Gesichtern — Qualität zu unzuverlässig.

## Technische Details

- **Geänderte Files**: `ClipsTab.tsx`, `SceneCard.tsx`, `compose-video-clips/index.ts`, `types/video-composer.ts` (`engineOverride` Feld), `lib/cost/pricing.ts`
- **DB-Migration**: 1 neue Spalte `composer_scenes.engine_override TEXT`
- **Edge-Functions reused**: `generate-talking-head` (HeyGen), `compose-video-clips` (erweitert um Routing)
- **Stitching**: ffmpeg via `ffmpeg-stitch` Edge-Function (existiert bereits für Multi-Scene-Render)

## Erfolgskriterium

Du klickst in der Clips-Tab auf „Alle generieren" → Szene 1 (Welcome to DroneOcular mit Matthew + Sarah) wird via HeyGen gerendert. Im fertigen Clip **bewegen sich die Münder von Matthew und Sarah synchron zum Voiceover** — frame-genau, werbe-tauglich.
