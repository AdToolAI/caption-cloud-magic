## Problem

Im Motion Studio (Video Composer) ist das Skript-Feld im Tab **Voiceover & Untertitel** beim ersten Aufruf **leer**. Der Nutzer muss aktiv „KI-Generator" klicken, einen Dialog ausfüllen und „Aus Szenen generieren" auswählen. Erwartet wird: Das Feld ist bereits **automatisch vorbefüllt** mit einem Skript, das

- am **Briefing** orientiert ist (Produktname, Beschreibung, USPs, Zielgruppe, Tonalität),
- an den **Szenen** entlang erzählt,
- ca. **2–3 Sekunden kürzer** als das Gesamtvideo ist (Outro-Buffer).

Die Edge Function `generate-voiceover-script` kann das alles schon (Modus `from_scenes`, Pro-Szene-Wortbudget, Outro-Buffer 2,5s). Nur das **Auto-Triggering aus dem Tab heraus** fehlt – und das Briefing wird derzeit gar nicht an den Generator weitergereicht.

## Was passieren soll

1. **Beim ersten Öffnen** des Voiceover-Tabs (Skript leer + Voiceover aktiv + Szenen vorhanden):
   - Automatisch ein Skript generieren via `generate-voiceover-script` (Modus `from_scenes`).
   - Die Briefing-Daten (Produkt, Beschreibung, USPs, Zielgruppe, Tonalität) werden als `idea` mitgeschickt, damit das Skript thematisch passt – nicht nur generisch „erzähl eine Story".
   - Ziel-Sprechdauer = `Σ Szenendauer − 2.5s` (übernimmt die Edge Function bereits aus den Szenen).
   - `tone` aus `briefing.tone` mappen (z. B. `excited` → `enthusiastic`, sonst `friendly`).
2. Während der Generierung wird im Skript-Feld ein dezenter Lade-Hinweis gezeigt (Placeholder „KI schreibt dein Skript …" + disabled Textarea + kleiner Spinner neben „Skript"-Label).
3. **Stille bei Fehler**: Wenn die Generierung fehlschlägt (Rate-Limit, Netzwerk), bleibt das Feld leer – kein roter Toast, nur ein kleiner Inline-Hinweis „Auto-Skript fehlgeschlagen – nutze ‚KI-Generator'". Der Nutzer kann jederzeit selbst tippen.
4. **Nicht erneut auto-generieren**, wenn:
   - der Nutzer das Skript bereits selbst geschrieben oder geändert hat,
   - bereits ein Skript vorhanden ist (auch aus früherem Auto-Run),
   - der Voiceover-Switch deaktiviert ist,
   - keine Szenen existieren.
5. Ein neues Flag `assemblyConfig.voiceover.autoScriptGenerated` markiert das automatische Ergebnis. Wenn der Nutzer dann das Briefing oder die Szenen ändert und das Skript noch unverändert ist (ein Hash/String-Vergleich gegen den letzten Auto-Output), erlauben wir eine **stille Re-Generierung** beim nächsten Tab-Öffnen.

## Technische Umsetzung

### 1) `src/components/video-composer/VoiceSubtitlesTab.tsx`
- Prop `briefing: ComposerBriefing` hinzufügen (wird in `VideoComposerDashboard.tsx` aus `project.briefing` weitergereicht).
- Neuer Effekt `useEffect`, der bei Mount/Tab-Eintritt prüft:
  ```
  if (voiceover?.enabled && !voiceover.script?.trim() && scenes.length > 0 && !autoTriedRef.current) → autoGenerate()
  ```
  `autoTriedRef` (useRef) verhindert Mehrfach-Trigger pro Mount.
- Neue async-Funktion `autoGenerateScript()`:
  - baut `idea` aus Briefing (Produktname + Beschreibung + USPs + Zielgruppe, kompakt zusammengefügt),
  - mappt `briefing.tone` → Generator-Tone,
  - ruft `supabase.functions.invoke('generate-voiceover-script', { body: { mode: 'from_scenes', idea, language, tone, scenes: scenes.map(...) } })` auf,
  - bei Erfolg: `onUpdateAssembly({ voiceover: { ...voiceover, script: data.script, autoScriptGenerated: true } })`,
  - bei Fehler: kleinen Inline-Hinweis (lokaler State `autoError: boolean`) setzen.
- Lade-State `autoGenerating: boolean` für Spinner + Placeholder.
- Bestehender `VoiceoverScriptGenerator`-Dialog bleibt unverändert verfügbar (Button „KI-Generator" für manuelle Re-Generierung mit eigener Idee/Ton).
- Vorhandene Funktion `generateScriptFromScenes` (zieht Text aus Overlays) bleibt als zweiter Quick-Button „Aus Szenen" erhalten.

### 2) `src/components/video-composer/VideoComposerDashboard.tsx`
- Beim Render von `<VoiceSubtitlesTab … />` zusätzlich `briefing={project.briefing}` durchreichen.

### 3) `src/types/video-composer.ts`
- Im Interface `VoiceoverConfig` (oder analoges Voiceover-Objekt unter `AssemblyConfig.voiceover`) optionales Feld ergänzen: `autoScriptGenerated?: boolean`. Reine Markierung, keine Migration nötig (Drafts werden lokal/in DB als JSON gehalten).

### 4) Übersetzungen `src/lib/translations.ts`
Neue Keys (DE / EN / ES):
- `videoComposer.autoScriptLoading` – „KI schreibt dein Skript …" / „AI is writing your script …" / „La IA está escribiendo tu guion …"
- `videoComposer.autoScriptError` – „Auto-Skript fehlgeschlagen – nutze ‚KI-Generator' rechts oben." (+ EN/ES)

### 5) Keine DB-Änderungen, keine Edge-Function-Änderungen
Die Edge Function `generate-voiceover-script` unterstützt `mode: 'from_scenes'` mit `idea` + `scenes` bereits vollständig – inklusive Pro-Szene-Wortbudget und 2,5s Outro-Buffer.

## Geänderte Dateien

- `src/components/video-composer/VoiceSubtitlesTab.tsx` – Auto-Generierung, Lade-/Fehler-States, neue `briefing`-Prop
- `src/components/video-composer/VideoComposerDashboard.tsx` – `briefing` durchreichen
- `src/types/video-composer.ts` – Feld `autoScriptGenerated?: boolean`
- `src/lib/translations.ts` – 2 neue Keys × 3 Sprachen

## Out of scope (bewusst nicht jetzt)

- Re-Generierung „on the fly", wenn das Briefing nachträglich geändert wird, während der Voiceover-Tab schon einmal besucht wurde – das würde versehentlich vom Nutzer geschriebene Skripte überschreiben. Stattdessen kann der Nutzer den „KI-Generator"-Button manuell nutzen.
- Änderungen an Stimme, Untertitel-Generierung, Audio-Tab.
