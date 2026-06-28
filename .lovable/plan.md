## Diagnose: Briefing → Storyboard Voice-Auto-Assignment

### Ergebnis der Prüfung anhand Screenshot + Codepfad

Der Briefing-Plan wurde **größtenteils ins Storyboard übertragen**:
- Es wurden 3 Szenen übernommen/verifiziert.
- Szene 1 enthält das deutsche Skript: `SAMUEL DUSATKO: Es ist 3 Uhr nachts...`
- Cast-Auflösung funktioniert sichtbar: Samuel Dusatko wird im Sprecherbereich erkannt.
- Dauer ist korrekt bei 5s sichtbar.

**Nicht korrekt ist die Voice-Zuordnung in der UI:** Im Storyboard steht weiterhin `Stimme wählen`.

### Wahrscheinliche technische Ursache

Es gibt zwei Schutzlücken im aktuellen Flow:

1. **Apply-Plan fallbackt nur auf Character-Default oder Projektvoice.**  
   In `src/hooks/useApplyProductionPlan.ts` wird `dialogVoices` aus `ps.cast[].voiceId`, `brand_characters.default_voice_id` oder `projectVoiceId` gebaut. Wenn Samuel keine `default_voice_id` hat und der Plan trotz Edge-Fallback keine Voice mitschickt, bleibt die Szene ohne gültige Voice.

2. **SceneDialogStudio bindet nur Brand-Defaults automatisch.**  
   In `src/components/video-composer/SceneDialogStudio.tsx` setzt der Auto-Bind nur `defaultVoiceByCharId`. Wenn ein Charakter keinen Brand-Default hat, zeigt die UI bewusst `SETUP` und lässt die Voice leer — selbst wenn wir eigentlich eine KI-Fallback-Stimme wollen.

### Schlanker Fix-Plan

#### 1) `useApplyProductionPlan.ts`: deterministische Auto-Voice als letzter Fallback

Direkt im Storyboard-Apply eine lokale Voice-Auswahl ergänzen, damit der Client unabhängig vom Edge-Function-Ergebnis robuste Voices schreibt:

- Voice-Katalog lokal spiegeln:
  - Male Pool: Brian, Liam, George, Charlie, Eric, Chris, Daniel, Bill, Roger
  - Female Pool: Sarah, Laura, Alice, Matilda, Lily
- `brand_characters` Query von `id, default_voice_id` auf `id, default_voice_id, gender` erweitern.
- Beim Aufbau von `dialogVoices`:
  1. `ps.cast[].voiceId`
  2. `default_voice_id`
  3. `projectVoiceId`
  4. **neu:** Auto-Pick aus Gender-Pool, pro Szene dedupliziert
- Als Objekt speichern statt plain string:
  ```ts
  dialogVoices[characterId] = {
    engine: 'elevenlabs',
    voiceId: pickedId,
    voiceName: voiceNameById[pickedId],
  };
  ```
- `characterVoiceId` ebenfalls aus dieser finalen Auswahl ableiten.

#### 2) `SceneDialogStudio.tsx`: UI-Fallback für vorhandene Root-Voice

Wenn `scene.dialogVoices` leer ist, aber `scene.characterVoiceId` vorhanden ist, soll die Sprecherzeile diese Stimme übernehmen. Das deckt Single-Speaker-Szenen ab.

#### 3) `VideoComposerDashboard.tsx`: Hydration ergänzen

Beim Laden aus `composer_scenes` zusätzlich `character_voice_id` in den lokalen Scene-State mappen:

```ts
characterVoiceId: row.character_voice_id ?? local?.characterVoiceId
```

Aktuell wird `character_voice_id` gespeichert, aber im gezeigten Hydration-Code nicht sichtbar zurück in `ComposerScene` gesetzt.

#### 4) Verifikation

- Neues Samuel-Briefing ohne Avatar-Default analysieren.
- Erwartung:
  - `dialog_script` gefüllt
  - `dialog_voices` enthält Samuels Character-ID mit z.B. Brian/Liam
  - `character_voice_id` ist gesetzt
  - UI zeigt nicht mehr `Stimme wählen`, sondern die gewählte ElevenLabs-Stimme
  - Multi-Speaker bis 4 Sprecher: unterschiedliche Voices innerhalb der Szene

### Nicht anfassen

- Keine Änderung an Lipsync/Sync.so/HappyHorse Pipeline
- Keine Persistierung in `brand_characters.default_voice_id`
- Keine neue Migration nötig