## Kurz: Ja — aber mit einer Präzisierung

Es gibt zwei denkbare Lösungen:

1. **Die Übergangstabelle aufweichen** und `audio_ready → lipsync_running` erlauben.
2. **Den Aufrufer korrigieren**, sodass der Zustand `lipsync_dispatched` tatsächlich durchlaufen wird.

Variante 1 wäre die schnelle, aber schlechte Lösung: `lipsync_dispatched` verlöre seine Bedeutung, und Watchdog sowie Fortschrittsanzeige könnten „an Provider übergeben" nicht mehr von „Provider arbeitet" unterscheiden. Variante 2 ist sauber — der Zustandsvertrag bleibt unangetastet, der fehlerhafte Sprung wird beseitigt.

Ergänzend gehört dazu eine strukturelle Absicherung, damit dieser Klassenfehler nicht an anderer Stelle erneut auftritt.

## Umsetzung v391

**1. Dispatch-Zustand an der richtigen Stelle setzen**
- Unmittelbar nachdem Sync.so einen gültigen Job angenommen und dieser registriert wurde: atomarer Wechsel `audio_ready → lipsync_dispatched`.
- Der Wechsel nach `lipsync_running` erfolgt erst danach bzw. durch den Webhook.
- Parallele Sprecher-Pässe sind idempotent: nur der erste Übergang greift, spätere setzen nichts zurück.

**2. Klassenfehler strukturell verhindern**
- Der zentrale Übergangs-Helfer erkennt, wenn ein Ziel nur über genau einen erlaubten Zwischenzustand erreichbar ist, und protokolliert das eindeutig statt still `applied=false` zurückzugeben.
- Jedes abgelehnte `applied=false` wird als Warnung mit Ausgangs- und Zielzustand geloggt, damit ein blockierter Übergang sofort sichtbar ist und nicht erst als Endlos-Status beim Kunden auffällt.

**3. Watchdog als letztes Netz**
- Szenen, die länger als eine definierte Frist in `audio_ready` stehen, obwohl bereits Sync.so-Jobs registriert sind, werden erkannt und korrekt nachgezogen — statt unbegrenzt hängen zu bleiben.

**4. Aktuell festhängenden Lauf retten**
- Der laufende Vier-Sprecher-Lauf wird anhand von `active_run_id` und `plate_generation` sauber nachgezogen.
- Fertige Pass-Ergebnisse bleiben erhalten; keine erneute Abbuchung, kein neuer Plate-Render.

**5. Verifikation**
- Edge-Function deployen.
- Contract-Test für die Folge `audio_ready → lipsync_dispatched → lipsync_running → lipsync_muxing`.
- Nachweis am realen Lauf: Zustand schreitet fort und endet entweder in einem fertigen Clip oder in einem echten, benannten Fehler — nie mehr in einem stehenden Status.