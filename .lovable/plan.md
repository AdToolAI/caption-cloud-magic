# Fix: Re-Roll von Szene 1 hängt nach Dialog-Hinzufügen

## Was wirklich passiert

Beim Klick auf **„Neu generieren €0,75"** läuft client-seitig:

```
handleGenerateSingle
  └─ prepareSceneAnchor (NEU: 2 Portraits → Multi-Char-Pfad)
        └─ supabase.functions.invoke('compose-scene-anchor')
              └─ fetch(ai.gateway.lovable.dev, Gemini-3.1-Flash-Image, 2 Bilder)   ← hängt
  └─ supabase.functions.invoke('compose-video-clips')   ← wird NIE erreicht
```

Belege aus der Live-DB & Logs:
- `composer_scenes` von Szene 1: `clip_status='ready'`, `replicate_prediction_id` **unverändert** seit 00:53 (also 20 min alt).
- `compose-video-clips`-Edge-Logs: letzter Eintrag 00:51:31 (Initial-Run). Kein Re-Roll-Aufruf.
- `compose-scene-anchor`: keine neuen Logs.
- Im Code: `fetch("…ai.gateway.lovable.dev/v1/chat/completions", …)` in `compose-scene-anchor/index.ts` Zeile 125 hat **keinen `signal` / AbortController / Timeout**. Wenn der Gateway hängt oder >150 s braucht, terminiert die Edge Function mit Worker-Timeout, der Client-Promise resolved aber nie sauber.
- Der Client-`handleGenerateSingle` hat ebenfalls keinen Timeout um den `invoke`-Aufruf, daher bleibt `setSingleGenerating[scene.id] = true` ewig stehen.

## Was gebaut wird (rein Frontend + ein Edge-Function-Hardening, KEIN neues Schema)

### 1. Edge-Function `compose-scene-anchor` (Zeile 125): harten Timeout setzen

- `AbortController` mit **45 s** Timeout um den Gemini-Image-fetch.
- Bei `AbortError` / non-2xx → wie bisher die existierende Fallback-Antwort `{ strategy: "text-only", error: "ai_timeout" }` (HTTP 200).
- Zusätzlich `console.warn` mit `sceneId` + `portraitsCount` + `elapsedMs` für Telemetrie.

Damit kommt der Client garantiert spätestens nach 45 s eine Antwort und fällt auf text-only zurück (nutzt also einfach das vorhandene `referenceImageUrl` ohne Multi-Portrait-Composition).

### 2. Client `prepareSceneAnchor.ts`: zusätzlicher Schutz

- 60 s Race-Timeout um den `supabase.functions.invoke('compose-scene-anchor')`. Bei Timeout → wie bei `error`: text-only Fallback (`return { anchor: primary, anchors, composed: false, isMulti }`), `console.warn` mit `sceneId`.
- Verhindert Spinner-Hänger, falls der Worker selbst stirbt bevor er antwortet.

### 3. Client `ClipsTab.tsx › handleGenerateSingle`: Reset bei Fehler

- Im `catch`-Block die optimistische Änderung zurückrollen: `clipStatus` der Ziel-Szene wieder auf den vorigen Wert (i. d. R. `'ready'`) setzen, damit der Spinner verschwindet und der Re-Roll-Button wieder erscheint.
- Aktuell läuft dort nur `toast({ title: 'Fehler' })` — der UI-State bleibt hängen.
- `finally` setzt `singleGenerating` korrekt zurück; das alleine reicht aber nicht, weil `SceneClipProgress` zusätzlich am `clipStatus='generating'` festhängt.

### 4. Client `ClipsTab.tsx`: Ein einzelnes „Festgehängt? Zurücksetzen"-Mini-Action

- In der Karte einer Szene mit `clipStatus='generating'` UND ohne `replicate_prediction_id`-Update seit > 90 s blendet sich ein dezenter Link „Status zurücksetzen" ein, der lokal `clipStatus = 'ready' | 'pending'` (je nach `clipUrl`-Vorhandensein) setzt. Rein Client-Reset, kein DB-Write nötig — Polling holt sich beim nächsten Tick eh den DB-Wahrheit-Wert.

### 5. Acute Recovery für die aktuell hängende Karte

- Beim Mount von `ClipsTab` einmal `pollScenes()` triggern, damit die UI sofort wieder den DB-Stand lädt (Szene 1 ist in der DB ja ready). Dadurch verschwindet der Spinner direkt nach Reload — ohne dass der Nutzer die App neu laden muss.

## Was bewusst NICHT gemacht wird

- Kein neuer Job-Queue / Worker. Die existierende Architektur (compose-video-clips → Replicate-Webhook) ist async-fähig; das Problem liegt ausschließlich im **synchronen Pre-Step** (Nano Banana Compose) ohne Timeout.
- Keine Schema-Änderung an `composer_scenes`.
- Keine Veränderung am Dialog-Studio / Lip-Sync-Pfad.

## Akzeptanz-Kriterien

1. „Neu generieren" auf einer Szene mit 2 Charakteren bleibt nie länger als 60 s ohne Antwort hängen.
2. Wenn die Multi-Portrait-Composition fehlschlägt/timeout, wird transparent mit Single-Portrait/text-only weitergegeben und der Re-Roll geht trotzdem zu compose-video-clips durch.
3. Die aktuell sichtbare Karte mit hängendem Spinner ist nach Reload sofort wieder als „Fertig" zu sehen.

## Geänderte Dateien

- `supabase/functions/compose-scene-anchor/index.ts` (Timeout + Logging)
- `src/lib/motion-studio/prepareSceneAnchor.ts` (Race-Timeout)
- `src/components/video-composer/ClipsTab.tsx` (Catch-Reset, Mount-Poll, Stuck-Reset-Action)
