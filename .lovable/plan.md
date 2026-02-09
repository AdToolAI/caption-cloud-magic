
# Fix: render-universal-video Timeout zu niedrig

## Problem

Die Aufrufkette hat ein Timeout-Nadeloehr:

```text
auto-generate-universal-video (300s)
  -> render-universal-video (120s)  <-- ZU KURZ!
    -> render-with-remotion (300s, synchron)
```

`render-with-remotion` wartet jetzt synchron auf die Lambda (~60-120s). Aber `render-universal-video` bricht nach 120s ab und gibt 504 zurueck. Daher der Fehler bei exakt 85% -- genau wenn das Rendering startet.

## Loesung

### Aenderung 1: Timeout erhoehen

Datei: `supabase/config.toml`

```text
[functions.render-universal-video]
verify_jwt = true
timeout_sec = 300  # Von 120 auf 300 erhoehen (gleich wie render-with-remotion)
```

### Aenderung 2: Duplikate in config.toml bereinigen

Die Datei enthaelt `render-universal-video` zweimal (Zeile 419 und Zeile 646). Die doppelte Definition muss entfernt werden, damit nur die mit `timeout_sec = 300` aktiv ist.

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `supabase/config.toml` | `render-universal-video` timeout_sec auf 300 erhoehen, Duplikat entfernen |

Das ist eine einzeilige Aenderung die das 504-Problem loest.
