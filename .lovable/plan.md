## Diagnose

Der Build-Fehler ist nur ein generisches "Check…"-Log (keine echten Fehler). Das eigentliche Problem ist die UI:

- **MS-24** zeigt noch ein altes Ergebnis von **vor 12 Minuten** (vor dem letzten Deploy). Der Code dazu ist bereits korrekt (`expectReachable: false`). → Verschwindet nach nächstem Run.
- **MS-26** hat noch `expectReachable: true` (Zeile 404 in `supabase/functions/motion-studio-superuser/index.ts`), obwohl der Name explizit „Hardening" sagt. Dadurch greift die neue generalisierte Hardening-Logik nicht und der HTTP 500 („Project not found") wird als Warnung gewertet.

## Fix (1 Zeile)

In `supabase/functions/motion-studio-superuser/index.ts`, Zeile 404:

```diff
   {
     name: "MS-26: Composer Bundle Export Hardening",
     category: "fast",
     fn: "composer-export-bundle",
     body: () => ({ projectId: "00000000-0000-0000-0000-000000000000" }),
-    expectReachable: true,
+    expectReachable: false,
     optional: true,
   },
```

Damit greift der bereits vorhandene Runner-Block:

```typescript
const isHardeningPass =
  !scenario.expectReachable && response.status >= 400 && hasStructuredError;
```

→ HTTP 500 mit `{"error":"Project not found"}` = **strukturierte Fehlerantwort** = **Pass**.

## Deployment

`motion-studio-superuser` Edge Function neu deployen.

## Erwartetes Ergebnis nach „Fast Run"

- ✅ MS-24: Pass (Hardening: HTTP 500 mit error-Body)
- ✅ MS-26: Pass (Hardening: HTTP 500 mit error-Body)
- **22/22 (100%)** im Fast Run, 0 Fehler, 0 Warnungen.