# Video-Hochskalierung: hängt, dauert ewig, verschwindet beim Neuladen

## Befund (geprüft, nicht vermutet)

- Ein Auftrag steht aktuell seit **über 1,5 Stunden** auf „Datei wird gesichert" — mit **19 Sicherungsversuchen**, ohne Fehlermeldung. Der Kunde sieht endlos „läuft".
- Das Protokoll ist eindeutig: Der Hintergrundabgleich stürzt bei **jedem** Durchlauf mit **„Memory limit exceeded"** ab (zuletzt 17:50 und 17:55 Uhr). Er lädt die fertige Videodatei komplett in den Arbeitsspeicher, bevor er sie in unseren Speicher legt.
- Nicht die Hochskalierung dauert lange — der **Anbieter ist längst fertig**. Es scheitert das Ablegen der großen Datei bei uns, und das wiederholt sich alle 5 Minuten endlos.
- Der laufende Auftrag lebt **nur im geöffneten Tab**. Nach dem Neuladen ist er weg, und im Verlauf taucht er nie auf — der Verlauf zeigt ausschließlich generierte Videos.
- Abgeschlossene Läufe brauchen im Schnitt rund 12 Minuten, die schnellen 2–5 Minuten. Die Ausreißer sind genau die hängenden Fälle.
- Geprüft: Die Status-Spalte hat **keine Datenbank-Beschränkung**; `manual_review` wird serverseitig bereits gesetzt und ist gültig. Es fehlt nur in Oberfläche, Typen und Tests — das wird ergänzt, kein neuer undeklarierter Status.

## Grundsatz

Anbieter-Job, Speichern, Guthaben und Oberfläche sind **vier getrennte Zustände**. Ein Speicherfehler darf nie wie ein KI-Fehler aussehen. Der Browser ist Beobachter, nicht Besitzer: Tab schließen, Gerät wechseln, morgen wiederkommen bleibt folgenlos.

Zielablauf:

```text
Anbieter fertig  →  Ergebnis-Referenz bleibt erhalten
      ↓
Speichern ausstehend  →  atomarer Anspruch (Lease)
      ↓
Speichern läuft  →  speicherschonend + fortsetzbar
      │   Worker stirbt → nächster Lauf setzt fort, nicht bei 0
      ↓
Objekt prüfen → Video vermessen → fertig

Fehlerpfad: vorübergehender Fehler → Wartezeit → Fortsetzen →
Versuchslimit → Prüf-Status → Rettung der Anbieterdatei →
nur bei endgültigem Verlust: genau eine Gutschrift
```

## Was ich ändern möchte

1. **Speichern ohne Speicherüberlauf — und ohne Laufzeit-Falle.** Der Weg „komplett in den Arbeitsspeicher laden" wird vollständig entfernt. Der Transfer muss nachweislich **speicherbegrenzt UND neustartsicher** sein. Es reicht ausdrücklich nicht, einen Datenstrom in eine Bibliotheksfunktion zu geben und anzunehmen, sie puffere nicht — und es reicht nicht, das Speicherlimit gegen das Laufzeitlimit zu tauschen. Große Dateien laufen über einen fortsetzbaren, stückweisen Weg (TUS/resumable), sodass ein abgebrochener Versuch dort weitermacht, wo er aufgehört hat.
2. **Fortsetz-Zustand wird gespeichert.** Upload-Kennung/-URL, Fortschritt bzw. Offset, Gültigkeitsende, Zielpfad und Zustand liegen in der Datenbank. Ein Wiederholungsversuch setzt fort statt die 4K-Datei erneut komplett zu holen.
3. **Fester, eindeutiger Zielpfad** pro Lauf (`video-enhance/<user>/<run-id>/<datei>`) — kein neues Zufallsobjekt je Versuch, kein stilles Überschreiben. Findet ein zweiter Arbeiter das Objekt bereits vor, prüft und übernimmt er es. Das ist die zweite Sicherung gegen Doppelarbeit neben der Datenbanksperre.
4. **Atomarer Anspruch.** Kein „erst suchen, dann markieren". Ein einziger Datenbankschritt verlangt gleichzeitig: passender Zustand, Wiederholungszeit erreicht, keine gültige Sperre — und setzt die neue Sperre; nur die zurückgegebene Zeile wird bearbeitet. Zwei gleichzeitige Abgleiche können denselben Lauf mathematisch nicht beanspruchen.
5. **Speicherfehler ist kein Anbieterfehler.** Erfolgreich erzeugte, aber nicht abgelegte Videos bekommen einen eigenen, klar benannten Zustand plus `failure_stage='persist'`. Der Anbieterstatus bleibt „erfolgreich".
6. **Beweise aufbewahren.** Anbieter-Job-ID, Fertigstellungszeit, Ergebnis-Referenz samt Ablaufzeit, erwartete Größe und Dateityp, Zielpfad, Versuchszahl, letzter Fehler, Fehlerstufe. Die einzige rettbare Referenz wird nie verworfen, nur weil ein Speicherversuch scheiterte.
7. **Kein automatischer Sofort-Refund.** Wiederholungen mit wachsendem Abstand (sofort, +2, +5, +15, +30 Min.), danach Prüf-Status mit allen Angaben für einen letzten Rettungsversuch. Erst wenn das Ergebnis nachweislich nicht mehr lieferbar ist, greift die bestehende Gutschrift — genau einmal.
8. **Pro Durchlauf höchstens eine schwere Sicherung.** Die Kostenprüfung bleibt unverändert. Eine echte Warteschlange mit mehreren Arbeitern ist Phase 2, jetzt wird erst stabilisiert.
9. **Aufträge überleben Neuladen und Tabwechsel.** Beim Öffnen wird der jüngste offene Hochskalierungs-Auftrag **des angemeldeten Nutzers** serverseitig geholt. Offen: eingereiht, eingereicht, in Arbeit, Anbieter fertig, wird gespeichert. Terminal: fertig, fehlgeschlagen, storniert, erstattet, Prüfung.
10. **Verlauf mit gemeinsamem Modell.** Generierungen und Hochskalierungen werden je über einen Adapter in ein gemeinsames Verlaufs-Modell übersetzt (Art, Status, Zeit, Ergebnis, Vorschau, Modell, Auflösung, Dauer) — keine verstreuten Sonderfälle in der bestehenden Komponente.
11. **Ehrliche Statustexte.** „Video wird hochskaliert" → „Hochskalierung abgeschlossen" → „Ergebnis wird gespeichert" → „Fertig". Bei langem Speichern: „Das Video wurde erfolgreich erstellt. Die Datei wird noch in deiner Mediathek gespeichert. Du kannst die Seite schließen, der Vorgang läuft weiter." In DE/EN/ES.
12. **Der aktuell hängende Auftrag** wird zuerst **gerettet** (nachträglich gespeichert), nicht pauschal erstattet.

## Technisch

- `supabase/functions/_shared/video-enhance-finalize.ts`: `fetch → arrayBuffer → upload` vollständig entfernen; speicherbegrenzter, fortsetzbarer Transfer mit deterministischem Zielobjekt, ohne Upsert im Normalfall; Validierung per Header/Range; `probeRemoteVideo` erst gegen das abgelegte Objekt.
- Migration auf `video_enhance_runs`: `failure_stage`, `next_persist_at`, `persist_last_error`, `persist_lease_owner`, `persist_lease_until`, `resumable_upload_url`, `resumable_upload_offset`, `resumable_upload_expires_at`, `destination_object_path`, `provider_output_expires_at`, `expected_content_length`, `expected_content_type` (inkl. Grants). Index auf (`status`, `next_persist_at`).
- `video-enhance-reconcile/index.ts`: Claim über ein einziges bedingtes `update … returning`; max. 1 schwere Finalisierung je Aufruf; Backoff-Staffel; Übergang nach `manual_review` mit `failure_stage='persist'`; Refund nur bei nachweislich unwiederbringlichem Output; Kostenscanner unverändert.
- Frontend: `useEnhanceVideo.resumeOpenRun()` (serverseitig user-scoped, definierte Nicht-Terminal-Liste), Aufruf beim Mount von `EnhanceVideoPanel`; `manual_review` in Client-Typen und Anzeige ergänzen; neuer Adapter `src/lib/videoHistory/model.ts`, genutzt von `VideoGenerationHistory.tsx`.
- Tests (`src/test/`): Nicht-Terminal-Definition, Resume nach Reload, Verlaufs-Normalisierung, Backoff-Staffel, Lease-Exklusivität, Zielpfad-Determinismus, Statustexte DE/EN/ES.
- Unverändert: Preise, Deckel 1,8×–3,0×, Wallet- und Idempotenzschutz, Anbieterauswahl, Lip-Sync, Director's Cut.

## Abnahme

| Fall | Erwartung |
|---|---|
| kleines Video | fertig |
| großes 4K-Ergebnis in Produktionsgröße | fertig, ohne Speicher-, CPU- oder Laufzeitabbruch |
| Arbeiter stirbt bei ca. 50 % Transfer | nächster Lauf setzt fort, kein Neustart bei 0 |
| Zielobjekt existiert, Lauf noch nicht fertig | Objekt prüfen und Lauf abschließen, kein zweiter Upload |
| zweiter Arbeiter, gleicher Zielpfad | kein Duplikat, kein Überschreiben |
| Neuladen während Anbieterlauf / während Speichern | Auftrag jeweils wieder sichtbar |
| Tab schließen | Backend läuft weiter |
| Anbieter fertig, Speicher vorübergehend kaputt | Wiederholung, kein Sofort-Refund |
| Anbieter-Referenz läuft während der Versuche ab | Prüf-Status mit definiertem Rettungs-/Erstattungsweg |
| Wiederholungslimit erreicht | sauberer Prüf-Status mit Fehlerangabe |
| gleicher Abgleich erneut | keine Doppeldatei, keine Doppelbuchung |
| Verlauf nach neuem Login | Hochskalierung vorhanden |
| fertiger Lauf | Abspielen, Herunterladen, in Mediathek |
| aktuell hängender Auftrag | gerettet — oder exakt einmal erstattet |

Nach Freigabe lege ich diese Punkte zusätzlich als Aufgabenliste in `roadmap.md` ab.
