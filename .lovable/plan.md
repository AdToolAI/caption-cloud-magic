## Befund: Was gerade wirklich passiert

Ja — wir haben jetzt eine klarere Ursache als nur „Sync.so ist fehlgeschlagen“.

Die aktuelle Szene `1a9bf866-61fb-4952-8f33-e45985097b6e` ist terminal fehlgeschlagen, nicht mehr im alten Endlos-Loop:

- `lip_sync_status = failed`
- `twoshot_stage = failed`
- `dialog_shots.version = 5`
- `total_passes = 3`
- alle 3 Sprecher-Passes enden mit `provider_unknown_error`
- Sync.so liefert weiterhin nur `An unknown error occurred.` ohne `error_code`
- Circuit ist aktuell wieder `closed`, also nicht mehr die Hauptursache

Die Logs zeigen aber drei sehr starke Eigenfehler in unserer Pipeline, die diese Provider-Fails wahrscheinlich auslösen oder massiv verschärfen.

## Die wahrscheinlichen Fehler

### 1. Doppel-Dispatch derselben Szene

In den Dispatch-Logs gibt es zwei Jobs für denselben ersten Pass innerhalb weniger Millisekunden. Später meldet der Webhook:

```text
job ... not in passes[] and not top-level — skip
```

Das heißt: Wir schicken mindestens einmal einen Sync.so-Job raus, der danach nicht mehr sauber dem aktuellen `dialog_shots.passes[]`-State gehört. Das verbrennt Provider-Jobs, erzeugt Late-Webhooks und macht die Fehlerdiagnose unsauber.

Ursache: `compose-dialog-segments` hat keinen harten per-scene Single-Flight-Lock, obwohl ein Lock-System bereits existiert.

### 2. Audio-Repair trimmt absolute Sprecher-WAVs kaputt

Die Pipeline erzeugt für jeden Sprecher eine 9s-WAV mit Stille an den Stellen, an denen andere Sprecher reden. Diese absolute Timeline ist notwendig, weil jeder Sync.so-Pass auf die vollständige 9s-Scene-Plate läuft.

Beim Retry wird aber der Lead-In entfernt:

- Matthew: ca. `2.45s` entfernt
- Kailee: ca. `3.82s` entfernt

Dadurch ist die Sprecher-WAV nicht mehr zeitlich deckungsgleich mit der 9s-Video-Plate. Mit `sync_mode: cut_off` kann das genau zu Sync.so-Fehlern oder falscher zeitlicher Zuordnung führen.

Das ist sehr wahrscheinlich ein Hauptfehler: Für Full-Length-Passes darf Audio repariert/re-encodiert werden, aber nicht durch Trimmen der absoluten Timeline verschoben werden.

### 3. Face-Koordinaten/BBox werden trotz fehlender echter Video-Dimension weiterverwendet

Die Logs zeigen mehrfach:

```text
plate=probe-failed
```

Danach nutzt die Funktion Fallback-Dimensionen `1280x720`, obwohl das echte Hailuo-Video anders codiert oder gecroppt sein kann. Für 3 Personen ist das gefährlich: Schon kleine Koordinatenfehler treffen nicht mehr das Gesicht, Sync.so bekommt eine manuelle ASD-Zielperson, die nicht zur tatsächlichen Frame-Geometrie passt, und antwortet nur mit `unknown error`.

Bei `coords-pro-box` wird zusätzlich eine statische Bounding Box über alle Frames gesendet. Die Sync.so-Doku erlaubt Bounding Boxes pro Frame; eine starre Box über die ganze Szene ist bei bewegten Köpfen riskant.

## Do I know what the issue is?

Ja, ausreichend konkret für einen Fix-Plan:

Der Fehler ist sehr wahrscheinlich eine Kombination aus:

1. fehlendem strict Single-Flight in `compose-dialog-segments`,
2. falschem Audio-Trim bei Full-Length-Speaker-Tracks,
3. unsicheren Face-Koordinaten/BBoxes bei `plate=probe-failed`,
4. zu aggressiver Fan-Out-Parallelität für 3 Sprecher.

Sync.so gibt zwar den finalen Provider-Fehler aus, aber unsere Payload- und State-Pipeline hat noch mehrere Punkte, die diese Fehler reproduzierbar provozieren können.

## Implementierungsplan

### 1. `compose-dialog-segments` strikt serialisieren

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Vor Wallet-Abzug und vor jedem Sync.so-Dispatch einen harten scene-level Lock setzen.
- Wenn der Lock nicht erworben wird: sofort `202 scene_lock_busy` zurückgeben.
- Kein „proceed without lock“ für diese Funktion.
- Dadurch verhindern wir doppelte Pass-0-Jobs und verwaiste Webhooks.

### 2. Audio-Repair korrigieren

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Für Full-Length-Multi-Speaker-Passes keine Lead-In-Trims mehr anwenden.
- `repair_audio` soll nur noch kanonisch re-encoden bzw. WAV normalisieren, aber die ursprüngliche Dauer und Stille-Positionen erhalten.
- Lead-In-Trim nur erlauben, wenn später wirklich mit einem passend getrimmten Video-Preclip gearbeitet wird — nicht bei vollständiger Scene-Plate.

### 3. Video-Dimensionen und Face-Targeting hart validieren

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Bei 3+ Sprecher-Szenen darf `plate=probe-failed` nicht mehr still auf `1280x720` fallen.
- Wenn echte Video-Dimensionen nicht ermittelt werden können: preflight fail mit Refund und klarer Meldung.
- `coords-pro-box` nur nutzen, wenn die Box aus einer verifizierten FaceMap in echter Plate-Geometrie stammt.
- Wenn keine sichere Box vorliegt: nicht mit synthetischen Boxes weiterfeuern, sondern sauber failen oder auf einen anderen sicheren Pfad wechseln.

### 4. 3-Sprecher-Fan-Out entschärfen

Datei: `supabase/functions/compose-dialog-segments/index.ts`

- Für 3+ Sprecher nicht mehr alle Passes parallel an Sync.so senden.
- Stattdessen seriell oder maximal 1 aktiver Pass pro Szene.
- Das reduziert Provider-Stress und verhindert Race-Webhooks.

### 5. Webhook-Orphans sauber behandeln

Datei: `supabase/functions/sync-so-webhook/index.ts`

- Wenn ein Job nicht mehr in `passes[]` gefunden wird, wird er als orphan geloggt und aus `syncso_inflight_jobs` entfernt.
- Optional best-effort Provider-Cancel, falls Job noch läuft.
- Keine stummen Skips mehr, die später Slots/Diagnostik verfälschen.

### 6. Reset-Verhalten nach Fix

Datei: `supabase/functions/reset-lipsync-scene/index.ts`

- Der Reset bleibt grundsätzlich richtig.
- Nach den Code-Fixes sollte ein sauberer Reset die Szene wieder als neuen Versuch starten, aber dann ohne Doppel-Dispatch und ohne Timeline-Trim.

### 7. Validierung

Nach Umsetzung prüfe ich:

- Edge-Logs: kein doppelter Pass-0-Dispatch mehr.
- DB-State: keine Jobs mehr, die „not in passes[]“ melden.
- Dispatch-Logs: `audio_trim_sec` bleibt bei Full-Length-Passes `0`.
- Logs: bei 3+ Sprecher kein `plate=probe-failed` mit trotzdem gesendetem Sync.so-Payload.
- Falls Sync.so danach noch fehlschlägt, muss die Meldung eine echte Preflight-Ursache oder einen isolierten Provider-Fail enthalten — aber kein Loop, kein verwaister Job, kein fehlerhafter Retry-Payload.

## Erwartetes Ergebnis

Die Multi-Charakter-Lip-Sync-Pipeline wird nicht einfach erneut retryen, sondern strukturell repariert:

```text
Vorher:
parallel/doppelt dispatchen
→ absolute Sprecher-WAV trimmen
→ unsichere Face-Koordinaten bei probe-failed
→ Sync.so unknown error
→ Retry mit ähnlichem kaputtem Payload

Nachher:
strict single-flight
→ timeline-erhaltende Audio-Reparatur
→ harte Face-/Dimension-Preflights
→ serieller 3-Sprecher-Dispatch
→ klare Success- oder klare terminale Fehlerursache
```

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>