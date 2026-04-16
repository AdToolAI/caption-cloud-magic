

## Befund
Der User sieht im Screenshot **nicht** die `AIVoiceOver`-Komponente, sondern die **`SubtitleVoiceoverSection`** in `src/components/directors-cut/studio/CapCutSidebar.tsx` (Zeile 322–434). Diese ist eine separate Sub-Komponente speziell für "Voiceover aus Untertiteln" und hat ihre **eigene hartkodierte Stimmenliste** mit nur 7 generischen englischen Stimmen (Sarah, Roger, Aria, Laura, Charlie, George, Brian) — sie wurde im letzten Update übersehen.

```typescript
const VOICEOVER_VOICES = [
  { id: 'sarah', name: 'Sarah', gender: '♀' },
  { id: 'roger', name: 'Roger', gender: '♂' },
  // ... 5 weitere
];
```

→ Deshalb sieht der User immer noch nur "Sarah" als Standardstimme im Dropdown.

## Plan — `SubtitleVoiceoverSection` auf Premium-Voices umstellen

### 1. Hartkodierte Liste ersetzen
- `VOICEOVER_VOICES`-Konstante (Zeile 323–332) entfernen
- Dynamisches Laden via `supabase.functions.invoke('list-voices')` direkt in der Komponente — gleiches Pattern wie `AIVoiceOver.tsx`
- Premium-Voices zuerst sortieren via `sortVoicesPremiumFirst`

### 2. UI-Upgrade
Statt einfachem `<Select>` mit nur Name+Gender:
- **Sprach-Tabs** (DE/EN/ES) — kompakte Mini-Variante passend zur engen Sidebar
- Voice-Cards mit: Gender-Icon + Name + **Premium-Badge** + kurzer Beschreibung
- **Hörprobe-Button** pro Voice (`VoicePreviewButton`)
- Auto-Tab-Auswahl basierend auf `captionLanguage` beim ersten Render
- Default-Voice = erste Premium-Voice der erkannten Sprache (nicht mehr `'sarah'`)

### 3. Generation-Call erweitern
Im `handleGenerate`: Wie bei `AIVoiceOver` `model_id` und `voice_settings` aus der ausgewählten Premium-Voice mitsenden, damit die natürlicheren Settings (`stability 0.4`, `style 0.3`, `use_speaker_boost true`) auch hier greifen.

### 4. Layout-Anpassung
Da die Sidebar schmal ist (kein Platz für 2-Spalten-Grid wie in `AIVoiceOver`):
- 1-Spalten-Liste mit `max-h-64 overflow-y-auto`
- Kompakte Cards (kleinere Padding, kleinere Beschreibung)
- Sprach-Tabs als 3 schmale Buttons mit Flagge + Anzahl

### 5. Lokalisierung
Voice-Tipp-Banner (DE/EN/ES) inline — analog `AIVoiceOver`.

## Geänderte Dateien
- `src/components/directors-cut/studio/CapCutSidebar.tsx` — `SubtitleVoiceoverSection` komplett auf dynamisches Premium-Voice-Loading umbauen, alte `VOICEOVER_VOICES`-Konstante entfernen

## Verify
- Director's Cut → "Voiceover aus Untertiteln"-Sektion zeigt Premium-Stimmen (Klaus, Julia, Markus …) statt nur Sarah/Roger
- Sprach-Tabs DE/EN/ES funktionieren, Auto-Selektion basierend auf Untertitel-Sprache
- Hörprobe-Button pro Stimme spielt 5s Sample
- Generierter Voice-Over klingt natürlich (neue Settings werden mitgesendet)

## Was unverändert bleibt
- `AIVoiceOver.tsx` (bereits korrekt)
- Andere Sidebar-Sektionen, Render-Pipeline, DB

