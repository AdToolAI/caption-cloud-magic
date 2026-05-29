
## Was ich gefunden habe

**Die aktuelle, "hängende" Szene** (`e9ce0e05…`) läuft auf `engine_override = 'cinematic-sync'` und steht in `twoshot_stage='lipsync_1'`. Das ist der **alte v4-Pfad** (`compose-dialog-scene`), der die 3 Sprecher-Turns **streng sequenziell** durch Sync.so schickt:

```text
turn 0 (2.3s)  →  Sync.so  ~3-5 min
                                     ↓
turn 1 (0.9s)  →  Sync.so  ~3-5 min   ← Wahrscheinlichkeitsspitze für "sync_FAILED: unknown error"
                                                 ↓
turn 2 (…)     →  Sync.so  ~3-5 min
                                                              ↓
                                                              Stitch
```

Also: pro Szene ~10–15 min Wallclock, und **kein einziger paralleler Call**. Das ist nicht das, was Artlist macht.

**Bestätigung aus der DB:**
- `syncso_dispatch_log` ist komplett leer → v4 schreibt keine Telemetrie, wir sind blind.
- `syncso_inflight_jobs` leer → der ganze E.3-Concurrency-Guard + v5-Code wird in deinem heutigen Flow **nie betreten**, weil v5 nie ausgewählt wird.
- Historie: häufiger Fehler ist `sync_FAILED: An unknown error occurred.` — typischerweise wenn Sync.so eines der per-turn-Audios als zu kurz / leise / leer ablehnt. Bei dir gibt es einen Turn mit nur 0.929s — genau ein klassischer Trigger.
- Außerdem ein 429 in der Historie: Sync.so hat ein Concurrency-Limit (Creator-Plan: 3 parallele Jobs). Mehr als 3 Szenen gleichzeitig lipsyncen geht nicht ohne Plan-Upgrade.

**Was Artlist tatsächlich macht** ist nicht "viele kleine Calls parallel" — sondern: **EIN Call pro Master-Video mit allen Segmenten als `segments[]`-Array**, und Sync.so verarbeitet die intern parallel. Das ist exakt **v5 `sync-segments`** (`compose-dialog-segments`), den ich in den letzten Stages gebaut habe — aber er ist heute nur ein optionaler Dropdown-Eintrag, kein Default.

## Plan

### 1. v5 `sync-segments` zum Default machen
- `useTwoShotAutoTrigger.ts` Zeilen 327–332: Routing umkehren — Default ist `compose-dialog-segments`, der v4-Pfad (`compose-dialog-scene`) wird nur noch genutzt, wenn `engine_override === 'cinematic-sync'` **explizit** gesetzt ist.
- `SceneCard` Engine-Dropdown: "⚡ Fast Dialog · 1-Call" als ausgewählter Default markieren, v4 als "Legacy (per-turn)" mit Warnungs-Icon.
- Bei Szenen, die heute schon mit `engine_override=''` oder `'cinematic-sync'` in der DB stehen: einmaliger UI-Migrations-Hinweis "Auf Fast Dialog umschalten?" mit One-Click-Switch — kein Auto-Rewrite, damit laufende Renders nicht abreißen.

### 2. Cross-Scene-Parallelität ehrlich sichtbar machen
Sync.so Creator erlaubt 3 parallele Jobs. Das nutzen wir jetzt schon nicht, weil v4 jeden Job intern in 3 sequentielle Sub-Jobs splittet → effektiv läuft pro Szene nur ein Sync.so-Slot. Mit v5 = 1 Job pro Szene können wir tatsächlich 3 Szenen parallel lipsyncen.
- Auto-Trigger schon jetzt batched (Loop über alle Kandidaten in einem Tick) — mit v5 nutzt das den E.3-Guard sauber aus.
- Zusätzlich ein UI-Indikator "X von 3 Sync.so-Slots aktiv" oben in der Lipsync-Statusleiste, gespeist aus `syncso_inflight_jobs`. Macht für den User sichtbar, warum z.B. Szene 4 noch "wartet" statt "läuft".

### 3. Die "sync_FAILED unknown error" konkret abfangen
- In `compose-dialog-segments`: vor dem Dispatch eine **harte Untergrenze pro Segment** (0.5s) durchsetzen. Wenn ein Segment kürzer ist: an das nächste annähen oder mit Stille pad (gleiche Logik wie F.2 Loudness, aber zeitbasiert). Heute gibt's nur eine globale 3s-Mindestdauer für das Gesamt-Audio.
- Sync.so v2 Response-Body bei FAILED loggen — gerade die "unknown error"-Meldung ist die generische Default-Message, der eigentliche Grund steht in `error.details` und wird heute verworfen. Direkt nach Stage F.6 (Schema-Drift-Detector) das gleiche Pattern auch für FAILED-Bodies.

### 4. v4 Telemetrie nachrüsten oder v4 abschalten
Zwei Optionen, ich empfehle die zweite:
- **A:** v4 mit `logSyncDispatch()`-Calls instrumentieren (~20 min). Wir wissen dann, warum die alten Szenen failen, aber bauen Tech-Debt aus.
- **B (empfohlen):** v4 nur noch als manueller "Fallback Compatibility Mode" hinter einem Settings-Toggle; die "Auto-Retry"-Logik im Hook routet failed v4-Szenen automatisch auf v5 um. Spart uns die Doppel-Wartung.

### 5. Sync.so Plan-Hinweis im UI
Wenn die letzten 24h einen 429 hatten ODER `syncso_inflight_jobs.count >= 3` zum Zeitpunkt eines neuen Trigger-Tick: Inline-Hinweis in der Lipsync-Bar "Sync.so Concurrency-Slot voll — Szene wartet ~X min. Plan upgraden?". Kein automatischer Block, nur Transparenz.

## Was bewusst NICHT Teil dieses Plans ist
- Multi-Provider-Fallback (Sync.so → Hedra/HeyGen Switch bei Rate-Limit). Eigenes Epic, deutlich größer.
- "Echte" Cross-Szenen-Parallelisierung über 3 hinaus — das ist eine Sync.so-Account-Limitierung, nicht unser Code.
- Refactoring der v4-Stitch-Lambda. Wenn Schritt 4B durchgeht, brauchen wir die irgendwann gar nicht mehr.

## Frage an dich
Soll ich den Plan **komplett** so umsetzen (Schritte 1–5, ~90 min), oder nur Schritt **1 + 3 + 5** sofort (Default-Switch + Segment-Length-Guard + UI-Hinweis, ~30 min) und Schritt 2/4 separat?
