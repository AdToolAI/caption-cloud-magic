## Was zeigt der neue Run

```
Flow 1 Composer Stitch         success   ✓
Flow 2 Director's Cut Lambda   FAILED    AWS Concurrency limit reached (Rate Exceeded)
Flow 3 Auto-Director           success   ✓
Flow 4 Talking Head            skipped   (Hedra-Modell entfernt — bekannt)
Flow 5 Universal Video         success   ✓
Flow 6 Long-Form Render        FAILED    "reported failed status" — gleicher AWS-Throttle
Flow 7 Magic Edit              skipped   sample-mask-512.png nicht im Bucket
```

Die zwei echten neuen Bugs:

### Bug A — AWS Lambda Concurrency Throttle (Flow 2 & 6)

`AWS Concurrency limit reached (Original Error: Rate Exceeded)` kommt **direkt beim Aufruf von `callLambda`** (3 s nach Trigger), nicht beim Render selbst. Ursache: Composer-Stitch (Flow 1) startet Lambda-Worker, die noch warm/aktiv sind, wenn Flow 2 sofort danach den nächsten Lambda anstößt → AWS-Account-Quota voll. Long-Form (Flow 6) erbt das gleiche Problem und meldet sofort `failed`.

Aktuell: keine Wiederholung, kein Cooldown. Ein einziger 429-artiger Throttle killt den Flow.

### Bug B — Flow 7 Magic Edit braucht Bootstrap

`sample-mask-512.png` fehlt im `qa-test-assets`-Bucket. Bootstrap-Code existiert, aber niemand hat ihn nach dem letzten Code-Update geklickt. Reine UX-Lücke.

## Fix-Plan

### 1. Lambda-Throttle-Resilience im Deep Sweep (`qa-weekly-deep-sweep/index.ts`)

a) **Cooldown nach Composer-Stitch** — vor Flow 2 ein `await sleep(15_000)` einfügen, damit AWS Lambda Concurrency frei wird, bevor der nächste Render-Trigger kommt. Selbes vor Flow 6.

b) **Retry-Helper mit Backoff** — kleine Funktion `triggerRenderWithBackoff(name, body, userId)` die bei `Rate Exceeded` / `Concurrency limit` / HTTP 429 bis zu 3× mit 10/20/40 s wartet, bevor sie aufgibt. Wird in Flow 2 (`render-directors-cut`) und Flow 6 (`render-long-form-video`) genutzt.

c) **Klassifikation als `timeout` statt `failed`** wenn die Ursache nachweislich AWS-Throttling ist (Pattern-Match auf `Rate Exceeded` / `Concurrency limit`). Damit verbrennt der Run keine Credits in der Statistik und das Cockpit zeigt korrekt "Infrastruktur-Engpass" statt "Bug".

### 2. Magic-Edit-Hinweis im Cockpit (`src/pages/admin/DeepSweepTab.tsx`)

Wenn `flow_index === 7 && status === 'budget_skipped' && error_message` den String `Bootstrap Assets` enthält → einen **"Bootstrap jetzt ausführen"**-Button **direkt unter der Flow-Zeile** anzeigen, der `qa-live-sweep-bootstrap` aufruft. Spart den Tab-Wechsel.

### 3. Bessere Error-Surfacing im Long-Form-Flow

In Flow 6 (`flowLongFormRender`): wenn `polled.status === 'failed'`, das echte `error_message` aus `sora_long_form_projects` mitlesen statt nur "reported failed status" zu schreiben. So sieht man im Cockpit, dass es wirklich AWS-Throttle war.

## Geänderte Dateien

- `supabase/functions/qa-weekly-deep-sweep/index.ts`
  - Helper `sleep(ms)` und `triggerRenderWithBackoff()` (~25 LOC)
  - Flow 2 + Flow 6 nutzen Backoff-Helper statt direkt `callEdge`
  - 15-s-Cooldown nach Flow 1 (vor Flow 2) und nach Flow 5 (vor Flow 6)
  - Flow 6: zusätzlich `error_message` aus DB lesen
- `src/pages/admin/DeepSweepTab.tsx`
  - "Bootstrap jetzt ausführen"-Inline-Button für Magic-Edit-Skip-Zeile

## Erwartetes Verhalten nach Fix

- Flow 2 & 6: bei Lambda-Throttle bis zu 3× automatischer Retry → meistens grün; bei echter AWS-Quota-Erschöpfung als `timeout` mit klarer Meldung markiert
- Flow 7: User sieht direkt im Run einen Klick-Button, klickt einmal, beim nächsten Run grün
- Gesamtlaufzeit steigt im Worst-Case um ~30 s (15 s Cooldown × 2) — bleibt sicher unter dem Edge-Function-Wall-Clock-Limit (jetzt ~2.5 min total)

Hedra (Flow 4) bleibt skipped — das ist ein eigener Provider-Migrations-Task und nicht Teil dieses Fixes.
