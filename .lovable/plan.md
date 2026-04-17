
## Befund
Im aktuellen `VoiceSubtitlesTab.tsx` fehlen zwei Dinge:
1. **KI-Skript-Generator**-Button mit frei wählbarer Ziel-Länge (analog Universal Content Creator)
2. **Voice-Tuning-Controls**: Geschwindigkeit, Stabilität, Ähnlichkeit, Stil-Verstärkung, Speaker Boost

Beide Bausteine existieren bereits in der Codebase und können wiederverwendet werden:
- `src/components/universal-creator/VoiceoverScriptGenerator.tsx` — Skript-Dialog mit Idee/Tone/Dauer-Slider, ruft `generate-voiceover-script`
- `src/components/video/AdvancedVoiceSettings.tsx` — Slider für Stability, Similarity, Style, Speaker Boost + 4 Presets (Professionell/Energisch/Emotional/Neutral)
- Edge-Function `generate-voiceover` akzeptiert bereits `speed`, `stability`, `similarityBoost`, `style`, `useSpeakerBoost` (Zeile 17–24, 76–96)

## Plan

### 1. KI-Skript-Generator-Button
In `VoiceSubtitlesTab.tsx` im Skript-Header **vor** dem "Aus Szenen"-Button einen **"KI-Generator"**-Button (Sparkles-Icon) hinzufügen. Öffnet `<VoiceoverScriptGenerator>`-Dialog. Bei Übernahme: `setScript(generatedScript)`.

### 2. Slider-Range erweitern in `VoiceoverScriptGenerator.tsx`
Aktuell 15–60s → erweitern auf **10–180s** (Step 5). Default-Wert wird beim Öffnen aus der Gesamtdauer der Szenen vorbelegt:
```ts
const totalSceneDuration = scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
const defaultDuration = Math.max(10, Math.min(180, Math.round(totalSceneDuration) || 30));
```
Dazu wird eine optionale `defaultDuration`-Prop ergänzt.

### 3. Voice-Tuning-Sektion (neu)
Direkt **unter dem Voice-Picker** eine kompakte Sektion mit:
- **Geschwindigkeits-Slider** (0.7–1.2, Step 0.05) — eigener Slider, weil `AdvancedVoiceSettings` aktuell keine Speed hat
- **`<AdvancedVoiceSettings>`** — komplette Komponente einbinden (Stabilität, Ähnlichkeit, Stil-Verstärkung, Speaker Boost + 4 Presets)
- State `voiceTuning: { speed, stability, similarityBoost, styleExaggeration, useSpeakerBoost }` lokal halten
- Werte werden beim "Voiceover generieren" an `generate-voiceover` mitgegeben

### 4. Persistenz im Draft
Aktuelle `voiceover`-Konfiguration in `assemblyConfig` um Tuning-Felder erweitern:
```ts
voiceover: {
  enabled, voiceId, language, script, audioUrl, duration,
  speed?: number,
  stability?: number,
  similarityBoost?: number,
  styleExaggeration?: number,
  useSpeakerBoost?: boolean,
}
```
→ Werte überleben Reload und werden beim erneuten Generieren wiederverwendet.

### 5. Lokalisierung
Neue Keys in `translations.ts` (DE/EN/ES):
- `aiScriptGenerator` ("KI-Generator" / "AI Generator" / "Generador IA")
- `voiceTuning` ("Stimm-Feinabstimmung" / "Voice Tuning" / "Ajuste de Voz")
- `speed` ("Geschwindigkeit" / "Speed" / "Velocidad")

`AdvancedVoiceSettings` enthält intern deutsche Strings — wir lassen die wie sie sind (sie sind bereits selbsterklärend mit Tooltips), oder optional in einem zweiten Schritt lokalisieren.

## Geänderte Dateien
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — KI-Button + Dialog + Speed-Slider + AdvancedVoiceSettings + Tuning-State
- `src/components/universal-creator/VoiceoverScriptGenerator.tsx` — Slider 10–180s, optionale `defaultDuration`-Prop
- `src/types/video-composer.ts` — `VoiceoverConfig` um Tuning-Felder erweitern
- `src/lib/translations.ts` — neue Keys

## Verify
- Skript-Header zeigt 2 Buttons: **"KI-Generator"** + **"Aus Szenen"**
- KI-Dialog: Slider geht bis 180s, vorbelegt mit Szenen-Gesamtdauer
- Generiertes Skript landet im Textarea
- Unter Voice-Picker: Speed-Slider (0.7–1.2) + Erweiterte Einstellungen aufklappbar
- Generiertes Voiceover klingt entsprechend schneller/langsamer + reagiert auf Stabilität/Stil
- Werte überleben Tab-Wechsel und Reload
