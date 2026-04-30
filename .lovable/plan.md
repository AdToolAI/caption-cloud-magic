## Die 3 Bugs

### 1. `Unknown step type: wait_selector` (smoke-07-calendar-crud)
Im letzten Loop wurde die Mission auf `[data-testid="calendar-page"]` umgestellt, **aber** der Step-Typ `wait_selector` ist im `browserlessClient.ts`-Switch gar nicht implementiert — nur `wait_for` existiert. Jede `wait_selector`-Mission wirft sofort.

**Fix:** In `supabase/functions/_shared/browserlessClient.ts` (Zeile ~453) `wait_selector` als Alias zu `wait_for` ergänzen:

```js
else if (step.type === 'wait_for' || step.type === 'wait_selector') {
  await page.waitForSelector(step.selector, { 
    visible: true, 
    timeout: clampStep(step.timeout_ms || 10000) 
  });
}
```

Danach verschwindet der "Unknown step type"-Bug für smoke-07 — die Mission selbst funktioniert ja, nur der Handler fehlt.

### 2. `Console: Failed to load resource: status of 400` (smoke-10-brand-characters)
Der Bug-Report ist generisch (keine URL im Text), aber der Pattern matcht nicht den existierenden Mute-Filter `Failed to load resource.*sentry`. Brand-Characters-Page macht keinen 400er-eigenen Call — sehr wahrscheinlich ein PostHog/Sentry/Recorder-Endpoint, der in Browserless-Sessions ohne CORS-Whitelist 400 zurückgibt (analog zu den Sentry-CORS-Blocks).

**Fix in zwei Schritten:**

**a) Console-Logger im Browser-Script anreichern** (`browserlessClient.ts`, console-collector-Block oben): Statt nur den Error-Text zu pushen, auch die URL aus dem ersten arg/Stack extrahieren — damit der nächste Bug "Console: Failed to load resource: status of 400" zur Quell-URL nachvollziehbar ist:

```js
const urlMatch = String(args[0]).match(/https?:\/\/[^\s"')]+/);
const sourceUrl = urlMatch ? urlMatch[0] : (e.location?.url ?? '');
consoleLogs.push({ type, text, url: sourceUrl, ts: Date.now() });
```

**b) Mute-Pattern erweitern** in der DB (`qa_console_mute_patterns` Tabelle): generische `Failed to load resource: the server responded with a status of 4\d\d \(\)$` mit leerer URL als analytics/posthog/sentry-Noise mute (die App-eigenen 400er liefern immer eine URL mit). Plus: bestehenden offenen Bug-Report resolven.

### 3. React-Warning "Function components cannot be given refs" (Badge in QACockpit)
Der Console-Log zeigt: `Badge` wird als Forward-Ref-Ziel benutzt (vermutlich in einem Tooltip-Trigger oder Tabs-Trigger im Cockpit), aber `src/components/ui/badge.tsx` ist eine plain Function-Component ohne `forwardRef`.

**Fix:** `src/components/ui/badge.tsx` auf `React.forwardRef` umstellen — Standard-shadcn-Pattern, keine API-Änderung:

```tsx
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = "Badge";
```

Das eliminiert die Warnung global (Badge wird an vielen Stellen in Tooltips/Triggern benutzt).

## Files

- `supabase/functions/_shared/browserlessClient.ts` — `wait_selector` Alias + URL-Extraktion in Console-Logger
- `src/components/ui/badge.tsx` — `forwardRef`
- Migration: Mute-Pattern für "status of 4xx ()"-ohne-URL + Bulk-resolve der `smoke-07` "Unknown step type"-Bugs und des `smoke-10` 400-Bugs

## Erwartetes Ergebnis

- smoke-07-calendar-crud: 4/4 grün
- smoke-10-brand-characters: 400-Console-Noise gemutet, Bug raus
- QA-Cockpit-Tab: Keine Badge-ref-Warning mehr
- Künftige "status of 400"-Bugs liefern die Source-URL → echte App-400er bleiben sichtbar, Browserless-Noise wird stumm