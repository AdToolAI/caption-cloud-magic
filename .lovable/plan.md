## Problem

Alle 7 Sora-2-Szenen schlugen fehl. Die Edge-Function-Logs zeigen zwei klare Ursachen:

**1. Replicate Rate Limit (429 Too Many Requests) — Hauptursache**
Replicate drosselt `openai/sora-2` extrem aggressiv (~1 Request alle 5–10 Sekunden pro Account). Wir feuern alle Sora-Szenen praktisch gleichzeitig in einer engen `for`-Schleife ab. Nur die allererste geht durch, alle restlichen bekommen 429 mit `retry_after: 5–10s` und werden sofort als `failed` markiert.

**2. Aspect-Ratio-Validierung (422 Unprocessable Entity)**
Wir senden `aspect_ratio: "16:9"` an Sora 2, aber Replicate akzeptiert nur `"portrait"` oder `"landscape"`. Mindestens eine Szene scheitert deshalb dauerhaft (auch ohne Rate Limit).

## Lösung

### Fix 1 — Sora-2 Aspect-Ratio Mapping (`compose-video-clips/index.ts`, Zeile ~665)

Mapping von Composer-Aspect-Ratios auf Sora-Enum:

```ts
const soraAspect = (scene.aspectRatio === '9:16' || scene.aspectRatio === '3:4')
  ? 'portrait' : 'landscape';
soraInput.aspect_ratio = soraAspect;
```

Genauso für `sora-2-pro` (gleicher Block).

### Fix 2 — Throttling für Sora-2 mit Retry-after-Respektierung

In der Szenen-Schleife (Zeile 285) für `clipSource === 'ai-sora'`:

- **Pre-Delay:** Vor jedem Sora-Call mindestens **6 Sekunden** warten, wenn die vorherige Szene auch Sora war.
- **Retry-Logik:** Bei 429-Antwort die `retry_after`-Sekunden aus der Response parsen und einmalig erneut versuchen, bevor die Szene als `failed` markiert wird (max. 1 Retry, +2s Buffer).
- Andere Modelle (Veo, Luma, Hailuo, Kling) bleiben unangetastet — die haben keine so harten Limits.

Implementierungsskizze:
```ts
// Helper am Modul-Anfang
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastSoraCallAt = 0;

// Im Sora-Block, vor replicate.predictions.create:
const sinceLast = Date.now() - lastSoraCallAt;
if (lastSoraCallAt && sinceLast < 6000) await sleep(6000 - sinceLast);

// Try/Catch mit 429-Retry:
try {
  prediction = await replicate.predictions.create({ ... });
} catch (e: any) {
  const msg = String(e?.message ?? e);
  const m = msg.match(/retry_after"?\s*:\s*(\d+)/);
  if (msg.includes('429') && m) {
    await sleep((parseInt(m[1]) + 2) * 1000);
    prediction = await replicate.predictions.create({ ... }); // einmal retry
  } else {
    throw e;
  }
}
lastSoraCallAt = Date.now();
```

### Fix 3 — UX: "Erneut versuchen"-Button bleibt funktional

Der bestehende Retry-Button pro Szene funktioniert bereits — aber durch Fix 1+2 sollten Failures nun seltener erst gar nicht entstehen. Zusätzlich wird die Fehlermeldung in `composer_scenes` konkreter gespeichert (statt nur `failed`), damit der User im UI lesen kann *warum* (z.B. "Sora Rate Limit — bitte erneut versuchen in 10s").

Optional in derselben Edit-Runde: kleines Banner über der Szenenliste, wenn ≥ 3 Szenen mit `429`/`rate limit` failed sind, mit "Alle fehlgeschlagenen erneut versuchen"-Button.

## Geänderte Dateien

- `supabase/functions/compose-video-clips/index.ts` — Aspect-Ratio-Mapping für Sora, Pre-Delay zwischen Sora-Calls, 429-Retry mit `retry_after`, präzisere Error-Messages.

## Erwartetes Ergebnis

- Sora-2-Szenen werden seriell mit ≥6s Abstand abgefeuert → keine 429 mehr beim ersten Versuch.
- Falls Replicate trotzdem drosselt, wird automatisch einmal nach `retry_after + 2s` erneut versucht.
- Sora akzeptiert das `landscape`/`portrait`-Format → keine 422 mehr.
- Bei 7 Szenen dauert der "Alle generieren"-Start jetzt ~40s (statt sofortigem Fail aller Szenen) — die eigentliche Generierung läuft danach asynchron im Hintergrund wie bisher.
