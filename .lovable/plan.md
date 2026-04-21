

## Bugfix: Schwarze Szenen statt KI-Bilder + fehlender Übersetzungs-Key

### Problem 1: Bilder werden generiert, aber nicht angezeigt

Die Edge-Function `generate-composer-image-scene` läuft erfolgreich (200, ~14-19s) und schreibt das Bild korrekt in die DB:

```ts
.update({
  clip_url: publicUrl,        // ← Bild-URL landet hier
  clip_status: 'ready',
  upload_type: 'image',       // ← korrekt gesetzt
})
```

Aber der Player `ComposerSequencePreview.tsx` zeigt nur dann ein Bild an, wenn die URL in `uploadUrl` steht:

```ts
// Zeile 57-63: Filter
const playable = scenes.filter(
  s => s.clipUrl || (s.uploadType === 'image' && s.uploadUrl),
);

// Zeile 130: Welche URL wird angezeigt?
const isImage = currentScene?.uploadType === 'image';
const mediaUrl = isImage ? currentScene?.uploadUrl : currentScene?.clipUrl;
//                          ^^^^^^^^^^^^^^^^^^^^^^^ 
// Bei AI-Image ist uploadUrl undefined → mediaUrl = undefined
//                          → <img src={undefined}> → schwarz
```

Bei AI-generierten Bildern ist `uploadType = 'image'` UND `clipUrl` gesetzt, aber `uploadUrl` bleibt leer (es war ja kein User-Upload). Die Bedingung `isImage ? uploadUrl : clipUrl` greift dann auf `undefined` zu → schwarz.

### Fix 1: Player liest IMMER aus `clipUrl` für AI-Image-Szenen

**Datei:** `src/components/video-composer/ComposerSequencePreview.tsx`

Eine Zeile ändern (Zeile 130):
```ts
// Vorher
const mediaUrl = isImage ? currentScene?.uploadUrl : currentScene?.clipUrl;
// Nachher — clipUrl als primäre Quelle, uploadUrl nur als Fallback für reine Uploads
const mediaUrl = isImage 
  ? (currentScene?.clipUrl || currentScene?.uploadUrl) 
  : currentScene?.clipUrl;
```

Und für Konsistenz im `playable`-Filter (Zeile 57-63): bereits `s.clipUrl` ist Teil der Bedingung, daher passt das schon — die Szene erscheint im Player, nur die `<img>` zeigt das Falsche an.

### Problem 2: Roher i18n-Key sichtbar (`videoComposer.sceneOf`)

Im Screenshot steht oben links `videoComposer.sceneOf` als Klartext. Der Key existiert in keiner der 3 Sprachen in `src/lib/translations.ts` (EN/DE/ES).

### Fix 2: Übersetzungs-Key in allen 3 Sprachen ergänzen

**Datei:** `src/lib/translations.ts`

In allen 3 Sprachblöcken (EN/DE/ES) im `videoComposer.*`-Bereich neben den existierenden Composer-Keys (z. B. neben `subtitlesShortLabel`):

```ts
// EN
sceneOf: "Scene {current} of {total}",
// DE
sceneOf: "Szene {current} von {total}",
// ES
sceneOf: "Escena {current} de {total}",
```

Der `useTranslation`-Hook unterstützt bereits Variablen-Interpolation (wie in anderen Keys mit `{count}` etc. zu sehen).

### Verifikation

1. Briefing → „KI Bild-Szenen" wählen → Storyboard generieren
2. Clips-Tab → „Clips generieren" → 3 erfolgreiche `generate-composer-image-scene`-Calls (bereits in den Edge-Logs sichtbar ✓)
3. Vorschau → Bilder werden angezeigt (statt Schwarz)
4. Oben links steht z. B. „Szene 2 von 3" statt `videoComposer.sceneOf`

### Risiko

Sehr niedrig. Beide sind reine UI-Korrekturen. Bestehende Upload-Bilder funktionieren weiterhin (Fallback-Kette `clipUrl || uploadUrl`).

### Aufwand

~3 Minuten — eine Zeile im Player + 3 Übersetzungs-Keys.

