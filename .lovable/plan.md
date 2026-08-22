# V445 — Split-Screen-Plate + Preclip-Geometrie-Mismatch (RCA belegt, Fix eng begrenzt)

Zwei getrennte Ursachen, beide durch DB-Beweise aus Szene S11
(`e658509d-cdeb-40f7-bd33-98e74144fdc5`, Run `56a5df25…`) belegt. Kein Rückschritt
in der Kette — beide Fehler liegen **vor** dem eingefrorenen Lip-Sync-Pfad.

## Befund 1 — Die Plate ist tatsächlich ein 4-fach Split-Screen

Die final zugewiesenen Gesichtszentren der Szene lauten:

```text
176 / 283      486 / 278      804 / 285      1135 / 276
```

Vier Gesichter, exakt gleiche Höhe (y-Spread 9 px ≈ 1,2 % der Bildhöhe), nahezu
gleiche horizontale Abstände (310 / 318 / 331 px). Das ist genau das Muster, das
der Anti-Split-Screen-Vertrag verhindern soll. Der bestehende Split-Screen-Detektor
in `compose-dialog-segments` hat nicht gegriffen, weil er **alle drei** Kriterien
gleichzeitig verlangt (y-Spread ≤ 5 %, x-Gap-Spread ≤ 8 %, Höhen-Spread ≤ 10 %) —
hier liegt der Gap-Spread bei ~3 %, aber ein Kriterium reißt die Schwelle und der
Block fällt komplett aus. Der Nutzer bekommt das Panel-Bild statt einer Absage.

## Befund 2 — Preclip-Crop und Ziel-Bbox stammen aus verschiedenen Messungen

Pass 4 (Samuel) failt mit `preclip_identity_geometry_mismatch`:

```text
target = [380, 138, 592, 419]   → 212 x 281 px
crop   = [350, 144, 622, 416]   → 272 x 272 px
```

Die Ziel-Bbox ist **höher als der Crop** (281 > 272) — Containment ist arithmetisch
unmöglich. `computeMouthCenteredCrop` bemisst den Crop mit
`faceSide / sqrt(0.42) ≈ 1,54 × faceSide`; bei faceSide 281 wären das 433 px. Ein
Crop von 272 px kann also nicht aus derselben Bbox stammen: Crop und Ziel-Bbox
wurden auf unterschiedlichen Messungen (Anchor-Still vs. Plate) berechnet. Das ist
dieselbe Klasse von Fehler wie v400/v361 — nur an einer bisher ungeprüften Stelle.

## Umfang des Fixes

1. **Split-Screen-Gate härten** (`compose-dialog-segments`)
   - Klassifikation von UND auf gewichtetes ODER umstellen: y-Spread ≤ 5 % **und**
     (Gap-Spread ≤ 15 % **oder** Höhen-Spread ≤ 15 %) genügt ab N ≥ 3.
   - Trefferfall bleibt unverändert: Dispatch blockiert, lokalisierte Meldung,
     bestehender idempotenter Refund-Pfad (v117).
   - Kein neuer Provider-Call, keine Änderung an Schwellen der Lip-Sync-Kette.

2. **Geometrie-Kohärenz erzwingen** (Preclip-Berechnung)
   - Crop und Ziel-Bbox müssen aus **derselben** Messung derselben URL stammen.
     Der Crop wird künftig aus der final zugewiesenen Plate-Bbox neu berechnet,
     nicht aus einer früheren Anchor-Messung übernommen.
   - Zusätzlich harte Untergrenze: `crop.size ≥ max(faceW, faceH)` plus die
     bestehende Face-Share-Regel — ein Crop, der das Gesicht nicht einschließen
     kann, wird gar nicht erst erzeugt.
   - Das Containment-Gate selbst bleibt unverändert fail-closed (keine Toleranz,
     kein Padding).

3. **Diagnose statt Rätselraten**
   - Bei `preclip_identity_geometry_mismatch` wird zusätzlich protokolliert, aus
     welcher URL Crop-Messung und Bbox-Messung stammen (`crop_measure_src`,
     `bbox_measure_src`), damit ein Wiederauftreten in einem Log sichtbar ist.

## Tests

- Deno-Regression für den Split-Screen-Detektor mit den echten S11-Zentren
  (`176/486/804/1135 @ y≈280`) → muss als `split_screen_layout` klassifizieren.
- Deno-Regression für die Crop-Untergrenze: Bbox 212×281 darf keinen 272-px-Crop
  mehr erzeugen; Containment muss danach passieren.
- Bestehende Suites (`lipsync-frozen-contract`, `preclip-crop-containment`,
  Vitest-Composer) müssen unverändert grün bleiben.

## Ausdrücklich nicht in diesem Gate

Kein S11-Rerender, kein Provider-Lauf, keine Frontend-Publikation, keine
DB-Migration, keine Änderung an Motion-Schwellen, Provider-Vertrag oder Credits.

## Technische Dateien

```text
supabase/functions/compose-dialog-segments/index.ts   (Split-Screen-Klassifikation, Log-Felder)
supabase/functions/_shared/compute-mouth-centered-crop.ts + src/lib/composer/computeMouthCenteredCrop.ts (Untergrenze, 1:1 gespiegelt)
supabase/functions/_shared/pass-face-preclip.ts       (Crop aus finaler Plate-Bbox)
neue Deno-Tests neben den betroffenen Modulen
```

Deploy danach ausschließlich: `compose-dialog-segments`.
