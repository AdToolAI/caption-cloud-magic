## Befund

**Do I know what the issue is?** Ja.

Der erneute Failure war kein Frontend-Problem. Der konkrete Sync.so-Job für Szene `e5445b67…` wurde zweimal erfolgreich an Sync.so übergeben, kam aber beide Male nach wenigen Sekunden mit `FAILED: An unknown error occurred` zurück.

Der wichtigste Befund aus Logs + Frame-Inspektion:

- Unsere v46-Payload nutzt zwar die offizielle Segments-Struktur (`segments[]`, `audioInput.refId`, `optionsOverride.active_speaker_detection`, `lipsync-2-pro`, `sync_mode: cut_off`).
- Aber die ASD-Koordinaten kommen aus dem **Anchor/Identity-FaceMap** und werden nur geometrisch auf das Video skaliert.
- Im echten Video liegen diese Punkte sichtbar zu hoch bzw. nicht sauber auf den Gesichtern. Sync.so verlangt laut Speaker-Selection-Doku: `coordinates` müssen im selben Frame-Koordinatensystem auf dem Gesicht liegen.
- Wir haben den strikten Plate-Frame-Check für 3+ Sprecher bewusst übersprungen, sobald alle Identitäten im Anchor gematcht waren. Genau das ist hier falsch: Identity-Match ≠ plate-native Sync.so-Koordinaten.

Zusätzlich sind kleinere Fehler sichtbar:

- v46-Dispatch-Logs schreiben fälschlich `model: "sync-3"`, obwohl real `lipsync-2-pro` geschickt wird.
- v46 nutzt weiter alte `v41_*` Fehlernamen/Retry-Labels, was Diagnose erschwert.
- Der 3-Sprecher-Single-Call wird mit Sprecheranzahl multipliziert bepreist, obwohl es nur ein Sync.so-Call ist.
- Der Retry wiederholt denselben falschen Koordinaten-Payload, statt vorher plate-native Koordinaten zu reparieren.

## Plan

### 1. v47: Plate-native Face Targeting vor Sync.so-Dispatch

In `compose-dialog-segments` wird die 3+ Sprecher Segments-Route so geändert:

- Für jeden Sprecher/Turn den tatsächlichen Referenzframe aus dem Video nehmen.
- Auf diesem Frame die vorhandene `validate-frame-face`-Logik nutzen, um echte Gesichtsboxen im **Video-Koordinatensystem** zu bekommen.
- Gesichter links-nach-rechts sortieren und Speaker-Slot sauber auf Face-Box mappen.
- Sync.so-Koordinate nicht mehr aus Anchor-Scaling ableiten, sondern aus der echten Plate-Face-Box:
  - x = Box-Mitte
  - y = Mund-/untere Gesichtszone statt Stirn/Anchor-Zentrum
- Nur wenn genügend echte Gesichter gefunden werden, wird der offizielle Segments-Single-Call dispatched.
- Wenn nicht genügend Gesichter gefunden werden, wird **kein kaputter Sync.so-Call** gestartet; die Szene geht in einen klaren reparierbaren Zustand oder fällt auf die stabilere per-speaker Pipeline zurück.

### 2. Retry-Logik reparieren

Der Retry darf nicht denselben fehlerhaften Payload erneut senden.

- Bei Sync.so `unknown error` in v47 zuerst Koordinaten/Frame neu validieren.
- Retry nur mit reparierten plate-native Koordinaten.
- Maximal ein Provider-Retry bleibt bestehen, aber mit echter Payload-Änderung.
- Fehlertexte werden von `v41_FAILED` auf `v47_FAILED` aktualisiert.

### 3. Payload und Logging aufräumen

- Dispatch-Meta schreibt künftig `model: "lipsync-2-pro"`, nicht mehr `sync-3`.
- `webhook_url` wird entfernt; nur offizielles `webhookUrl` bleibt.
- Audio-Inputs bleiben mit `refId` offiziell kompatibel; `ref_id` kann optional defensiv bleiben oder entfernt werden.
- `auto_detect: false` wird nicht mehr mit `frame_number + coordinates` gemischt, wo die Doku die Varianten trennen will.

### 4. Kosten-/Refund-Bug korrigieren

- Für die v47 Single-Call Segments-Route wird nur `ceil(duration) × 9` berechnet.
- Die alte fan-out Route bleibt bei `speakerCount × ceil(duration) × 9`.
- Bereits fehlgeschlagene Jobs bleiben idempotent refundiert; keine Doppel-Rückerstattung.

### 5. Webhook akzeptiert v47

In `sync-so-webhook`:

- Versions-Gate um `47` erweitern.
- v47-Fehler sauber klassifizieren und loggen.
- Bestehende Refund- und Inflight-Cleanup-Pfade unverändert lassen.

### 6. Szene nach Deploy sauber zurücksetzen

Nach Deployment:

- Szene `e5445b67-c3c1-4d09-b7db-11187265586c` auf `pending` setzen.
- `dialog_shots`, `lip_sync_status`, `twoshot_stage`, `replicate_prediction_id`, `clip_error` bereinigen.
- Stale Sync.so Inflight-Jobs für diese Szene entfernen.

### 7. Validierung vor neuem Trigger

Vor dem nächsten echten Trigger prüfen:

- v47-Logs zeigen pro Sprecher echte plate-native Koordinaten, nicht Anchor-Skaling.
- Koordinaten liegen sichtbar auf den Gesichtern im extrahierten Frame.
- Dispatch-Log zeigt `model: lipsync-2-pro`, `segments=3`, `sync_mode=cut_off`, `version=47`.
- Bei Sync.so-Fehlern wird automatisch refundiert und kein Retry mit identischem Payload gemacht.

## Erwartetes Ergebnis

Der nächste Trigger sendet nicht mehr denselben formal richtigen, aber praktisch falschen ASD-Payload. Sync.so bekommt pro Segment einen Referenzframe und einen Punkt, der wirklich auf dem jeweiligen Gesicht im Video liegt.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>