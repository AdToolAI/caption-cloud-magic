## Ehrliche Antwort: Nein

Das Entfernen des NOOP-Retrys behebt **nicht** das Kernproblem. Es beseitigt nur die Schleife und den unnötigen Credit-Verbrauch.

Das Kernproblem laut Messung von heute 15:18–15:20 UTC: Sync.so gibt bei mehreren Passes das Eingangsvideo im Mundbereich **unverändert** zurück (Input-vs-Output-Abstand 1.18 / 2.26 / 2.64 bei Schwelle 3.0). Bei Pass 0 und Pass 2 funktioniert es dagegen (5.81 bzw. echte Bewegung). Es liegt also nicht an unserem Messsystem, sondern daran, dass der Provider bei bestimmten Passes gar nichts animiert.

Auffällig an den fehlschlagenden Passes (Beispiel Pass 2 / Matthew): Das Gesicht ist auf der Platte nur **116 px** groß und wird auf 720 px hochskaliert; es existiert **kein echter Mund-Landmark**, die Box ist aus dem Gesichtsrahmen abgeleitet; das Audiofenster ist mit **1.3 s** sehr kurz. Genau diese Kombination erzeugt die Passthroughs.

## Plan

**Schritt 1 — Ursache belegen (vor jedem weiteren Umbau)**
- Für alle Passes der Szene gegenüberstellen: Gesichtsgröße auf der Platte, Upscale-Faktor, Landmark-Quelle, Audiolänge, Provider-Antwort, Input-vs-Output-Wert.
- Erwartetes Ergebnis: eine klare Schwelle, unterhalb derer Sync.so nie animiert. Ohne diesen Beleg keine Änderung an der Dispatch-Logik.

**Schritt 2 — Vorab-Prüfung statt Nachträglich-Reparatur**
- Passes, die unter der belegten Schwelle liegen, gar nicht erst dispatchen.
- Stattdessen: Platte mit größeren Gesichtern neu anfordern, bevor Credits ausgegeben werden.

**Schritt 3 — Retry ersetzen**
- Die aktuelle Ladder (`coords-pro-box`) entfernen: Sie ändert nur die Boxform und liefert nachweislich dasselbe Passthrough.
- Ein Retry erfolgt nur noch, wenn die Eingangsbedingung tatsächlich verbessert wurde (größerer Ausschnitt, längeres Audiofenster) — sonst sofortiger, sauberer Abbruch mit Slot-Freigabe und einmaliger Rückerstattung.

**Schritt 4 — Klarheit für dich**
- Meldung im Composer trennt künftig eindeutig: „Provider hat nicht animiert" gegen „Messung nicht möglich".
- Log-Text korrigieren: aktuell steht fälschlich „MOUTH STATIC (score 16 < 1.6)", obwohl es ein Passthrough bei hohem Score ist.

**Schritt 5 — Prüfen**
- Neue Testszene mit vier Sprechern rendern und für jeden Pass den Bewegungsbefund dokumentieren.
- Erfolgskriterium: vier Mal „bewegt" oder ein begründeter Vorab-Abbruch — kein einziger stiller Passthrough und kein Retry-Karussell.