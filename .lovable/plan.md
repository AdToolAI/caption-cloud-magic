

## Befund

Im Tab "Voiceover & Untertitel" gibt es aktuell:
- **Voiceover-Karte** mit Toggle (an/aus) ✓
- **Hintergrundmusik-Karte** mit Toggle ✓
- **Automatische Untertitel-Karte** mit Toggle ✓
- **Text-Overlays-Karte** — **kein Toggle**, immer aktiv

Das ist inkonsistent. Außerdem werden die Overlays auch dann im Preview-Player gerendert, wenn der Nutzer sie eigentlich aus hat (z.B. um schnell ohne Text zu prüfen, wie das Video wirkt).

## Plan

### 1. Datenmodell: `enabled`-Flag
`src/types/video-composer.ts` — `AssemblyConfig` um Feld erweitern:
```ts
textOverlaysEnabled?: boolean; // default: true wenn Overlays existieren
```
(Backwards-Compat: undefined = true, damit alte Drafts weiterhin funktionieren.)

### 2. UI: Toggle in der Text-Overlays-Karte
`VoiceSubtitlesTab.tsx` — den `<CardHeader>` der Text-Overlays-Karte um einen Switch ergänzen, **identisch im Stil** zu Voiceover/Music/Subtitles:
- Switch rechts oben in der Karte
- Wenn **aus**: Editor disabled (`opacity-50`, `pointer-events-none`) **und** ein dezenter Hinweis "Text-Overlays sind deaktiviert — aktiviere sie, um sie im Video anzuzeigen."
- Wenn **an**: normal nutzbar

### 3. Preview-Player: Overlays nur bei `enabled` rendern
`VoiceSubtitlesTab.tsx` Z. ~305 — Prop-Durchreichung anpassen:
```tsx
globalTextOverlays={
  assemblyConfig.textOverlaysEnabled === false 
    ? [] 
    : assemblyConfig.globalTextOverlays
}
```
So bleiben die Daten erhalten, werden aber nicht angezeigt.

### 4. Final-Render: Overlays respektieren das Flag
`supabase/functions/compose-video-assemble/index.ts` — beim Aufbau des Render-Payloads:
```ts
globalTextOverlays: body.assemblyConfig?.textOverlaysEnabled === false 
  ? [] 
  : (body.assemblyConfig?.globalTextOverlays ?? [])
```
Damit ist der finale MP4-Output deckungsgleich mit dem Preview.

### 5. Lokalisierung
`src/lib/translations.ts` — drei neue Keys (DE/EN/ES):
- `videoComposer.textOverlaysEnabled` — "Text-Overlays" (Switch-Label)
- `videoComposer.textOverlaysDisabledHint` — "Text-Overlays sind deaktiviert. Aktiviere sie, um sie im Video anzuzeigen."

## Geänderte Dateien
- `src/types/video-composer.ts` — neues Feld `textOverlaysEnabled`
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Switch in Karte, disabled-State, conditional Pass-Through an Preview
- `supabase/functions/compose-video-assemble/index.ts` — Flag im Render-Payload respektieren
- `src/lib/translations.ts` — neue Keys (DE/EN/ES)

## Verify
- Tab "Voiceover & Untertitel": Text-Overlays-Karte hat **rechts oben einen Switch** wie die anderen Karten
- Switch **aus** → Editor wird grau/inaktiv, Hinweistext erscheint, **keine Overlays** im Preview-Player oben
- Switch **an** → alles wie gewohnt nutzbar, Overlays sichtbar
- Bestehende Drafts ohne `textOverlaysEnabled`-Feld verhalten sich wie "an" (kein Datenverlust)
- Final-Render via Lambda enthält Overlays nur wenn der Switch beim Export an war

