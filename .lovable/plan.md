## Problem

`SceneDialogStudio.tsx` (Button "Professionellen Lip-Sync rendern (2 Cuts)") läuft noch über den **Legacy-Split-Pfad**: Die Parent-Szene mit beiden Sprechern wird in N Solo-Sub-Szenen zerschnitten (eine pro Sprecher), bevor die Two-Shot-Pipeline überhaupt greifen kann. Ergebnis: Storyboard zeigt 2 separate Hailuo-Solo-Cuts statt einer Two-Shot-Szene.

## Ziel

Bei ≥2 Sprechern soll der Button **die Parent-Szene erhalten** und sie direkt durch `compose-twoshot-lipsync` rendern lassen (1 Karte, 1 10s-Master-Clip, sequenzieller Sync.so-Pass pro Gesicht).

## Änderungen (alle Frontend, kein Edge-Function-Touch)

### 1. `SceneDialogStudio.tsx` — Two-Shot-Branch vor dem Split-Code

In der Submit-Handler-Funktion (vor Zeile 904, "Phase 2: build all sub-scene partials"):

```text
if (synthed.length >= 2) {
  // Two-Shot-Pfad: Parent-Szene NICHT splitten
  onUpdate({
    audioPlan,                    // bereits gebaut (Z. 877–894)
    dialogLockedAt: ...,
    durationSeconds: 10,          // Master-Clip-Länge
    clipSource: 'ai-hailuo',
    engineOverride: undefined,    // Two-Shot nutzt Sync.so, nicht HeyGen
    twoshotStage: 'audio',
    clipStatus: 'generating',
  });
  // ClipsTab Auto-Trigger erkennt ≥2 Sprecher und ruft compose-twoshot-lipsync
  onClose();
  return;
}
// else: Legacy-Single-Speaker-Pfad bleibt für 1-Sprecher-Szenen
```

Den gesamten Block Z. 909–998 (insertScenesAfter / Sub-Scene-Render-Loop) **nur noch für `synthed.length === 1`** ausführen.

### 2. Button-Label im Two-Shot-Fall

Wenn `sceneCast.length >= 2` und Voices gesetzt: CTA-Text auf  
**"🎭 Two-Shot in echte Szene einbauen (~€1.65)"**  
ändern (Cost-Hint statt "2 Cuts"). Bei 1 Sprecher bleibt "Professionellen Lip-Sync rendern".

### 3. Hinweis-Strip im Dialog

Über dem Button ein dezenter Info-Strip bei ≥2 Sprechern:
> *"Beide Sprecher werden in EINE 10s-Szene komponiert (Two-Shot). Sequenzieller Lip-Sync pro Gesicht via Sync.so."*

### 4. Verification

Nach Klick erwartet:
- **1 Karte** im Storyboard (nicht 2)
- Badge "🎭 Two-Shot · 2 Sprecher" sichtbar
- 6-Stage-Progress-Bar läuft (Voiceover → Anchor → Master-Clip → Lip-Sync 1/2 → Lip-Sync 2/2 → Continuity)
- Storyboard-Counter bleibt auf bisheriger Szenenzahl (kein +1)

## Out-of-Scope

- Backend (`compose-twoshot-lipsync`, `compose-video-clips`-Routing) bleibt unverändert — ist bereits korrekt verdrahtet
- Continuity Guardian, Drift-Score-Badge, Anchor-Composition: alles schon implementiert
- Auto-Director / Trend-Storyboards mit Multi-Speaker: separater Pass, nicht Teil dieses Fixes

## Risiko / Rollback

- Single-Speaker-Szenen (häufigster Fall) bleiben **unverändert** — der Legacy-Pfad wird nur für `synthed.length === 1` aktiv
- Sollte der Two-Shot-Render fehlschlagen, greift der bestehende Auto-Refund (Credit-Reliability-Memory) und der User kann den Button erneut klicken
