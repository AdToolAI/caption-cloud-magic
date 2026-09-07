# Video-Hochskalierung: hängt, dauert ewig, verschwindet beim Neuladen

## Befund (geprüft, nicht vermutet)

- Die Beschwerde ist berechtigt. In den echten Daten steht aktuell ein Auftrag seit **über 1,5 Stunden** auf „Datei wird gesichert" — mit **19 Sicherungsversuchen** und ohne Fehlermeldung. Der Kunde sieht endlos „läuft".
- Die Ursache ist im Protokoll eindeutig: Der Hintergrundabgleich, der fertige Aufträge abschließt, stürzt bei **jedem** Durchlauf mit **„Memory limit exceeded"** ab (zuletzt 17:50 und 17:55 Uhr). Er lädt die fertige Videodatei komplett in den Arbeitsspeicher, bevor er sie in unseren Speicher legt — bei hochskalierten Videos ist die Datei dafür zu groß.
- Folge: Der Anbieter ist längst fertig, unser System kommt aber nie zum Abschluss und startet den Sicherungsversuch alle 5 Minuten neu. Deshalb „dauert es zu lange".
- Zweiter, unabhängiger Punkt: Der laufende Auftrag lebt **nur im geöffneten Tab**. Beim Neuladen ist er weg — und im Verlauf („History") taucht er auch nicht auf, weil der Verlauf ausschließlich generierte Videos zeigt, nie Hochskalierungen. Genau das beschreibt der Kunde.
- Durchschnittliche Dauer abgeschlossener Läufe: rund 12 Minuten; die schnellen liegen bei 2–5 Minuten. Die Ausreißer sind die hängenden Fälle.

## Was ich ändern möchte

1. **Sicherung ohne Speicherüberlauf.** Die fertige Datei wird künftig durchgereicht statt komplett in den Speicher geladen; die Messung der Auflösung passiert am gespeicherten File, nicht am Speicherabbild. Damit endet die Absturzschleife — der eigentliche Fehler.
2. **Kein endloses Wiederholen mehr.** Nach einer festen Zahl erfolgloser Sicherungsversuche wird ein Auftrag klar beendet und sichtbar (Fehler mit Rückerstattung bzw. Prüf-Status), statt still weiterzuschleifen. Pro Durchlauf wird nur eine große Datei gesichert, damit ein Durchlauf nicht mehrere schwere Dateien gleichzeitig stemmen muss.
3. **Aufträge überleben das Neuladen.** Öffnet der Nutzer die Seite neu, wird ein noch laufender Hochskalierungs-Auftrag automatisch wieder geladen und die Fortschrittsanzeige läuft weiter.
4. **Hochskalierungen im Verlauf.** Der Verlaufs-Tab zeigt zusätzlich alle Hochskalierungen — laufend, fertig, fehlgeschlagen — mit Abspielen, Herunterladen und dem Hinweis, dass das Ergebnis in der Mediathek liegt. Damit findet der Kunde sein Video nach jedem Neuladen wieder.
5. **Ehrliche Wartezeit.** Während des Laufs zeigt die Karte die verstrichene Zeit und die typische Dauer; dauert es länger als üblich, erscheint „Dauert länger als gewöhnlich, läuft aber weiter" statt einer Fehlermeldung. In DE/EN/ES.
6. **Der aktuell hängende Auftrag** wird nach dem Fix nachgezogen (abgeschlossen oder sauber erstattet) und geprüft.

## Technisch

- `supabase/functions/_shared/video-enhance-finalize.ts`: `fetch → arrayBuffer → upload` durch Stream-Upload ersetzen; `validateStagedOutput` auf Header-/Range-Prüfung statt Vollpuffer umstellen; `probeRemoteVideo` gegen die gestagte Datei bleibt.
- `supabase/functions/video-enhance-reconcile/index.ts`: pro Zyklus max. 1 Finalisierung; harte Obergrenze für `persist_attempts` → `manual_review`/`provider_failed` mit bestehender idempotenter Rückerstattung; Batchgröße für den Kostenscanner unverändert.
- Frontend: `useEnhanceVideo` bekommt `resumeOpenRun()` (letzter nicht-terminaler Lauf des Nutzers über `action: 'status'`/Listenabruf), Aufruf beim Mount von `EnhanceVideoPanel`.
- `VideoGenerationHistory.tsx`: dritte Quelle `video_enhance_runs` (nur Client-Felder) einmischen, nach `created_at` sortiert; Wiederverwendung von `runPresentation.ts`.
- Neue Tests unter `src/test/`: Verlauf-Zusammenführung, Resume nach Reload, Wartezeit-Text.
- Unverändert: Preise, Deckel (1,8×–3,0×), Wallet-Logik, Anbieterauswahl, Lip-Sync, Director's Cut.

## Verifikation

- Abgleich-Funktion läuft ohne „Memory limit exceeded" durch (Protokoll über mehrere Zyklen).
- Ein 4K-Testlauf endet auf `completed` mit Datei in der Mediathek; kein Lauf bleibt länger als der Horizont offen.
- Seite während des Laufs neu laden → Fortschritt ist wieder da; Verlauf zeigt den Lauf.
- Der aktuell hängende Auftrag ist danach terminal und die Buchung stimmt (keine Doppelabbuchung).
