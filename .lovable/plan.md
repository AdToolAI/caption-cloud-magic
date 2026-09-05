# Beschwerden von yaxac88729@watchyio.com — Befund und geplante Änderungen

## Was die echten Daten zeigen

**Videos (11 Läufe, 4.–5. September)**
- 10 Läufe erfolgreich. Laufzeiten: 1–5 Minuten (z. B. 05:26 Start → 05:28 fertig, 15:07 → 15:11).
- 1 Lauf wirklich fehlgeschlagen (Seedance Pro, 5.9. 14:43): Anbieter meldete Überlastung ("high demand"). Guthaben wurde **genau einmal** zurückerstattet (−2,50 € Abbuchung, +2,50 € Gutschrift zwei Minuten später).
- 1 Auffälligkeit: Ein Seedance-2.5-Lauf wurde um 08:56 gestartet, aber erst um 14:43 als fertig markiert — knapp 6 Stunden später. Ursache ist belegt: Der Statusabgleich für dieses Modell wird ausschließlich vom offenen Browser-Tab angestoßen; es gibt keinen serverseitigen Zeitplan dafür. Der Lauf wurde erst abgeschlossen, als der Kunde die Seite wieder öffnete. **Das ist der einzige echte Bug in diesem Fall.**
- Kein Lauf hängt dauerhaft auf "in Arbeit": aktuell 56 fertig, 12 fehlgeschlagen, 0 offen.

**Verbessern/Upscale (der Punkt "last step edit and upscale")**
- Zwei Läufe, beide erfolgreich: Topaz 720p in 40 Sekunden, ByteDance vCube 1080p in 2 Minuten. Beide Ergebnisse liegen in der Mediathek. Keine Fehler, keine langen Wartezeiten auf diesem Pfad.

**Sprache des Assistenten**
- Bereits behoben und live: Coach und Text Studio bekommen die eingestellte Oberflächensprache jetzt als oberste Anweisung mit; Rückfall ist immer Englisch, nie zufällig. Es fehlen nur noch automatische Tests, die das dauerhaft absichern.

## Was ich umsetzen möchte

1. **Läufe laufen im Hintergrund zu Ende** — ein serverseitiger Zeitplan (jede Minute) schließt Seedance-2.5-Läufe ab, auch wenn niemand die Seite offen hat. Damit kann sich der 6-Stunden-Fall nicht wiederholen.
2. **Echte Wartezeit statt Rätselraten** — während ein Video läuft, zeigt die Karte die verstrichene Zeit und die typische Dauer für genau dieses Modell, berechnet aus unseren tatsächlichen Läufen (z. B. Kling 3 Pro: rund 5 Minuten, Seedance 2.5: rund 4 Minuten). Dauert ein Lauf länger als üblich, erscheint "Dauert länger als gewöhnlich, läuft aber weiter" — nie eine Fehlermeldung.
3. **Verständliche Fehlermeldungen für alle häufigen Anbieterfehler** — Überlastung ist bereits abgedeckt; ergänzt werden Zeitüberschreitung, ungültige Eingabe, Inhaltsprüfung/Ablehnung, interner Anbieterfehler und Netzwerkfehler, jeweils in Deutsch, Englisch und Spanisch, mit Hinweis auf die Rückerstattung.
4. **Automatische Retries: nein** — bei Überlastung sind das teure, minutenlange Wiederholungen mit demselben Ergebnis; Abbuchung und Rückerstattung müssten pro Versuch neu verwaltet werden. Stattdessen bleibt die klare Meldung plus der vorhandene "Erneut erzeugen"-Knopf mit vorausgefülltem Formular. Ich schreibe die Begründung in den Bericht, ändere aber nichts an Abrechnung oder Anbieter-Logik.
5. **Tests** — je ein Test pro Sprache (DE/EN/ES), der prüft, dass die Sprachanweisung im Systemprompt gesetzt wird, plus Tests für die Fehlermeldungs-Zuordnung und die Wartezeit-Anzeige.

## Technische Details

- Migration: `cron.schedule('modelark-poll-every-minute', '* * * * *', ...)` ruft die Funktion `modelark-poll` auf; zusätzlich eine `security definer`-Funktion `video_model_runtime_stats()` (P50/P90 je Modell aus `ai_video_generations`, nur abgeschlossene Läufe, mindestens 3 Messwerte, Ausreißer > 1 h ausgeschlossen), Ausführungsrecht für `authenticated` und `service_role`.
- Neuer Hook `useVideoModelRuntimeStats` (React Query, 30 min Cache) plus Anzeige-Komponente in `VideoGenerationHistory.tsx`; Modelle ohne ausreichende Datenlage zeigen nur die verstrichene Zeit.
- `getFriendlyErrorMessage` in `VideoGenerationHistory.tsx` wird um die weiteren Fehlerklassen ergänzt und in eine testbare Datei (`src/lib/videoErrorMessages.ts`) ausgelagert.
- Tests unter `src/test/` (Vitest): Sprachdirektive, Fehlerklassifizierung, ETA-Formatierung.
- Nicht angefasst: Preise, Wallet, Anbieter-Engine, Lip-Sync, Kalibrierung.

## Offen aus dem Fall

Nach der Analyse bleibt für yaxac88729@watchyio.com kein ungeklärter Fall: kein verlorener Lauf, keine fehlende Gutschrift, kein doppelt abgebuchter Betrag.
