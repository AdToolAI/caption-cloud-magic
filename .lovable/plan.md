## Befund des aktuellen Laufs

Der Fehler besteht noch, aber **nicht mehr als Slot-/Fan-out-/502-Fehler**:

- Alle vier Pässe wurden erstellt und an Sync.so gesendet.
- Sync.so meldete Pass 2 (Sarah) als `COMPLETED` ohne Providerfehler.
- Die Pixelprüfung verglich Provider-Ausgabe und Eingangs-Preclip und bewertete sie als praktisch identisch (`max=1.1974`, `median=1.1633`) – deshalb wurde die Szene korrekt vor dem Mux gestoppt.
- Direkt davor meldete der Preflight jedoch `probe_unavailable` und ließ den Pass **ungeprüft** weiterlaufen. Obwohl `requireMouth=true` vorgesehen ist, wird diese Bedingung bei fehlendem Prüf-Frame derzeit umgangen.
- Zusätzlich ist der gespeicherte Zustand widersprüchlich: `pipeline_state=failed`, aber `dialog_shots.status=rendering`. Das erklärt die irreführende UI.

## Umsetzung

### 1. Exakten Provider-Input verbindlich prüfen
- Für jeden Preclip vor dem Sync.so-Aufruf einen AWS-Still direkt aus **dem tatsächlich versendeten Preclip** erzeugen.
- Darauf Gesicht und Mund prüfen; keine Plate-, Cache- oder Koordinaten-Ersatzprüfung verwenden.
- Bei `requireMouth=true` darf `probe_unavailable`, `mouth_missing` oder `mouth_at_edge` nicht mehr ungeprüft zu Sync.so gelangen.
- Messdaten (`mouth_rect_norm`, Kontrollfenster, Frame-Dimensionen) am Pass persistieren.

### 2. Geometrie sauber aus einer Quelle ableiten
- Preclip-Crop, ASD-Bounding-Boxes und spätere Bewegungsprüfung erhalten dieselbe Clip-space-Geometrie.
- Wenn echte Mund-Landmarks fehlen, darf die vorhandene Bbox-Unterdrittel-Ableitung nur als markierter Fallback dienen; sie muss dennoch auf dem gerenderten Preclip-Still validiert werden.
- Die Bewegungsprüfung verwendet immer das persistierte Mundfenster statt des generischen Standardbereichs.

### 3. Provider-Passthrough eindeutig behandeln
- Den vorhandenen Input-vs.-Output-Vergleich beibehalten; er hat in diesem Lauf einen echten unveränderten Provider-Output erkannt.
- Nur mit vollständig validiertem Mundfenster darf ein Passthrough terminal werden.
- Fehlt die Messgrundlage, lautet das Urteil `unknown` statt `passthrough`; es darf weder ein falscher Providerfehler noch ein fertiger, statischer Clip entstehen.
- Kein blindes NOOP-Retry-Karussell wieder einführen.

### 4. Terminalzustand atomar konsistent machen
- Beim Fehlschlag gemeinsam setzen: `pipeline_state=failed`, `dialog_shots.status=failed`, betroffener Pass `failed`, aktive Job-/Slot-Referenzen freigeben.
- UI-Fortschritt ausschließlich aus diesem konsistenten Terminalzustand ableiten, sodass kein Ladebalken oder „Lip-Sync läuft“ nach einem Fehler stehen bleibt.

### 5. Regressionstests und Live-Verifikation
- Tests für: Preclip ohne Prüf-Frame darf nicht dispatchen; Mund fehlt/am Rand; korrektes Mundfenster wird bis zum Webhook weitergereicht; `unknown` ist nicht terminaler Passthrough; Fehlerzustände bleiben synchron.
- Betroffene Funktionen deployen und einen frischen Vier-Sprecher-Lauf prüfen.
- Erfolgskriterium: vier validierte Provider-Inputs, vier eindeutige Pass-Verläufe und entweder sauberer Mux oder ein früher, konkreter Preflight-Fehler – niemals ungeprüfter Dispatch oder widersprüchlicher Ladezustand.