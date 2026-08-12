# Seedance 2.5 für einen echten Lip-Sync-Testlauf beibehalten

## Problem

Seedance 2.5 lässt sich im Picker auswählen, wird aber beim Start des Dialog-Renderings wieder durch HappyHorse ersetzt. Dadurch kann der gewünschte Seedance-Testlauf nicht stattfinden.

Die verbleibende Ursache ist im Code bestätigt: `SceneDialogStudio.tsx` besitzt beim Renderstart eine eigene veraltete Provider-Liste ohne `ai-seedance25`. Deshalb setzt Zeile 1674–1677 die Auswahl auf `ai-happyhorse` zurück und schreibt HappyHorse anschließend sowohl in den lokalen Szenenstatus als auch in den Dispatch-Payload. Der Picker und das Backend kennen Seedance 2.5 bereits korrekt; die frühere Flag-Race-Condition in `SceneCard` ist ebenfalls schon abgesichert.

## Änderungen

1. `src/components/video-composer/SceneDialogStudio.tsx`
   - `ai-seedance25` in die dortige Render-Allowlist aufnehmen, damit die explizite Nutzerauswahl nicht mehr auf HappyHorse fällt.
   - Seedance-2.5-Dauer im bestehenden Duration-Zweig korrekt auf 4–30 Sekunden begrenzen.
   - Anzeigenamen "Seedance 2.5" in die lokale Provider-Beschriftung aufnehmen.
   - Der tatsächlich gewählte Provider wird unverändert an `startSceneGeneration` und damit an `compose-video-clips` übergeben.

2. `src/config/lipsyncProviderSafety.ts`
   - Nur das fehlende Anzeigenamen-Mapping `ai-seedance25` → "Seedance 2.5" ergänzen, damit die bestehende Testwarnung keinen technischen Rohwert zeigt.
   - Seedance 2.5 **nicht** als sicher einstufen: Die rote Risiko-Warnung und die bewusste Zustimmung bleiben bestehen, bis der Testlauf die Multi-Speaker-Qualität tatsächlich bestätigt.

3. Regressionstest
   - Absichern, dass eine Seedance-2.5-Dialogszene beim Renderstart `ai-seedance25` und die gewählte Dauer behält.
   - Absichern, dass ein wirklich nicht erlaubter Provider weiterhin auf HappyHorse fällt bzw. abgewiesen wird.

## Nicht Teil dieser Änderung

- Keine Änderung an Gates, Face-Mapping, Preclip, Sync.so, Provider-Payload oder Zustandsmaschine der eingefrorenen Lip-Sync-Kette.
- Keine Änderung an Kosten, Rollout-Flag oder Refund-Regeln.
- Die bestehende Risiko-Warnung bleibt für Seedance 2.5 und andere experimentelle Provider aktiv.

## Verifikation

Eine Szene mit mehreren Sprechern auf Seedance 2.5 und bis zu 30 Sekunden stellen, Renderdialog öffnen, Risiko bewusst bestätigen und starten. Danach prüfen: UI und persistierte Szene bleiben auf Seedance 2.5; der Dispatch läuft mit `clipSource = ai-seedance25` statt HappyHorse. Anschließend wird das erzeugte Ergebnis auf Ghost-Mouthing, Gesichtsverzerrung, Sprecher-Zuordnung und Mundbewegungen der Nicht-Sprecher beurteilt.
