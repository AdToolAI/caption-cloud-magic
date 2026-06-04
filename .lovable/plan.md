## Befund

Der aktuelle Run `632370bc-7b58-466d-87d9-a65b8e163106` erklärt exakt dein sichtbares Ergebnis:

- Pass 1 / Charakter 1: fehlgeschlagen
- Pass 2 / Charakter 2: erfolgreich
- Pass 3 / Charakter 3: fehlgeschlagen
- Danach hat unsere Pipeline trotzdem per `partialMux` ein finales Video gebaut. Deshalb bewegt nur der zweite Charakter die Lippen.

Das ist nicht mehr nur ein Sync.so-Fehler, sondern ein Pipeline-Fehler: Wir deklarieren einen teilweise erfolgreichen 3-Sprecher-Lip-Sync als fertig.

## Vergleich mit offizieller Sync.so-Doku

Sync.so sagt öffentlich:

- Bei mehreren Personen muss `options.active_speaker_detection` verwendet werden.
- Für manuelle Sprecherwahl müssen `frame_number` und `coordinates` aus demselben echten Video-Frame stammen.
- `coordinates` müssen im Pixel-Koordinatensystem des extrahierten Frames liegen.
- Alternativ können `bounding_boxes` pro Frame geliefert werden.
- `lipsync-2` / `lipsync-2-pro` brauchen natürliche sichtbare Sprech-/Mundbewegung im Inputvideo. Statische Gesichter oder nicht aktive Sprecher funktionieren schlecht oder gar nicht.
- Für schwierige Winkel, verdeckte/kleine/statische Gesichter empfiehlt Sync.so `sync-3`.

Unsere Pipeline macht inzwischen vieles richtig:

```text
POST /v2/generate
model: lipsync-2-pro
input: [video, per-speaker-audio]
options.active_speaker_detection.auto_detect: false
options.active_speaker_detection.frame_number: N
options.active_speaker_detection.coordinates: [x, y]
```

Aber es gibt drei Abweichungen, die den aktuellen Fehler erklären:

1. **Partial-Mux ist falsch für Pflichtsprecher**
   - Wenn 1 von 3 Passes klappt, bauen wir trotzdem ein Ergebnis.
   - Für den Nutzer sieht das aus wie “Lip-Sync fertig, aber zwei Charaktere bewegen sich nicht”.
   - Korrekt wäre: Szene nicht als fertig markieren, sondern failen/refunden oder automatisch mit besserem Modell/Plate neu versuchen.

2. **Face-Gate-Reparatur beweist, dass die Plate nicht Sync.so-tauglich ist**
   - Bei Pass 1 und 3 wurde `face_count: 1` repariert.
   - Das heißt: Am gewählten Sprecher-Frame wurde nur ein Gesicht zuverlässig erkannt, obwohl 3 Sprecher existieren.
   - Die Reparatur mappt dann Slot 0 auf beide fehlgeschlagenen Sprecher. Formal entsteht eine Payload, aber inhaltlich ist sie nicht Sync.so-konform genug, weil das Zielgesicht nicht eindeutig sichtbar ist.

3. **Wir bleiben zu lange auf `lipsync-2-pro`**
   - Die Doku sagt explizit: `lipsync-2/pro` brauchen natürliche sichtbare Sprechbewegung.
   - In AI-generierten 3-Personen-Szenen sind oft nur ein bis zwei Gesichter groß/frontal/bewegt genug.
   - Für diese Fälle muss der Fallback `sync-3` sein, nicht noch ein `coords-pro-box` Versuch mit derselben problematischen Plate.

## Plan

### 1. Partial-Mux für 3+ Sprecher abschalten

In `sync-so-webhook` ändere ich die v5-Failure-Logik:

- Bei `total_passes >= 3` darf kein `partialMux` mehr als finales Ergebnis entstehen.
- Wenn nach Retry-Budget nicht alle Pflichtsprecher erfolgreich sind:
  - Szene bleibt nicht `done`/`applied`.
  - `lip_sync_status` wird `failed` oder `retrying_sync3`.
  - Credits werden idempotent refundet, falls kein automatischer Fallback mehr läuft.
  - UI zeigt klar: “Charakter 1/3 konnte nicht gelip-synct werden”.

### 2. Sync.so-Doku-konforme Sprecher-Gates verschärfen

In `compose-dialog-segments`:

- Für 3+ Sprecher akzeptieren wir eine Face-Gate-Reparatur nicht mehr, wenn im Frame weniger Gesichter erkannt wurden als Sprecher bzw. als sinnvolle Mindestanzahl.
- Ein reparierter Sprecher darf nicht mehrfach auf denselben einzigen Face-Box-Slot fallen.
- Wenn nur `face_count: 1` bei einer 3-Sprecher-Szene erkannt wird, wird nicht blind an Sync.so geschickt.
- Stattdessen wird sofort ein sauberer Fallback ausgelöst: `sync-3` oder Szene/Plate neu rendern.

### 3. `sync-3` Fallback für schwierige 3-Sprecher-Szenen

Nach offiziellen Docs ist `sync-3` genau für komplexe Winkel, Obstructions und statischere/schwierigere Gesichter gedacht.

Ich baue eine begrenzte Fallback-Stufe:

```text
lipsync-2-pro coords
→ lipsync-2-pro bbox
→ sync-3 coords/bbox
→ final fail + refund
```

Wichtig:

- Kein `auto_detect` bei 3+ Sprechern, weil das Sprecher-Swaps erzeugen kann.
- `sync-3` bekommt weiter manuelle Sprecherzielung über `active_speaker_detection`.
- Retry wird pro Pass getrackt, damit ein erfolgreicher Sprecher nicht neu gerechnet werden muss.

### 4. Doku-konformes Bounding-Box-Verhalten korrigieren

Unsere aktuelle `coords-pro-box` Variante füllt denselben Box-Wert für jedes Frame.

Sync.so beschreibt `bounding_boxes` als “pro-frame array”; das ist formal erlaubt, aber bei 3 Personen in einer dynamischen AI-Plate zu grob.

Ich ändere die sichere Variante so:

- Für kurze 3-Sprecher-Clips lieber `frame_number + coordinates`, wenn ein eindeutiger Frame existiert.
- `bounding_boxes` nur nutzen, wenn die Box wirklich aus der echten Plate kommt und zum Zielsprecher gehört.
- Keine synthetische Anchor-Box mehr als letzter Versuch für 3+ Sprecher.

### 5. Output-Zustand und UI ehrlich machen

In der Progress-/Statuslogik:

- `applied/done` nur, wenn alle Pflichtsprecher-Passes `done` sind.
- Wenn ein Pass scheitert, wird der betroffene Sprecher sichtbar aufgeführt.
- Partial-Mux darf höchstens als Debug-/Preview-Zwischenstand gespeichert werden, nicht als finales `clip_url`.

### 6. Betroffene Szene sauber zurücksetzen

Nach der Änderung setze ich die aktuelle Szene `632370bc-7b58-466d-87d9-a65b8e163106` zurück, damit sie nicht weiter mit dem teilweise gemuxten Ergebnis arbeitet.

Danach prüfe ich:

- Dispatch-Logs: alle Sprecher haben eigene valide `frame_number + coordinates`.
- Webhook-Logs: kein `partialMux` als Erfolg bei 3 Sprechern.
- Ergebnis: entweder alle 3 Lippen bewegen sich oder die Szene scheitert sauber mit Refund/Fallback statt falschem “done”.

## Dateien

- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/render-sync-segments-audio-mux/index.ts`
- `src/components/video-composer/SceneClipProgress.tsx`
- optional: `supabase/functions/reset-lipsync-scene/index.ts` für Reset alter Partial-Mux-Zustände

## Ergebnis

Nach Umsetzung darf es nicht mehr passieren, dass eine 3-Sprecher-Szene als fertig gilt, wenn nur ein Charakter erfolgreich gelip-synct wurde. Entweder alle Pflichtsprecher funktionieren, oder die Pipeline wechselt auf den passenden Sync.so-Fallback bzw. bricht sauber mit Refund und klarer Ursache ab.