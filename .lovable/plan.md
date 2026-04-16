
## Plan — Mediathek-Save, Download im AssemblyTab, Prompt-Verbesserung, Text-Overlay & Subtitle-Hinweis

### 1. Auto-Save in Mediathek + Download-Button (AssemblyTab)
Der `remotion-webhook` legt für `source: 'composer'` aktuell **keinen** `video_creations`-Eintrag an (nur Composer-Status-Update). Fix:
- In `remotion-webhook/index.ts` direkt nach dem `composer_projects` Update auch in `video_creations` inserten (mit Idempotenz-Check über `output_url`), Metadaten:
  ```ts
  { source: 'composer', composer_project_id, render_id, scenes_count, total_duration }
  ```
- AssemblyTab: Download-Button bleibt, zusätzlich Toast „In Mediathek gespeichert" beim `completed`-Switch. Für ältere bereits-fertige Renders ohne Mediathek-Eintrag: einmaliger Backfill direkt nach Polling-Completion (Client-seitig per Edge-Call wäre overkill — wir lassen es aus, neuer Webhook-Pfad reicht).

### 2. Prompt-Qualität deutlich erhöhen (`compose-video-storyboard`)
Im `systemPrompt` schärfen:
- AI-Prompt-Länge erzwingen: **mind. 50 Wörter** mit Pflichtbestandteilen: **Subjekt + Aktion + Kameraperspektive + Objektivbrennweite + Lichtsetzung + Stimmung/Look + cinematischer Stil** (z. B. "shot on 35mm anamorphic, shallow depth of field, golden hour, slow dolly-in").
- Negative-Prompt-Hinweise: **„never use on-screen captions, watermarks, or text in the AI prompt"** → verhindert dass das KI-Video selbst Untertitel rendert (Pkt. 4).
- Pro Szenentyp Beispielstrukturen mitgeben (Hook = extreme close-up + macro, CTA = wide hero shot etc.).
- Tone (`briefing.tone`) explizit ins visual styling übersetzen ("luxury" → marble/gold/key light low; "energetic" → handheld + neon).

### 3. Text-Overlay Editor pro Szene (volle Kontrolle)
Aktuell hat `SceneCard` nur ein **einfaches Text-Input** ohne Position/Animation/Stil. Audio-Tab/Render-Pipeline unterstützt aber bereits `position`, `animation`, `fontSize`, `color`, `fontFamily`. Erweitern:
- In `SceneCard.tsx`: Collapsible „Text-Overlay" mit **Text-Input + Position-Select (top/center/bottom/…) + Animation-Select (fade/scale/slide/word-by-word/glow) + Farb-Picker + Schriftgröße-Slider**.
- Defaults aus `DEFAULT_TEXT_OVERLAY` bleiben.
- Render-Pipeline (`compose-video-assemble` → `ComposedAdVideo.tsx`) ist bereits darauf vorbereitet — keine Backend-Änderungen nötig.

### 4. Konflikt „eingebrannte KI-Untertitel + manuelle Untertitel"
KI-Modelle (Hailuo/Kling) rendern manchmal Text in das Video — wenn der User dann ein Text-Overlay drüberlegt, hat man Doppel-Text. Lösung in mehreren Ebenen:

**a) Prävention im Prompt** (siehe Pkt. 2): explizit `--no text, no captions, no subtitles, no watermarks` in `aiPrompt` einbauen (im Storyboard-LLM erzwingen + auch im Edge-Function `compose-video-clips` als Suffix anhängen, falls fehlt).

**b) UI-Hinweis im SceneCard**: kleines Info-Banner über Text-Overlay-Feld:
> ⚠️ "Falls die KI bereits Text rendert, kann es zu Doppel-Untertiteln kommen. Wir versuchen das im Prompt zu vermeiden."

**c) AudioTab voiceover-script generation**: bleibt wie aktuell (nutzt `textOverlay.text`) — keine Doppelung mit KI-rendered text dort.

### 5. Was unverändert bleibt
- DB-Schema, RLS, Pricing/Quality-Tier
- Polling/Render-Pipeline aus letzter Iteration
- BriefingTab, StoryboardTab, AudioTab UI

### Geänderte Dateien
- `supabase/functions/remotion-webhook/index.ts` — `video_creations` Insert für composer
- `supabase/functions/compose-video-storyboard/index.ts` — verschärfte System-Prompts + No-Text-Klausel
- `supabase/functions/compose-video-clips/index.ts` — Negative-Suffix `, no text, no captions, no subtitles, no watermarks` an `aiPrompt` anhängen falls fehlt
- `src/components/video-composer/SceneCard.tsx` — Text-Overlay-Editor (Position/Animation/Farbe/Größe) + Info-Banner
- `src/components/video-composer/AssemblyTab.tsx` — Toast "In Mediathek gespeichert" bei completion

### Verify
- Render fertig → erscheint sofort in `/mediathek`
- Download-Button im AssemblyTab funktioniert (bereits da)
- Neue Szenen-Prompts sind detailliert und enthalten Kamera/Licht/Stil
- KI-Videos rendern keinen Text mehr (durch Negative Prompt)
- SceneCard erlaubt Position/Animation/Farbe/Größe pro Text-Overlay
