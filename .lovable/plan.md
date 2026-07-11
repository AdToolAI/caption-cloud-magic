## Ziel
Voice-Auto-Binding aus der Briefing-Analyse komplett entfernen. Die KI liefert nur noch **Sprecher-Slots** (Anzahl + Charakter-IDs), die Stimme weist der User manuell im Storyboard/Dialog-Studio zu. Damit verschwindet der wiederkehrende Fehler „Lip-Sync-Szene(n) ohne Voice-ID" beim Plan-Apply.

## Warum
- Auto-Voice-Resolution (voice_pool, Character-Default, Fallback-Chain) war die Hauptquelle für „Apply blockiert"-Toasts der letzten Runden.
- Sprecher-Erkennung (wer spricht welche Zeile) funktioniert stabil — nur die Voice-ID-Zuweisung ist fragil.
- User will lieber einmal manuell im Studio klicken als jedes Mal einen Fehler debuggen.

## Änderungen

### 1. Apply-Pfad entschärfen
`src/hooks/useApplyProductionPlan.ts`
- `dialogVoices` NICHT mehr aus Plan/Character-Defaults befüllen. Szene wird mit leerem `dialogVoices: {}` gespeichert.
- Warnung „X Lip-Sync-Szene(n) ohne Voice-ID" entfernen — kein Fehler-Toast mehr, stattdessen neutraler Hinweis „Stimmen im Studio zuweisen".
- Turns behalten `speakerCharacterId` (UUID) — Voice-Slot bleibt einfach `null`.

### 2. Plan-Sheet UI
`src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- Roten „Sprecher-Zuordnung fehlt"-Banner + Apply-Block entfernen.
- Manuelles Speaker-Mapping-UI (ScriptSpeakerMapper) bleibt für Charakter-Zuordnung, aber ohne Voice-Pflichtfeld.
- Footer-Meldung „1 Lip-Sync-Szene(n) ohne Voice-ID" → ersetzen durch „Stimmen weist du im Storyboard zu".

### 3. Storyboard/Studio: sichtbarer Voice-Slot je Sprecher
`src/components/video-composer/SceneDialogStudio.tsx` (bzw. bestehendes Dialog-Panel)
- Pro erkanntem Sprecher (aus `dialogTurns[].speakerCharacterId`) einen leeren Voice-Picker-Slot rendern.
- Wiederverwendung des bestehenden `AvatarVoicePicker` / `VoicePicker` — schreibt in `scene.dialogVoices[characterId]`.
- Leere Slots zeigen dezenten Hinweis „Stimme wählen" statt Fehler.

### 4. Render-Guard
`src/lib/video-composer/lipSyncIntent.ts` bleibt unverändert. Aber vor dem eigentlichen Lip-Sync-Render:
- Falls Szene Lip-Sync-Intent hat und Voice-Slots leer → freundlicher Toast beim Render-Klick („Bitte erst Stimmen im Dialog-Panel zuweisen"), kein Silent-Fail, kein Auto-Fallback auf Default-Voice.

### 5. Nicht angefasst
- Speaker-Detection, ensembleGuarantee, planCastDedup, dialogTurns-Reconstruction — alles bleibt.
- voice_pool im Server (`briefing-deep-parse`) darf weiter geliefert werden, wird aber vom Client ignoriert (keine Server-Änderung nötig, minimales Risiko).

## Ergebnis
- Plan-Apply schlägt nie mehr wegen Voice-ID fehl.
- User sieht im Studio pro Sprecher einen leeren Voice-Slot und wählt bewusst die Stimme.
- Weniger „magisch", dafür deterministisch und fehlerfrei.
