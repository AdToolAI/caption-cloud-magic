## Status

Der letzte Sweep war fast komplett grün:

- **11/12 succeeded**, **Vidu Q2** läuft jetzt ✓ (Q3-Mapping greift), **Pika** korrekt als `expected` (HTTP 410 = Provider-Migration) ✓
- **Hedra Talking Head** bleibt aber in der UI auf `pending` hängen und „springt" — das ist der letzte sichtbare Bug.

## Root Cause

`generate-talking-head` wurde auf **HeyGen** migriert und ist **asynchron**:
- Edge Function returned sofort `{ success: true, status: "processing", videoUrl: null }` und pollt im Hintergrund (1–3 min) via `EdgeRuntime.waitUntil`.
- `qa-live-sweep` interpretiert das via `defaultParse` als **succeeded** (weil `success === true`), würde die Zeile also eigentlich auf grün setzen.

Aber zwei Probleme stören das:

1. **Bootstrap blockiert die Status-Updates**: Vor dem Hedra-Test ruft der Worker `ensureHeyGenTalkingPhoto(adminClient)` synchron auf (qa-live-sweep/index.ts:385). Wenn der HeyGen-Account bereits 3 Photos hat, durchläuft das Prune+Upload und kann 10–30 s dauern — währenddessen bleibt die Zeile auf `pending`, das UI pollt alle 3 s und re-rendert ohne Statuswechsel → optisches „Springen".
2. **Async ≠ Succeeded**: Selbst wenn die Zeile auf grün wechselt, ist das Video objektiv noch nicht fertig — `videoUrl` ist `null`. Wir markieren also einen async-Job vorzeitig als "succeeded", was die spätere Cockpit-Anzeige (Asset-Preview leer) verfälscht.

## Plan

### 1. Hedra-Zeile sofort auf `running` setzen, bevor der Bootstrap startet
In `qa-live-sweep/index.ts` den Bootstrap-Block (Zeilen 382–397) **nach** das `Mark as running`-Update (Zeile 412) verschieben. So sieht der User sofort die Spinner-Animation für Hedra statt eines stummen `pending`.

### 2. Async-Status erkennen statt fälschlich als "succeeded" zu markieren
Custom `parseResponse` für den Hedra-Test ergänzen, der `status: "processing"` + `videoUrl: null` als **`async_started`** klassifiziert (neue Status-Variante neben succeeded/failed/timeout/expected/skipped_budget).

```typescript
// In ProviderTest für Hedra:
parseResponse: (json) => {
  if (!json || json.error) return { success: false, error: json?.error };
  if (json.success && json.status === "processing" && !json.videoUrl) {
    return { success: true, asyncStarted: true, predictionId: json.predictionId };
  }
  return defaultParse(json);
},
```

`callProvider` und das DB-Update so erweitern, dass bei `asyncStarted: true` der Status `async_started` in `qa_live_runs` geschrieben wird (mit `predictionId` in `raw_response`).

### 3. UI: neuen Status `async_started` rendern
In `LiveSweepPanel` (oder vergleichbar) das Badge mit gelbem „läuft im Hintergrund (HeyGen-Polling, 1–3 min)" anzeigen. Kein roter Bug, kein grünes Häkchen — explizit ehrlich.

### 4. Optional: Sweep-Progress-Counter anpassen
Der Counter „11/12 grün" sollte `async_started` als „in flight" zählen, nicht als pending, damit der Balken korrekt füllt.

### 5. Re-Deploy + Verifikation
- `qa-live-sweep` neu deployen
- Einen Sweep auslösen
- Erwartung: Hedra-Zeile geht **direkt** von `pending → running → async_started` (gelb), kein Springen mehr; alle anderen 11 bleiben grün.

## Files

- `supabase/functions/qa-live-sweep/index.ts` (Bootstrap-Reihenfolge, Hedra-`parseResponse`, neuer Status)
- `src/components/admin/LiveSweepPanel.tsx` o.ä. (neues Status-Badge `async_started`)

## Bugs nach diesem Fix

Mit dem Vidu-Q3-Mapping, der Pika-Expected-Annotation und diesem Hedra-Async-Fix sollten **alle bekannten Sweep-Bugs** geschlossen sein. Die Live-Sweep-Anzeige ist dann konsistent: succeeded / async_started / expected / failed / timeout / skipped_budget — kein hängendes `pending` mehr.

Soll ich loslegen?