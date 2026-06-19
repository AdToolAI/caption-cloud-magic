Du hast recht: Das darf kein 20-Minuten-/Retry-Produkt werden. Bei der aktuellen Szene sieht es nach einem **selbst verursachten Pipeline-Fehler** aus, nicht nach “Sync.so kann es grundsätzlich nicht”.

## Warum der Fehler überhaupt kommt

Die Szene hat mehrere Sprecher. Unsere Pipeline verarbeitet dafür mehrere Lip-Sync-Pässe.

Der kritische Punkt:

- Pass 4 wurde um ca. `19:41:01` an Sync.so geschickt.
- Der Watchdog hat die Szene um ca. `19:42:03` als Timeout fehlgeschlagen markiert.
- Der Sync.so-Job kam danach erfolgreich zurück, wurde aber ignoriert, weil die Szene schon auf `failed` stand.

Das heißt: **Der letzte Sprecher hatte nur etwa 60 Sekunden Zeit**, obwohl der Watchdog eigentlich 10 Minuten Provider-Zeit geben sollte.

Die Ursache ist sehr wahrscheinlich:

> Der Watchdog misst den Timeout ab dem Start der gesamten Szene / des ersten Passes, nicht sauber ab dem Start des aktuell laufenden Passes.

Bei 4 Sprechern ist die Szene also schon “alt”, bevor der letzte Pass überhaupt richtig läuft. Dann killt der Watchdog einen gesunden Job zu früh.

Zusätzlich hat der vorherige Auto-Retry-Fix die Pass-Liste teilweise kaputt zurückgesetzt. Deshalb zeigt das Forensik-Panel jetzt `pass_not_found`.

## Ziel

Nicht mehr “mehr Retries”, sondern:

- erster Lauf soll stabil durchlaufen
- kein vorzeitiger Watchdog-Kill
- kein kaputter `passes[]` Zustand
- erfolgreiche späte Webhooks dürfen nicht weggeworfen werden, wenn sie zu einem aktiven aktuellen Pass gehören
- echte Provider-Ausfälle bleiben trotzdem abgesichert und werden refundet

## Plan v131.8: Ursachenfix statt Retry-Workaround

### 1. Watchdog auf Pass-Level umstellen

In `lipsync-watchdog` wird der Timeout nicht mehr primär anhand von `dialog_shots.first_started_at` oder Szenenalter berechnet.

Stattdessen:

- Für jeden `rendering` Pass wird `pass.started_at` gelesen.
- Nur dieser konkrete Pass darf wegen Provider-Timeout bewertet werden.
- Ein Pass wird erst nach z. B. 10 Minuten seit seinem eigenen `started_at` als Provider-Timeout behandelt.
- Solange irgendein aktueller Pass jünger als TTL ist, darf die Szene nicht terminal scheitern.

Damit bekommt Pass 4 dieselbe faire Laufzeit wie Pass 1.

### 2. Auto-Retry entschärfen oder für diesen Fall deaktivieren

Der Auto-Retry darf nicht mehr die komplette `passes[]` Liste leeren.

Stattdessen:

- Nur den betroffenen Pass zurück auf `pending` setzen.
- Die übrigen erfolgreichen Passes behalten.
- `watchdog_retry_attempted` direkt am Pass speichern.
- Keine sparse/null Pass-Liste erzeugen.

Optional: Für Multi-Speaker-Szenen mit bereits erfolgreichen Passes wird Auto-Retry erst einmal stark konservativ gemacht, damit wir nicht mehr fertige Sprecher verlieren.

### 3. Late-success Webhook darf recovern

Wenn Sync.so nach einem zu frühen Watchdog-Fail doch `COMPLETED` liefert:

- Wenn die `job_id` noch in `dialog_shots.passes[]` bekannt ist, darf der Webhook nicht pauschal ignoriert werden.
- Er soll den Pass als `done` markieren oder die Szene aus `failed` zurückholen, sofern der Fehler nur `watchdog_provider_timeout` war.
- Echte harte Fehler bleiben weiterhin terminal.

Das verhindert, dass ein erfolgreicher erster Providerlauf durch unsere eigene State-Machine verloren geht.

### 4. Forensik `pass_not_found` reparieren

Das Forensik-Panel soll bei fehlendem/null Pass nicht nur 404 zeigen.

Stattdessen:

- aus `syncso_dispatch_log` den letzten bekannten Pass rekonstruieren
- anzeigen, ob der Pass später `COMPLETED` kam
- Warnung ausgeben: `Watchdog killed pass before pass TTL elapsed`

Das macht die Diagnose eindeutig und verhindert falsche Schlüsse.

### 5. Test absichern

Ein Regressionstest simuliert genau diesen Fall:

```text
Pass 1 startet bei Minute 0 und wird done.
Pass 2/3 folgen.
Pass 4 startet bei Minute 11.
Watchdog läuft bei Minute 12.
Erwartung: Szene darf NICHT failen, weil Pass 4 erst 1 Minute alt ist.
```

Zusätzlich:

```text
Auto-Retry darf passes[] nicht leeren und keine null Slots erzeugen.
Late COMPLETED webhook für watchdog_provider_timeout darf recovern.
```

## Erwartetes Ergebnis

Nach diesem Fix sollte diese Art Szene nicht mehr wegen “Gesamtzeit zu alt” abbrechen. Der erste Lauf bekommt realistische Chancen, sauber fertig zu werden, ohne dass der Kunde 20 Minuten warten oder 3 Retries sehen muss.

## Dateien

- `supabase/functions/lipsync-watchdog/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- Forensik-Funktion/Panel für Sync.so Preflight bzw. Diagnose
- passende Edge-/Unit-Tests
- Memory-Notiz `v131-8-pass-level-watchdog-timeout.md`