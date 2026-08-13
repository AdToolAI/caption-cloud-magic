# v430 5D — Nachtrag: `plate_queued` in `composer-cancel-project`

## Befund (aus dem alten Code belegt)

Alte Bedingung (Commit `c8cc96b2e`, `composer-cancel-project/index.ts:135-136`):

```ts
const cs = s.clip_status;
if (cs === "pending" || cs === "generating") { ... }
```

`composer-cancel-scene` hatte dagegen:

```ts
const LIVE_CLIP = new Set(["pending", "queued", "generating", "composing", "lipsync"]);
```

Die beiden Pfade waren also schon vor 5D unterschiedlich — `queued` fehlte im Projekt-Abbruch. Meine Migration hat diese Asymmetrie 1:1 gespiegelt.

**Aber:** die Migration ist trotzdem nicht paritätstreu. Die Rückwärts-Bridge (`deriveStateFromLegacy`) bildet ab:

```text
clip_status 'pending' | 'queued'  + active_run_id  -> plate_queued
clip_status 'pending'             ohne active_run_id -> idle
clip_status 'generating'                            -> plate_rendering
```

Der alte Code fing über `pending` also **auch** Szenen ab, die heute `plate_queued` sind (gequeuet, mit `active_run_id`). Mein neues Set `{idle, plate_rendering}` verliert genau diese Menge. Das ist die vom Nutzer vermutete Lücke: eine gerade dispatchte Szene würde beim Projekt-Abbruch nicht mehr gecancelt.

Korrekte 1:1-Äquivalenzmenge zu `pending | generating` ist daher:

```text
idle | plate_queued | plate_rendering
```

Das ist identisch mit `composer-cancel-scene` (dessen zusätzliche Legacy-Werte `composing`/`lipsync` von der Bridge nie erzeugt werden und ohnehin in denselben Zustandsraum fallen). Beide Cancel-Pfade werden damit deckungsgleich — was auch semantisch gewollt ist.

## Änderung

1. `supabase/functions/composer-cancel-project/index.ts`
   - Zustandsprüfung auf `idle | plate_queued | plate_rendering` erweitern.
   - Gemeinsame Konstante `LIVE_CLIP_STATES` analog zu `composer-cancel-scene`, mit Kommentar zur Bridge-Herleitung (`pending`+run_id ⇒ `plate_queued`).
   - Lip-Sync-Zweig (`lip_sync_status`) bleibt unverändert.
2. `src/lib/composer/__tests__/legacyReadyParity5D.test.ts`
   - Test ergänzen: beide Cancel-Funktionen verwenden dieselbe Live-Zustandsmenge inkl. `plate_queued`.
   - Bridge-Paritätstest: `{clip_status:'pending', active_run_id:'r1'}` ⇒ `plate_queued` ⇒ muss als abbrechbar gelten.
3. Deploy `composer-cancel-project`, Vitest + tsgo, dann STOP.

## Hinweis zum Deno-Check

Der `deno check`-Fehler stammt aus der Sandbox: `npm:replicate@0.25.2` ist im Sandbox-`node_modules` nicht auflösbar, der Abbruch passiert beim Modulgraph-Aufbau **vor** jeder Typ- oder Testauswertung. Er betrifft keinen der geänderten Contracts; Deployment und Laufzeit sind davon nicht berührt.

## Danach

5D ist geschlossen; 5E (Client-Reader-Migration) startet separat.
