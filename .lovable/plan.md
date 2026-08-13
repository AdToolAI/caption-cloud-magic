# Schritt 3 abschließen: `compose-video-clips` live deployen

## Ziel
Die aktuelle `compose-video-clips`-Version einschließlich des neuen Backend-Spiegels `visual-source.ts` in Lovable Cloud veröffentlichen und den Live-Stand verifizieren. Keine weiteren Arbeiten an Schritt 4 oder an der Lip-Sync-Semantik.

## Festgestellter Stand
- Der Screenshot zeigt einen internen Fehler des Lovable-Agentenlaufs, keinen Fehler aus der App oder Function.
- Für `compose-video-clips` ist kein passender Laufzeit-Log zum fehlgeschlagenen Versuch vorhanden; ein tatsächlich gestartetes Deployment ist daher nicht belegt.
- Lovable Cloud ist erreichbar und gesund.
- `supabase/functions/_shared/visual-source.ts` ist vorhanden und wird sowohl vom Visual-Input-Spiegel als auch von `compose-video-clips` importiert.
- Es gibt keinen Deno-Lockfile im Function-Pfad, der diesen Deployment-Versuch blockieren würde.

## Ausführung
1. Ausschließlich `compose-video-clips` mit dem aktuellen lokalen Function-Bundle deployen.
2. Das Deployment-Ergebnis direkt prüfen.
3. Falls das Deployment scheitert, den exakten Bundler-/Deploymentfehler erfassen und nur die hierfür notwendige Korrektur planen; keine fachliche Semantik verändern.
4. Nach erfolgreichem Deployment die Function-Logs prüfen und bestätigen, dass die Live-Function den aktuellen Stand akzeptiert.

## Abnahme
- Deployment meldet Erfolg für `compose-video-clips`.
- Kein Import-/Bundlefehler für `_shared/visual-source.ts`.
- Keine Änderungen an Continuity Queue, Lip-Sync-Engine, State Machine, `reference_image_url` oder UI.
- Erst danach gilt Schritt 3 als vollständig abgeschlossen.