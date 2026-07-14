## Problem

Bei Kling Omni läuft der Lip-Sync technisch, aber:
1. Die Stimmen klingen englisch und sprechen kein sauberes Deutsch (Gibberish/Fantasiesprache).
2. Der Dialog wird nur als separates `dialog`-Feld an Replicate übergeben — nicht in den eigentlichen `prompt` eingebettet.

## Ursachen

- **Prompt enthält keinen Dialog**: Der Prompt beschreibt nur die Szene visuell. Kling Omni konditioniert die Lip-Motion aber deutlich besser, wenn der gesprochene Text auch im Prompt erwähnt wird (Sprecher-Attribution + Zitat).
- **`spoken_language` wird als 2-Buchstaben-Code (`de`, `en`, `es`) gesendet** — Replicate/Kling Omni erwartet aber den Klarnamen (`german`, `english`, `spanish`). Ohne gültige Sprache fällt das Modell auf einen englisch-gefärbten Default zurück → phonetisches Gestottere.
- **Prompt sagt der Engine nicht, in welcher Sprache gesprochen wird** — auch wenn `spoken_language` korrekt ist, hilft ein expliziter Hinweis im Prompt zusätzlich.

## Änderungen (Frontend only + kleine Edge-Function-Normalisierung)

### 1. `src/components/ai-video/ToolkitGenerator.tsx`
Vor dem `supabase.functions.invoke(...)`-Call im Omni-Branch (Zeilen 700–718) den `prompt` mit einem sauberen Dialog-Block anreichern, wenn Lip-Sync-Zeilen vorhanden sind:

```
[SPOKEN LANGUAGE]: German (Hochdeutsch) — all voices speak clearly and naturally in German.
[DIALOG]
Sarah: "Hi! Willkommen bei AdTool."
Matthew: "Danke Sarah — was empfiehlst du?"
```

- Block wird an das Ende des vorhandenen `prompt` gehängt (nicht ersetzt) → optimierter visueller Prompt bleibt erhalten.
- Sprachlabel dynamisch aus `effectiveSpokenLang` (`de` → "German (Hochdeutsch)", `en` → "English", `es` → "Spanish (Castellano)").
- Nur aktiv, wenn `activeLines.length > 0`.

### 2. `supabase/functions/generate-kling-video/index.ts`
Kleine Normalisierung in Zeilen 231 / 244: `spoken_language` von `de`/`en`/`es` auf `german`/`english`/`spanish` mappen bevor an Replicate gesendet. Fallback: der übergebene Wert unverändert.

```ts
const LANG_MAP: Record<string, string> = { de: 'german', en: 'english', es: 'spanish' };
const klingLang = LANG_MAP[spokenLanguage?.toLowerCase() ?? ''] ?? spokenLanguage;
```

### 3. Keine UI-Änderungen an Voice-Presets nötig
`female-warm` / `male-warm` etc. sind Kling-native Preset-Labels und funktionieren mit `spoken_language`, sobald diese korrekt gesetzt ist.

## Nicht betroffen

- Motion Studio, andere Modelle, Sync.so-Pipeline.
- `omniLines`-State und UI bleiben unverändert.
- Kein DB/Migrations-Change.

## Erwartetes Ergebnis

- Kling Omni erhält im `prompt` klare Sprach- und Dialoginformation → Lip-Motion und Prosodie passen zum Text.
- `spoken_language=german` erzwingt deutsche Aussprache statt englischer Default-Voice.
- Kein Gibberish mehr; Sprecher sprechen exakt die eingegebenen Zeilen auf Deutsch.
