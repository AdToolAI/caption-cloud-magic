# Kling-Integration — Adaptive Model-Auswahl statt eigener Bereich

## Deine zwei Fragen zuerst beantwortet

### 1. Ist Kling Omni Lip-Sync mit **deutschen Stimmen** kompatibel?

**Ja.** Kling 3.0 Omni ist genau dafür gebaut. Der native Audio-Path unterstützt laut Kuaishou-Release-Notes (Feb 2026, globaler Rollout Mai 2026):

- **Deutsch, Englisch, Spanisch, Französisch, Portugiesisch, Japanisch, Chinesisch, Koreanisch** (mind. 8 Sprachen mit voller Lip-Sync-Adhärenz)
- TTS + Viseme-Timing wird in einem einzigen Modell-Pass erzeugt → keine Nachträgliche-Sync-Fehler
- Charakter-Referenz-Bild bleibt identitätstreu (Face-Preservation ist Teil des Omni-Trainings)

Das ist der große Unterschied zu Kling 2.1/2.5 und zu Veo/Kling-Standard, wo deutsches Voiceover oft in Fantasie-Kauderwelsch abgleitet (der Bug, den wir mit dem "Spoken-Language-Capability-Guard" abfangen mussten). **Omni braucht diesen Guard nicht** — Deutsch geht sauber durch.

Zwei Einschränkungen bleiben:
- **Multi-Speaker (≥3 Personen in einer Szene)** ist bei Omni Neuland. Für Werbespots mit 3+ Sprechern bleibt Hailuo→Sync.so vorerst der bewährte Pfad.
- Stimmen-Vielfalt ist auf Klings interne TTS-Voices beschränkt. Wer eine spezifische ElevenLabs-Voice will, bleibt bei der klassischen Pipeline.

### 2. Adaptive UI statt eigener Kling-Area — besser?

**Ja, deutlich besser.** Zustimmung an drei Fronten:

- **Konsistenz.** Der Nutzer muss nicht lernen, dass es "zwei Studios" gibt. Alle Video-Modelle stehen in einer Liste, das mentale Modell bleibt einfach.
- **Skalierbarkeit.** Wenn morgen Sora 3 oder Runway Gen-5 auch Native-Lip-Sync bekommt, brauchen wir keine dritte Area — die gleiche Adapter-Logik greift.
- **Weniger Code-Duplikation.** Kein zweiter `ToolkitGenerator`, kein zweiter Cost-Widget, kein zweiter Preset-Selektor.

Der saubere Pattern-Name dafür ist **"Capability-Driven UI"**: die UI reagiert auf `providerCapabilities[modelId]`, nicht auf eine Modell-Whitelist. Das haben wir bereits als Fundament (`src/lib/video-composer/providerCapabilities.ts`) — wir müssen es nur konsequent nutzen.

---

## Umsetzung — der überarbeitete Ansatz

### 1. Model-Liste erweitern (keine eigene Area)

Vier neue Einträge werden **in die bestehende Modelliste** von `ModelSelector` einsortiert, gruppiert nach Provider:

| Anzeige | ID | Preis EUR/s | Badges |
| --- | --- | --- | --- |
| Kling 2.5 Turbo | `kling-2.5-turbo` | 0,09 | ⚡ Fast |
| Kling 2.6 | `kling-2.6` | 0,12 | 🎧 Ambient Audio |
| Kling 3.0 Pro | `kling-3-pro` | 0,24 | ✨ 1080p |
| **Kling 3.0 Omni** | `kling-omni` | 0,60 | 🎤 Native Lip-Sync · 🌍 DE/EN/ES · 🎬 Multi-Shot |

Die alten Einträge `kling-3-standard`/`kling-3-pro` in `klingVideoCredits.ts` werden intern auf die neuen Namen gemapped (Rückwärtskompatibilität für bestehende Sessions).

### 2. Capabilities pro Modell in `providerCapabilities.ts` deklarieren

Die Erweiterung ist der Kern. Statt heute nur `durations/lipsync/multiSpeaker` bekommt jedes Modell eine reichere Fähigkeits-Beschreibung:

```
{
  durations: [5, 10, 15],
  nativeLipSync: true,        // NEU: Provider macht Lip-Sync selbst
  nativeAudio: true,          // NEU: Provider macht Audio selbst
  supportedLanguages: ['de', 'en', 'es', 'fr', ...],  // NEU
  multiShot: { min: 2, max: 6 },  // NEU
  imageToVideo: true,
  startEndFrames: true,       // NEU
  maxSpeakers: 2,             // NEU: 3+ → klassische Pipeline
}
```

Nur Kling Omni bekommt alle Flags auf `true`; die übrigen Modelle behalten den bestehenden Stand. Kein Breaking-Change.

### 3. UI reagiert adaptiv auf Capabilities

`ToolkitGenerator.tsx` liest die Capabilities des aktuell ausgewählten Modells und blendet abhängig davon Panels ein oder aus:

- **`nativeLipSync: true` UND Skript vorhanden**
  - "Dialog & Lip-Sync"-Toggle wird **automatisch an** (nicht mehr optional versteckt)
  - Sprach-Selector erscheint (DE/EN/ES/…) — aber nur die vom Modell unterstützten Sprachen
  - Info-Badge: "Native Lip-Sync — kein Sync.so nötig"
  - Sync.so-Pipeline wird für diese Szene **hart übersprungen** (siehe Backend-Punkt 4)

- **`nativeAudio: true`**
  - Ambient/Musik-Panel bekommt einen zusätzlichen Radio-Button "Vom Modell generieren lassen"
  - Bestehendes ElevenLabs-Voice-Panel wird ausgeblendet (Modell macht TTS selbst)

- **`multiShot.max > 1`**
  - Optionaler "Multi-Shot"-Akkordeon-Bereich erscheint (2–6 Shots mit Timing-Slider). Default: 1 Shot (Standardverhalten unverändert).

- **`startEndFrames: true`**
  - Im Reference-Image-Uploader erscheint ein zweites Feld "End-Frame (optional)"

- **`maxSpeakers === 2` bei Omni**
  - Wenn Nutzer ≥3 Sprecher zuweist, Warntoast: "Kling Omni unterstützt max. 2 Sprecher. Für ≥3 empfehlen wir Hailuo (Sync.so-Pipeline)." mit Ein-Klick-Wechsel.

Alle anderen Modelle sehen die Panels **nicht** — die UI bleibt für sie exakt wie heute. Kein Regressionsrisiko.

### 4. Backend — ein einziger neuer Edge-Function-Slug

- **`generate-kling-omni-video`** (neu): eigener Payload (Multi-Shot-Array, Language-Locale, Audio-Config), Preis aus `_shared/videoPricingCatalog.ts`, Refund-Automatik nach bestehendem Muster.
- **Pipeline-Bypass**: `useTwoShotAutoTrigger` und `SceneDialogStudio` prüfen `providerCapabilities[modelId].nativeLipSync` — bei `true` wird `compose-dialog-segments`/Sync.so **komplett übersprungen**, der Omni-Clip ist der finale Clip.
- **`LIPSYNC_SAFE_PROVIDERS`** in `lipsyncProviderSafety.ts` wird um `ai-kling-omni` erweitert → kein v209-Warndialog mehr für Omni.
- Kling 2.5 Turbo, 2.6, 3.0 Pro laufen weiter über die bestehende `generate-kling-video`-Function (nur Slug- und Preis-Erweiterung nötig).

### 5. Kein neuer Tab, kein neuer Bereich

`KlingStudioPanel.tsx` aus dem letzten Entwurf entfällt komplett. Der bestehende `ToolkitGenerator` wird um ~150 Zeilen Capability-abhängige Blöcke erweitert, sonst nichts.

---

## Warum das strukturell sauberer ist

- **Ein Ort für Preise.** Der `videoPricingCatalog` bleibt Single-Source-of-Truth. Kein Bypass, keine Sonderpreise für einen "Kling-Bereich".
- **Ein Ort für Capabilities.** Jedes neue Modell wird an einer einzigen Datei beschrieben, und die UI passt sich automatisch an.
- **Test-Oberfläche stabil.** Bestehende Playwright-Tests am `ToolkitGenerator` bleiben grün, weil nur zusätzliche (optionale) Panels dazukommen.
- **Marketing-tauglich.** Wir können später ganz einfach Filter-Chips ins Modell-Dropdown einbauen ("Nur Modelle mit Native Lip-Sync", "Nur Modelle mit Deutsch") — die Capabilities sind schon da.

## Rollout in 3 Phasen (revised)

**Phase 1 — Preise, Registry & Capabilities (rein additive Änderungen)**
- 4 neue Kling-Modelle in `videoPricingCatalog.ts`, `aiVideoModelRegistry.ts`, `klingVideoCredits.ts`.
- `providerCapabilities.ts` um die neuen Flags (`nativeLipSync`, `nativeAudio`, `supportedLanguages`, `multiShot`, `startEndFrames`, `maxSpeakers`) erweitern.
- Nur Kling Omni bekommt alle Flags `true`; andere Modelle behalten den heutigen Stand.

**Phase 2 — `generate-kling-omni-video` Edge Function + Pipeline-Bypass**
- Eigene Function mit Native-Audio- und Language-Locale-Payload.
- Bypass-Logik in `useTwoShotAutoTrigger`/`SceneDialogStudio`.
- `LIPSYNC_SAFE_PROVIDERS`-Eintrag.

**Phase 3 — Adaptive UI-Panels in `ToolkitGenerator`**
- Sprach-Selector, Native-Lip-Sync-Badge, Multi-Shot-Akkordeon, Start-/End-Frame-Feld.
- Alle Panels rein Capability-getrieben, keine Modell-Whitelist im UI-Code.
- Warntoast bei ≥3 Sprechern + Ein-Klick-Wechsel zu Hailuo.

Motion Studio bekommt die Capability-Erkennung automatisch, weil `SceneCard.tsx` bereits über `providerCapabilities` läuft — nur der Provider-Picker muss die 4 neuen Kling-Varianten anzeigen.

---

## Offene Punkte vor Phase 1

1. **Omni-Launch-Preis.** 0,60 €/s (3,00× Marge, 9 € pro 15-s-Clip) oder Beta-Aktion bei 0,45 €/s (2,25×)?
2. **Fallback-Verhalten.** Wenn Omni-Call fehlschlägt: automatisch auf Kling 2.6 + Sync.so degradieren, oder Refund + Fehlermeldung anzeigen?
3. **Sprachen-Umfang zum Launch.** Nur DE/EN/ES (unsere drei Plattform-Sprachen) oder direkt alle 8 von Kling unterstützten?

Sag Bescheid zu den drei Punkten, dann starte ich mit Phase 1 (rein additive Änderungen, keine bestehende Pipeline wird angefasst).
