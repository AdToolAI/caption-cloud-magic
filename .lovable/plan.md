# Video-Hochskalierung: hängt, dauert ewig, verschwindet beim Neuladen

## Befund (geprüft, nicht vermutet)

- Ein Auftrag steht aktuell seit **über 1,5 Stunden** auf „Datei wird gesichert" — mit **19 Sicherungsversuchen**, ohne Fehlermeldung. Der Kunde sieht endlos „läuft".
- Das Protokoll ist eindeutig: Der Hintergrundabgleich stürzt bei **jedem** Durchlauf mit **„Memory limit exceeded"** ab (zuletzt 17:50 und 17:55 Uhr). Er lädt die fertige Videodatei komplett in den Arbeitsspeicher, bevor er sie in unseren Speicher legt.
- Nicht die Hochskalierung dauert lange — der **Anbieter ist längst fertig**. Es scheitert das Ablegen der großen Datei bei uns, und das wiederholt sich alle 5 Minuten endlos.
- Zweiter, unabhängiger Punkt: Der laufende Auftrag lebt **nur im geöffneten Tab**. Nach dem Neuladen ist er weg, und im Verlauf taucht er nie auf — der Verlauf zeigt ausschließlich generierte Videos.
- Abgeschlossene Läufe brauchen im Schnitt rund 12 Minuten, die schnellen 2–5 Minuten. Die Ausreißer sind genau die hängenden Fälle.

## Grundsatz

Anbieter-Job, Speichern, Guthaben und Oberfläche sind **vier getrennte Zustände**. Ein Fehler beim Speichern darf nie so aussehen, als hätte die KI versagt. Und: Der Browser ist Beobachter, nicht Besitzer des Auftrags — Tab schließen, Gerät wechseln, morgen wiederkommen muss folgenlos sein.

## Was ich ändern möchte

1. **Speichern ohne Speicherüberlauf — wirklich durchgängig.** Die fertige Datei wird von Anfang bis Ende durchgereicht, nie komplett in den Arbeitsspeicher geladen. Das Entfernen der einen Pufferstelle reicht ausdrücklich nicht: Auch die Prüfung und der Upload dürfen intern nichts vollständig puffern. Nachgewiesen wird das an einem echten großen 4K-Ergebnis, mit Blick auf den Speicherverbrauch über den ganzen Transfer.
2. **Speicherfehler ist kein Anbieterfehler.** Ein erfolgreich erzeugtes Video, das wir nicht ablegen konnten, bekommt einen eigenen, klar benannten Zustand (Speichern fehlgeschlagen / Prüfung nötig) plus die Angabe, in welcher Stufe es scheiterte. Der Anbieterstatus bleibt getrennt davon „erfolgreich". Wichtig für Support, Erstattungen und Anbieterbewertung.
3. **Kein automatischer Sofort-Refund.** Solange die fertige Datei beim Anbieter noch erreichbar ist, wird sie gerettet: begrenzte Wiederholungen, danach Prüf-Status mit allen Angaben für einen letzten Rettungsversuch. Erst wenn das Ergebnis nachweislich nicht mehr lieferbar ist, greift die bestehende Erstattung — genau einmal.
4. **Begrenzte Wiederholungen mit wachsendem Abstand.** Sofort, +2, +5, +15, +30 Minuten, danach Prüf-Status. Letzter Fehler, Zeitpunkt und Versuchszahl werden gespeichert. Keine 5-Minuten-Endlosschleife mehr.
5. **Kein doppeltes Arbeiten.** Ein Auftrag wird vor dem Speichern exklusiv beansprucht (Sperre mit Ablaufzeit), damit zwei parallele Durchläufe nie dieselbe große Datei gleichzeitig holen. Pro Durchlauf höchstens **eine** schwere Sicherung; die Kostenprüfung bleibt unverändert. (Eine echte Warteschlange mit mehreren Arbeitern ist Phase 2, nicht jetzt.)
6. **Aufträge überleben Neuladen und Tabwechsel.** Beim Öffnen wird der jüngste noch offene Hochskalierungs-Auftrag **des angemeldeten Nutzers** vom Server geholt und die Anzeige läuft weiter. Offen sind: eingereiht, eingereicht, in Arbeit, Anbieter fertig, wird gespeichert. Terminal: fertig, fehlgeschlagen, storniert, erstattet, Prüfung.
7. **Verlauf mit gemeinsamem Modell.** Generierungen und Hochskalierungen werden je über einen kleinen Adapter in ein gemeinsames Verlaufs-Modell übersetzt (Art, Status, Zeit, Ergebnis-Link, Vorschaubild, Modell, Auflösung, Dauer) und von einer Oberfläche angezeigt — keine verstreuten Sonderfälle in der bestehenden Komponente.
8. **Ehrliche Statustexte.** „Video wird hochskaliert" → „Hochskalierung abgeschlossen" → „Ergebnis wird gespeichert" → „Fertig". Dauert das Speichern lange: „Das Video wurde erfolgreich erstellt. Die Datei wird noch in deiner Mediathek gespeichert. Du kannst die Seite schließen, der Vorgang läuft weiter." In DE/EN/ES.
9. **Der aktuell hängende Auftrag** wird nach dem Fix zuerst **gerettet** (nachträglich gespeichert), nicht pauschal erstattet — nur falls die Datei wirklich weg ist, genau eine Gutschrift.

## Technisch

- `supabase/functions/_shared/video-enhance-finalize.ts`: `fetch → arrayBuffer → upload` durch echten Stream-Transfer ersetzen (für große Dateien resumable/TUS-Pfad statt Standard-Upload); `validateStagedOutput` auf Header-/Range-Prüfung umstellen; `probeRemoteVideo` läuft weiter gegen die gestagte Datei.
- Neue Felder auf `video_enhance_runs`: `failure_stage`, `next_persist_at`, `persist_last_error`, `persist_lease_owner`, `persist_lease_until` (Migration inkl. Grants). Bestehende Statuswerte bleiben; `provider_failed` wird für Persistenzfehler **nicht** mehr gesetzt.
- `supabase/functions/video-enhance-reconcile/index.ts`: atomarer Claim per Lease-Update, max. 1 Finalisierung pro Zyklus, Backoff-Staffel, Übergang in `manual_review` mit `failure_stage='persist'`, Refund nur bei nachweislich unwiederbringlichem Output. Kostenscanner unverändert.
- Frontend: `useEnhanceVideo.resumeOpenRun()` (serverseitig user-scoped, definierte Nicht-Terminal-Liste), Aufruf beim Mount von `EnhanceVideoPanel`; neuer Adapter `src/lib/videoHistory/model.ts` + Nutzung in `VideoGenerationHistory.tsx`.
- Tests (`src/test/`): Nicht-Terminal-Definition, Resume nach Reload, Verlaufs-Normalisierung, Backoff-Staffel, Lease-Exklusivität, Statustexte DE/EN/ES.
- Unverändert: Preise, Deckel 1,8×–3,0×, Wallet- und Idempotenzschutz, Anbieterauswahl, Lip-Sync, Director's Cut.

## Abnahme

| Fall | Erwartung |
|---|---|
| kleines Video | fertig |
| großes 4K-Video | fertig, kein Speicherüberlauf |
| Neuladen während Anbieterlauf | Auftrag wieder sichtbar |
| Neuladen während Speichern | Auftrag wieder sichtbar |
| Tab schließen | Backend läuft weiter |
| Anbieter fertig, Speicher kaputt | Wiederholung, kein Sofort-Refund |
| zwei Abgleiche parallel | nur einer finalisiert |
| gleicher Abgleich erneut | keine Doppeldatei, keine Doppelbuchung |
| Wiederholungslimit erreicht | sauberer Prüf-Status mit Fehlerangabe |
| Verlauf nach neuem Login | Hochskalierung vorhanden |
| fertiger Lauf | Abspielen, Herunterladen, in Mediathek |
| aktuell hängender Auftrag | gerettet — oder exakt einmal erstattet |
