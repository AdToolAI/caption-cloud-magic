

## Fix: Prompt-Optimierung für Kling 3.0 Studio

### Problem
Der Prompt wurde auf Deutsch und ohne Bewegungsbeschreibung gesendet: *"Erstelle mir bitte ein Werbevideo zu AdTool AI"*. Kling interpretiert das wörtlich — Bild wird leicht verzerrt, keine echte Animation.

### Lösung: Automatische Prompt-Optimierung + Tipps

**1. Prompt-Optimizer im Kling Studio integrieren**
- Den bestehenden `VideoPromptOptimizer` (bereits für Sora 2 vorhanden) auch im Kling Studio verfügbar machen
- Button "✨ Prompt optimieren" neben dem Prompt-Feld
- Übersetzt automatisch ins Englische und fügt Kamerabewegungen, Beleuchtung etc. hinzu

**2. Automatische Prompt-Verbesserung in der Edge Function**
- `generate-kling-video/index.ts`: Wenn der Prompt deutsch ist oder keine Bewegungsbeschreibung enthält, automatisch über Lovable AI optimieren (ähnlich wie `optimize-video-prompt`)
- Alternativ: Einfacher Fallback mit englischem Prefix wie `"Cinematic smooth camera movement: "` + übersetzter Prompt

**3. Prompt-Hinweise im UI**
- Placeholder-Text mit Beispiel-Prompt auf Englisch
- Hinweis-Box: "Tipps: Schreibe auf Englisch, beschreibe Kamerabewegungen (zoom, pan, dolly), vermeide abstrakte Anweisungen"

### Dateien
- `src/pages/KlingVideoStudio.tsx` — VideoPromptOptimizer-Button + Prompt-Tipps hinzufügen
- `supabase/functions/generate-kling-video/index.ts` — Optional: automatische Prompt-Verbesserung vor Replicate-Aufruf

### Empfohlener Ansatz
Einfachste und effektivste Lösung: Den bestehenden `VideoPromptOptimizer`-Dialog (nutzt bereits Lovable AI) im Kling Studio einbinden + bessere Placeholder-Texte. Keine neue Edge Function nötig.

