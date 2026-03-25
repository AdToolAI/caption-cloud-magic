

## Fix: KI Picture Studio "Nicht genuegend Credits" Fehler

### Ursache
Der `ImageGenerator` verwendet `featureCode: 'background_scene_generation'`, aber dieser Code existiert nicht in der `feature_costs` Datenbank-Tabelle. Dadurch gibt `credit-reserve` einen 400-Fehler "Feature not found" zurueck, der faelschlicherweise als "Nicht genuegend Credits" angezeigt wird.

### Aenderungen

#### 1. Datenbank-Migration: Neuen Feature-Code einfuegen

```sql
INSERT INTO feature_costs (feature_code, credits_per_use)
VALUES ('studio_image_generate', 5);
```

#### 2. `src/lib/featureCosts.ts` — Neuen Feature-Code hinzufuegen

- `FEATURE_COSTS.STUDIO_IMAGE_GENERATE = 'studio_image_generate'` hinzufuegen
- `ESTIMATED_COSTS.studio_image_generate = 5` hinzufuegen

#### 3. `src/components/picture-studio/ImageGenerator.tsx` — Feature-Code korrigieren

Zeile 92-93: `featureCode` von `'background_scene_generation' as any` auf `FEATURE_COSTS.STUDIO_IMAGE_GENERATE` aendern, und `estimatedCost` auf `ESTIMATED_COSTS.studio_image_generate`.

### Dateien
1. DB-Migration: `studio_image_generate` Feature-Code einfuegen
2. `src/lib/featureCosts.ts` — Neuen Code registrieren
3. `src/components/picture-studio/ImageGenerator.tsx` — Feature-Code Fix

