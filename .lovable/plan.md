# Lip-Sync-Reparatur: Provider-Passthrough darf nie wieder als fertig gelten

## Belegter Befund am letzten Run

- Szene `c934a823…` hat vier korrekt gerenderte **720×720** Einzelsprecher-Preclips; der zuvor vermutete 1284×718-Renderfehler liegt in den tatsächlichen Dateien nicht vor.
- Alle vier Sync.so-Ausgaben sind ebenfalls 720×720, haben die korrekte Dauer und wurden gespeichert.
- Der direkte Input/Output-Vergleich zeigt jedoch nur minimale Änderungen (durchschnittlicher PSNR ca. **43–50 dB**). Das ist konsistent mit Re-Encoding bzw. nahezu unverändertem Video, nicht mit belastbarer neuer Mundanimation.
- Die vier Face-Selection-Dateien enthalten jeweils durchgehende Bounding Boxes; der Anbieter wurde also auf einen Gesichtsbereich angesetzt.
- Der Webhook prüft Multi-Speaker-Ausgaben aktuell nur auf identische Datei-Metadaten oder falsche Auflösung. Die aussagekräftigere Re-Encoding-Heuristik ist für Multi-Speaker ausdrücklich deaktiviert. Deshalb werden nahezu unveränderte Outputs als `done` markiert und anschließend in den finalen Clip gemuxt.

## Umsetzung

1. **Mundbewegung statt Dateigröße messen**
   - Einen gemeinsamen, deterministischen Qualitätsprüfer für Provider-Input und Provider-Output einführen.
   - Mehrere zeitlich verteilte Frames aus beiden Clips vergleichen und ausschließlich die aus der Face-BBox abgeleitete Mundregion bewerten.
   - Re-Encoding, globale Kamerabewegung und Änderungen außerhalb des Mundes dürfen nicht als erfolgreiches Lip-Sync zählen.

2. **Webhook fail-closed machen**
   - Nach jedem `COMPLETED`-Webhook zuerst den Mundbewegungsnachweis ausführen.
   - Nur `motion_confirmed` darf den Pass auf `done` setzen.
   - `static`, praktisch unverändert oder nicht prüfbar wird als `provider_passthrough` beendet; kein automatischer NOOP-Retry und kein Mux eines ungeprüften Outputs.
   - Den Grund, Messwerte und geprüften Framebereich pro Pass in der bestehenden Dispatch-Telemetrie speichern.

3. **Erfolgspfad und Rückerstattung vereinheitlichen**
   - Alle vier Passes müssen erfolgreich verifiziert sein, bevor `render-sync-segments-audio-mux` startet.
   - Bei einem fehlgeschlagenen Pass die Szene verständlich als fehlgeschlagen markieren und den bestehenden idempotenten Refund-Pfad verwenden.
   - Bestehende ältere Statusfelder synchron halten, ohne eine neue State Machine oder weitere Retry-Ladder einzuführen.

4. **Finalen Stitch zusätzlich absichern**
   - Nach dem Mux die jeweiligen Sprecher-Zeitfenster im finalen Vollbild erneut gegen die Master-Plate prüfen.
   - Nur wenn die verifizierte Änderung in der zurückprojizierten Mundregion sichtbar bleibt, darf die Szene `ready` werden.
   - So wird zusätzlich verhindert, dass eine falsche Maske oder Rückprojektion vorhandene Provider-Bewegung wieder verdeckt.

5. **Gezielte Regressionstests**
   - Positivtest: echte Mundbewegung wird akzeptiert.
   - Negativtest: identische Datei, neu encodierter Passthrough, Bewegung nur außerhalb des Mundes und nicht verfügbare Frames werden abgewiesen.
   - Stitch-Test: nachgewiesene Bewegung muss im finalen Sprecherfenster erhalten bleiben.
   - Kontrolllauf mit einer frischen Vier-Sprecher-Szene; Freigabe erst, wenn jeder Sprecher nur in seinem Dialogfenster sichtbar den Mund bewegt.

## Technische Leitplanken

- Keine weitere Änderung an Crop-Größe, Face-Mapping oder Juli-Bildpfad ohne neuen Beleg; diese Teile waren im untersuchten Run korrekt verdrahtet.
- Keine Byte-Ratio als Qualitätsentscheidung und keine allgemeine Ganzbild-Bewegungsmessung.
- Kein automatischer NOOP-Retry; ein nachgewiesener Passthrough ist terminal und erstattungsfähig.
- Bestehende AWS/Remotion-Frame-Infrastruktur verwenden; keinen zusätzlichen externen Analyseanbieter einführen.