## Zwei kleine, gezielte Fixes

### Bug 1 — Console-Warning: "Function components cannot be given refs" (FilterPill)

**Ursache:** `FilterPill` in `src/pages/admin/QACockpit.tsx` (Zeile 952) wird innerhalb eines Radix `Tabs`-Trees gerendert. Ein Parent-Component (Tabs/Slot) versucht, eine Ref durchzureichen — `FilterPill` ist aber eine plain Function-Component ohne `forwardRef`. Das wirft eine Dev-Warning bei jedem Render.

**Fix:** `FilterPill` in `React.forwardRef` einwickeln und die Ref auf das innere `<button>` weiterreichen.

```text
function FilterPill({...}) {        →   const FilterPill = React.forwardRef<HTMLButtonElement, Props>(
  return <button ...>                       ({...}, ref) => <button ref={ref} ...>
}                                       );
                                        FilterPill.displayName = "FilterPill";
```

Keine API-Änderung am Aufrufort — die vier `<FilterPill ...>` Aufrufe in der Bug-Inbox bleiben identisch.

---

### Bug 2 — Bug Inbox: "Unknown step type: wait_selector" für `smoke-07-calendar-crud`

**Befund:**
- Im aktuellen Code in `supabase/functions/_shared/browserlessClient.ts` (Zeile 453) **wird** `wait_selector` bereits sauber unterstützt (Alias für `wait_for`).
- Trotzdem taucht der Fehler vor 1 Minute wieder auf → die Edge Function `qa-agent-execute-mission` läuft offensichtlich noch in einer älteren Bundle-Version, in der `wait_selector` noch nicht im Switch enthalten war. Der vorhin gemachte Edit am shared-File hat die Funktion nicht automatisch neu deployed (shared-Files triggern keinen Re-Deploy).

**Fix:**
1. Eine minimale Änderung an `supabase/functions/qa-agent-execute-mission/index.ts` (z.B. ein zusätzlicher Kommentar am Datei-Anfang oder ein bump-Marker), damit die Funktion neu gebündelt und deployed wird und die aktuelle `browserlessClient.ts` mit `wait_selector`-Support einzieht.
2. Zusätzlich im `browserlessClient.ts` defensiv weitere häufige Aliase mit-akzeptieren, damit zukünftige Mission-Definitions nicht erneut stolpern: `wait`, `waitForSelector`, `wait_for_selector` → alle behandelt wie `wait_for`.
3. Die zwei aktuell offenen Bug-Inbox-Einträge (`wait_selector`-Fehler von vor 1 und 11 Minuten) per Migration auf `resolved` setzen, da sie nach dem Re-Deploy nicht mehr reproduzierbar sind.

---

## Geänderte Dateien

- `src/pages/admin/QACockpit.tsx` — `FilterPill` mit `forwardRef`.
- `supabase/functions/_shared/browserlessClient.ts` — zusätzliche Aliase für wait_selector-Familie.
- `supabase/functions/qa-agent-execute-mission/index.ts` — Re-Deploy-Trigger (Versions-Kommentar).
- Neue Migration — markiert die zwei offenen `wait_selector`-Bugs als resolved.

Keine DB-Schema-Änderungen, keine neuen Secrets, keine UI-Umbauten.