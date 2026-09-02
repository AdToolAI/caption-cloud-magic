# V545 — Lip-Sync sicher stoppen und den echten Preclip-NOOP isolieren

## Bestätigter Befund

Der kontrollierte V544-Lauf ist Szene `d63263dc…`, Generation 2, Run `37bd96bf…` mit vier Turns und zwei Sprechern.

- Alle vier Dispatches liefen tatsächlich über den neuen autoritativen Pfad: `v544-v400-preclip-authority`, `dispatch_video_kind=preclip`, `input_space=clip`, `preclip_used=true`, 30 fps und exakte Framezahlen 53/49/41/38.
- Tight-Audio und Preclip-Dauer stimmen pro Turn überein; alle vier Face-Gates bestanden. Identität, Sprecherbindung, Zeitbasis und Mux-Crops sind vollständig vorhanden.
- Sync.so meldete alle vier Jobs technisch erfolgreich, aber die serverseitige Messung ergab bei **jedem Pass NOOP**: `mouth_over_frame` 1,81 / 1,95 / 0,96 / 0,96, jeweils unter der NOOP-Grenze 2,0.
- Weil die Messregion aus `face_ratio` statt aus einem beobachteten Landmark stammt, stuft V500 diese echten NOOP-Befunde als `motion_unverified` ein. Der Webhook schreibt trotzdem `ssw:success`; V541 markiert nur Telemetrie.
- Der Mux akzeptiert jeden Pass mit `status=done` und `output_url`, ohne den Bewegungsnachweis zu prüfen. Deshalb wurde die Szene als `done` ausgeliefert, obwohl kein Pass nachweisbare Mundbewegung enthält.

Damit ist das vereinbarte STOP-Kriterium aus V544 erfüllt. Es erfolgt kein weiterer kostenpflichtiger Testlauf.

## Umsetzung

1. **Lip-Sync vor weiteren Provider-Kosten stilllegen**
   - Das bestehende zentrale Lip-Sync-Feature-Flag deaktivieren.
   - Bereits erzeugte Medien und normale Video-/Voiceover-Erstellung bleiben unangetastet.
   - Neue Lip-Sync-Anfragen werden vor Preclip- und Provider-Dispatch verständlich abgewiesen; es entstehen keine Sync.so-Kosten.

2. **Falschen Erfolg technisch schließen**
   - `motion_unverified`/`v541_needs_review` darf nicht mehr in einen auslieferbaren `done`-Pass und nicht mehr in den Mux eingehen.
   - Der Mux verlangt für jeden aktiven Pass einen persistierten, positiven Bewegungsnachweis; ein technisch erfolgreiches Provider-Ergebnis allein reicht nicht.
   - Bestehende Run-/Generation-Fences, Identity-Locks, Ledger-Idempotenz und Credit-Refunds bleiben unverändert.

3. **Ursache ohne Provider-Call isolieren**
   - Die vier bereits gepinnten Preclip-/Audio-/BBox-/Provider-Output-Artefakte des V544-Laufs offline vergleichen.
   - Pro Pass prüfen: Mund liegt innerhalb der gesendeten Crop-local Box; Eingangs- und Ausgangsframes zeigen dieselbe Identität; Audio enthält im 0-basierten Preclip-Fenster Sprache; Provider-Output unterscheidet sich im tatsächlichen Mund-ROI vom Preclip.
   - Ergebnis als eindeutige Kategorie dokumentieren: Provider-Passthrough, falsche ASD-Box, falsche Audio-Zeitlage oder Mess-ROI-Fehler. Keine Schwellenänderung und kein neuer Provider-Versuch in diesem Gate.

4. **Regressionen**
   - Vier `noop`/`motion_unverified`-Pässe können keine Szene mehr als erfolgreich abschließen.
   - Der Mux verweigert unbewiesene Outputs.
   - Feature-Off garantiert null Provider-Calls und keine Belastung; bestehende Refund-Idempotenz bleibt grün.
   - Ein nachweislich `motion_verified`-Pass bleibt vertraglich mux-fähig, damit eine spätere kontrollierte Wiederfreigabe möglich ist.

## Abschluss

Dieses Gate endet mit deaktiviertem Lip-Sync, geschlossenem False-Success-Pfad und einem artefaktbasierten RCA-Bericht. Eine Wiederfreigabe oder ein weiterer Sync.so-Call ist ausdrücklich nicht Teil dieses Gates.
