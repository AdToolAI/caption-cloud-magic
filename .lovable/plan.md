## Problem

Das `SceneDialogStudio` ist aktuell **gar nicht sichtbar**, weil:
- Es nur ab `sceneCast.length >= 2` rendert (Hard-Gate `if (sceneCast.length < 2) return null;`).
- Selbst wenn 2 Cast da sind, sitzt es tief unter Cast-Hinweis, Anker-Badge und Prompt → der User findet es nicht.

Der User will:
1. **Schon ab 1 Charakter** verfügbar (Monolog → Charakter spricht zur Kamera).
2. Einen klar sichtbaren **Button „Skript schreiben"** in der Cast-Zeile, der das Studio öffnet.

## Lösung

### 1. Trigger-Button in der Cast-Zeile (`SceneCard.tsx`)

Direkt neben „Charakter hinzufügen" platzieren, sichtbar wenn `sceneCast.length >= 1`:

- `<Button variant="secondary" size="sm">` mit Icon `MessageSquareQuote` + Label:
  - DE: „Skript schreiben" / EN: „Write script" / ES: „Escribir guion"
- Mini-Badge wenn `scene.dialogScript?.trim()` schon Inhalt hat (z. B. „· 2 Zeilen").
- Klick → toggelt lokalen State `dialogStudioOpen` und scrollt per `ref.scrollIntoView({ behavior: 'smooth', block: 'center' })` zum Studio-Bereich.

State:
```ts
const [dialogStudioOpen, setDialogStudioOpen] = useState(
  Boolean(scene.dialogScript?.trim()) // bestehende Skripte: initial offen
);
```

### 2. Studio öffnet/schließt sich (`SceneDialogStudio.tsx`)

- Neue optionale Props: `open?: boolean`, `onClose?: () => void`, plus `forwardRef` auf den Card-Container.
- Bisheriges Hard-Gate ersetzen:
  - Vorher: `if (sceneCast.length < 2) return null;`
  - Nachher: `if (sceneCast.length < 1) return null;` **und** `if (open === false) return null;`
- Im Card-Header neuer X-Button → ruft `onClose` auf.

### 3. Monolog-Modus (1 Sprecher)

Texte/Verhalten anpassen, wenn `sceneCast.length === 1`:

- Untertitel-Text:
  - DE: „Monolog — Charakter spricht zur Kamera. Läuft als Voiceover in dieser Szene."
  - EN: „Monologue — character speaks to camera. Plays as voiceover in this scene."
  - ES: „Monólogo — el personaje habla a cámara. Suena como voz en off en esta escena."
- Skript-Placeholder verkürzen auf eine Zeile: `"Sarah: Hi, willkommen!"`.
- Shot-Reverse-Shot-Toggle bei 1 Cast **ausblenden** (kein Reverse-Shot ohne 2. Sprecher).
- Generate-Button-Label bleibt „Voiceover generieren".

### 4. Edge Function `generate-scene-dialog`

Aktuelles Gate `cast.length < 2 → 400` lockern auf `< 1`. Prompt anpassen:

- Wenn nur 1 Cast: System-Prompt erzeugt **1–2 Blöcke** mit demselben Sprechernamen (Monolog), keine Dialogwechsel.
- Wort-Budget bleibt `~ durationSeconds * 2.5`.

## Out of Scope

- Keine Änderungen an `handleGenerateInline` / `handleGenerate` (TTS-Pfad funktioniert für 1 Sprecher genauso).
- Keine Änderung an Anchor-Compose, Frame-First, Render-Pipeline.
- Keine DB-Migration.

## Dateien

- `src/components/video-composer/SceneCard.tsx` — neuer Button + State + Scroll-Ref + Übergabe `open`/`onClose` an Studio.
- `src/components/video-composer/SceneDialogStudio.tsx` — `open`/`onClose` Props, ForwardRef, Cast≥1, Monolog-Texte, Toggle bedingt ausblenden, Header-Close-X.
- `supabase/functions/generate-scene-dialog/index.ts` — Gate auf `< 1`, Monolog-Prompt-Variante.

## Verifikation

- Szene mit **1 Charakter**: Button „Skript schreiben" sichtbar in Cast-Zeile → Klick öffnet Studio mit Monolog-Hinweis, scrollt sanft hin. „KI-Skript" generiert 1–2 Sätze derselben Person, „Voiceover generieren" hängt VO an die Szene.
- Szene mit **2+ Charakteren**: Wie oben, plus Shot-Reverse-Shot-Toggle sichtbar.
- Szene mit **0 Charakteren**: Kein Button, kein Studio.
- Szene mit bereits gespeichertem `dialogScript` → Studio initial offen.
