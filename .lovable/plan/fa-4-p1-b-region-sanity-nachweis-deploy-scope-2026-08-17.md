# FA-4/P1-B — Region-Sanity-Nachweis + Deploy-Scope

Status: Implementation VERIFIED. Deploy CONDITIONAL GO — dieser Plan liefert genau den geforderten Zusatznachweis und den Importer-Scope. Keine Migration, kein neuer Render.

## 1. AWS-Region-Sanity (der eine Zusatznachweis)

Aktueller Code (`supabase/functions/_shared/resolveIdentityViaRekognition.ts`, Zeilen 32–39):

```text
DEFAULT_REKOGNITION_REGION = "eu-central-1"
AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d$/
resolveRekognitionRegion(): REKOGNITION_REGION (validiert) -> AWS_REGION (validiert) -> Default
```

Nachweis als isolierter Deno-Test (`resolveIdentityViaRekognition.region.test.ts`, nur Testdatei, keine Produktionsänderung):

- R1: `AWS_REGION=eu-central-1` → `eu-central-1` (unverändert akzeptiert)
- R2: `AWS_REGION=us-east-1`, `REKOGNITION_REGION` leer → `us-east-1`
- R3: `AWS_REGION=Global` (produktiv beobachtet) → Fallback `eu-central-1`
- R4: beide leer/whitespace → `eu-central-1`
- R5: `REKOGNITION_REGION` gültig schlägt `AWS_REGION` — Auswahlreihenfolge unverändert
- R6: Modul-Import ohne ReferenceError (Regression gegen die fehlende Konstante)

Zusätzlich als Diff-Beleg: bestätigen, dass ausschließlich die Konstantendefinition wiederhergestellt wurde — keine Änderung an `MIN_SIMILARITY`, IoU-Schwellen, Timeout oder Endpoint-Bildung.

## 2. Importer-Scope (repo-weit belegt)

Import-Kanten der geänderten Shared-Dateien:

```text
image-encoding-cache.ts
  └─ resolveIdentityViaRekognition.ts
       ├─ plateFaceSlotRouter.ts
       │     ├─ compose-video-clips/index.ts
       │     └─ compose-dialog-segments/index.ts
       └─ compose-video-clips/index.ts (direkt)
```

Weitere Treffer: nur die Testdatei. Damit sind die produktiven Bundles:

- `compose-video-clips`
- `compose-dialog-segments`

## 3. Deploy + Abschluss

1. Region-Tests + bestehende T1–T6 laufen lassen — alle grün, sonst STOP.
2. Deploy `compose-video-clips`, danach `compose-dialog-segments`. Keine Migration.
3. Boot-Smoke beider Functions (Cold-Boot ohne ReferenceError, Region-Log/Endpoint plausibel).
4. `T_FA4_P1B_effective` festhalten und Nachweise in `docs/v433-motion-studio-final-acceptance.md` dokumentieren.
5. STOP vor neuem FA-4-Render.
