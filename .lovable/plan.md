## Problem

Im Universal Content Creator zeigt der Voiceover-Schritt nach einem Wechsel vorwärts/zurück immer „Aria", egal welche Stimme gewählt wurde. Das Audio bleibt korrekt — nur die Anzeige ist falsch.

## Ursache (verifiziert)

In `src/components/universal-creator/steps/ContentVoiceStep.tsx` (Zeilen 63–70) wird die Stimmen-Auswahl in lokalem State gehalten und fest mit Aria (`9BWtsMINqrJLrRacOk9x`) initialisiert. Beim Schritt-Wechsel wird die Komponente unmountet; beim Zurückkehren startet der State wieder mit dem Default. Die tatsächlich verwendete Stimme liegt persistiert in `value.voiceoverConfig`, wird aber beim Mount nie ausgelesen.

## Fix (rein UI/State)

1. **Initialisierung aus dem Projekt-State**: `useState` für `voiceConfig` mit einem Lazy-Initializer versehen, der `value?.voiceoverConfig` bevorzugt und nur im Fallback den Aria-Default nutzt.
2. **Re-Hydration bei später eintreffenden Daten**: Ein `useEffect`, das den lokalen `voiceConfig` einmalig aktualisiert, sobald `value.voiceoverConfig` verfügbar wird und sich die `voiceId` vom lokalen State unterscheidet (z. B. wenn der Projekt-Draft asynchron nachlädt). Kein Überschreiben, nachdem der Nutzer manuell umgestellt hat.
3. **Namens-Auflösung absichern**: Falls `voiceoverConfig.voiceName` leer ist, den Namen nach dem Laden der Voice-Liste (`voices` / `customVoices`) über die `voiceId` nachschlagen, damit in der Zusammenfassung (Zeile 373) nicht „Voice" oder ein falscher Name steht.

## Nicht betroffen

Generierungs-Logik, Edge Functions, Persistenz und Export bleiben unverändert.
