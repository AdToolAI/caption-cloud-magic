## Ziel

Kling-Omni-UI im AI Video Studio umbauen — Layout wie Motion Studio (SceneDialogStudio): pro Sprecher eine eigene Zeile mit Portrait, Name, Voice-Preset und Dialog-Textfeld direkt darunter. Gleichzeitig verifizieren wir die End-to-End-Verdrahtung mit Charakteren für korrektes Native-Lip-Sync.

## Was heute existiert (Ist-Zustand)

- **UI (`ToolkitGenerator.tsx`, Zeilen 1131–1196):** Ein einzelnes globales Textfeld `omniDialogText` + ein globaler `omniVoicePreset`-Select. Amber-Warnung "max. 2 Sprecher". Keine Zuordnung Sprecher ↔ Zeile ↔ Voice.
- **Wiring Charakter → Bild:** Cast-Charaktere werden über `composedFirstFrame` als `startImageUrl` an `generate-kling-video` übergeben (i2v). Das funktioniert bereits korrekt.
- **Wiring Dialog:** Frontend sendet `dialogText` (single string) + `voicePreset` (single) + `nativeLipSync=true` + `spokenLanguage`. Backend (`generate-kling-video/index.ts`, Zeile 233–238) reicht sie als `dialog` / `voice` / `spoken_language` an `kwaivgi/kling-v3-omni-video` weiter.
- **Lücke:** Auch bei 2 Sprechern gibt es aktuell nur *einen* Dialog-Text und *eine* Voice — die Multi-Speaker-Fähigkeit von Omni wird nicht genutzt.

## Umbau — pro Sprecher ein Block

### 1. UI-Refactor `ToolkitGenerator.tsx`

Neuer State ersetzt `omniDialogText` / `omniVoicePreset`:

```ts
type OmniLine = { characterId: string; line: string; voicePreset: VoicePresetId };
const [omniLines, setOmniLines] = useState<OmniLine[]>([]);
```

- Automatisch aus `castCharacterIds` synchronisieren (max. 2 Einträge, Kling-Limit).
- Wenn kein Charakter gewählt → Fallback auf einen anonymen Sprecher-Block ("Speaker 1") mit Textfeld + Voice-Preset (bisheriges Verhalten für Text-only-Nutzer).

**Layout pro Zeile — analog Motion Studio:**

```text
┌──────────────────────────────────────────────────────────┐
│ [Portrait] Name       [Voice-Preset ▼]     0/300 Zeichen│
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Dialog-Text dieses Sprechers …                       │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- Portrait aus `libCharacters` (`reference_image_url`), Fallback Avatar-Initialen.
- Voice-Preset-Select unverändert (5 Presets).
- Textarea 300 Zeichen pro Sprecher (Gesamt-Cap 600 bleibt erhalten via Summenprüfung).
- Amber-Warnung: nur noch, wenn > 2 Charaktere → erste 2 werden übernommen.

### 2. Payload-Aufbau

`ToolkitGenerator.tsx`, Zeile 606–614 wird ersetzt durch:

```ts
if (isKlingOmni && omniLines.some(l => l.line.trim())) {
  const activeLines = omniLines.filter(l => l.line.trim()).slice(0, 2);
  // Screenplay-Format für Kling Omni (kompatibel mit bisherigem single-string Path).
  body.dialogText = activeLines
    .map(l => {
      const name = libCharacters.find(c => c.id === l.characterId)?.name ?? 'Speaker';
      return `${name}: ${l.line.trim()}`;
    })
    .join('\n');
  body.voicePreset = activeLines[0].voicePreset; // primary voice
  body.speakerVoices = activeLines.map(l => ({
    name: libCharacters.find(c => c.id === l.characterId)?.name ?? 'Speaker',
    voice: l.voicePreset,
  }));
  body.spokenLanguage = effectiveSpokenLang;
  body.nativeLipSync = true;
}
```

### 3. Backend-Ergänzung `supabase/functions/generate-kling-video/index.ts`

Bei Zeile 233–238: optional zusätzliches Feld `speaker_voices` an Replicate-Input hängen (Kling-v3-omni akzeptiert das Feld laut Doku für Multi-Speaker; wenn ignored → schadet nicht, single `voice` bleibt Fallback). Bestehender Single-Speaker-Pfad bleibt unverändert kompatibel.

```ts
if (Array.isArray((body as any).speakerVoices) && (body as any).speakerVoices.length > 1) {
  replicateInput.speaker_voices = (body as any).speakerVoices;
}
```

## Wiring-Verifikation (Character → Lip-Sync)

Wird als Teil des PRs geprüft, kein separater Code-Change:

1. `composedFirstFrame` enthält bei ausgewähltem Cast das Portrait → wird bei Omni als `start_image` gesendet (bereits vorhanden, Zeile 542–549).
2. `characterShots` werden weiterhin persistiert für Continuity (Zeile 423–459).
3. `body.spokenLanguage` wird gesetzt und ist DE/EN/ES-kompatibel (`ttsLangSupported`).
4. Console-Log-Check in `generate-kling-video` (Zeile 237, 254) zeigt `dialog`, `voice(s)`, `spoken_language`, `start_image` → Screenshot in Chat nach Test.

## Nicht im Scope

- Kein Umbau des Motion-Studio-`SceneDialogStudio` (dort bereits ausgereift, nur als visuelle Referenz).
- Keine Änderungen an Sync.so-Pipeline (Omni umgeht diese ohnehin).
- Kein Multi-Language-Mix pro Sprecher — eine Sprache für den ganzen Clip.

## Betroffene Dateien

- `src/components/ai-video/ToolkitGenerator.tsx` — UI-Block Zeile 1131–1196 + Payload Zeile 606–614 + neuer State.
- `supabase/functions/generate-kling-video/index.ts` — 1 zusätzlicher optionaler Field-Passthrough.

## Verifikation nach Umbau

1. Cast mit 2 Charakteren wählen → 2 Sprecher-Blöcke erscheinen mit Portrait + eigenem Dialog + Voice-Preset.
2. Ohne Cast → 1 anonymer Speaker-Block (Rückwärtskompatibilität).
3. Generieren → `generate-kling-video`-Logs prüfen (`dialog`, `start_image`, `speaker_voices` gesetzt).
4. Finaler Clip: Lip-Sync auf DE mit Charakter-Gesicht aus Cast & World.