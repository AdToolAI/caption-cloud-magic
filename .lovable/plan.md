# Default Outfit Presets für Cast-Slots

## Ziel
Jeder Cast-Slot bekommt einen Outfit-Dropdown — auch wenn der User noch keine eigenen Looks in `avatar_outfit_looks` gespeichert hat. Der Dropdown enthält dann 10 kuratierte Standard-Outfits, die die häufigsten Werbe-/Content-Kontexte abdecken. Wählt der User einen Preset, wird der Text als Outfit-Beschreibung in den Scene-Prompt injiziert (kein DB-Insert, kein Reference-Image — reiner Prompt-Layer).

## Preset-Katalog (10 Slots, sprachneutral gehalten)
Neue Datei `src/config/defaultOutfitPresets.ts`:

```ts
export interface DefaultOutfitPreset {
  id: string;           // stabile Kennung, z.B. 'preset:business-casual'
  label: { de: string; en: string; es: string };
  promptFragment: string; // englisch (Bildqualität)
}
```

Katalog (Business → Lifestyle → Sport → Formal):
1. **Business Casual** — "smart casual outfit, neat button-down shirt, chinos"
2. **Business Formal** — "tailored dark business suit, crisp white shirt"
3. **Modern Streetwear** — "modern streetwear, oversized hoodie, cargo pants, sneakers"
4. **Everyday Casual** — "clean casual outfit, plain t-shirt, denim jeans"
5. **Sport / Athleisure** — "athletic activewear, fitted training top, joggers"
6. **Fitness Studio** — "gym outfit, tank top and shorts, athletic sneakers"
7. **Outdoor / Adventure** — "outdoor jacket, hiking pants, sturdy boots"
8. **Elegant Evening** — "elegant evening wear, sleek dress or dark blazer"
9. **Creative / Artistic** — "creative fashion, expressive layered outfit, statement accessories"
10. **Loungewear / Cozy** — "cozy loungewear, soft sweater, relaxed pants"

Diese decken B2B-Ads, Lifestyle, Fitness, Fashion, Wellness ab.

## Änderungen (nur Frontend)

### 1. `src/config/defaultOutfitPresets.ts` (neu)
Konstante Liste + Typ oben.

### 2. `src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- Import `DEFAULT_OUTFIT_PRESETS`.
- `showOutfitPicker` (Zeile 1215) auf `!!baseId` setzen — der Picker erscheint sobald ein Character gewählt ist, unabhängig davon ob Library-Looks existieren.
- Im `<SelectContent>` (Zeile 1241-1246):
  - `Standard-Look` bleibt als Default.
  - Danach: falls `merged.length > 0`, deren Items rendern.
  - Falls **keine** Library-Looks existieren: kurze `<SelectLabel>Vorschläge</SelectLabel>` + 10 Preset-Items (`value={preset.id}` = `preset:<id>`, label sprachabhängig).
- `updateSceneCastOutfit` erweitern: wenn `v` mit `preset:` beginnt, speichern als `outfitLookId=null` PLUS neuem Feld `outfitPreset: string` (Prompt-Fragment) am Cast-Slot. Sonst weiter wie bisher.

### 3. `src/lib/video-composer/briefing/productionPlan.ts`
Zod-Schema `PlanCastSlot`: optionales Feld `outfitPreset: z.string().optional().nullable()` hinzufügen (nicht-brechend, backend ignoriert es).

### 4. `src/hooks/useApplyProductionPlan.ts`
Beim Merge in die Szene: `outfitPreset` als zusätzliches Prompt-Suffix an `sceneDescription` / Cast-Wardrobe-Feld anhängen (wie bereits `moodSuffix` behandelt wird). Kein Schreiben nach `avatar_outfit_looks`, kein Impact auf Lip-Sync-Guards.

## Explizit NICHT ändern
- `avatar_outfit_looks` bleibt unangetastet (kein DB-Insert für Presets).
- Edge-Function `briefing-deep-parse` — Presets sind rein UI/Prompt-seitig.
- LipSync-, Anchor-, Render-Pipeline — Presets landen nur im Scene-Prompt-Text.
- `useUnifiedMentionLibrary` — bleibt.

## Verifikation
- Neuer Test-Account ohne gespeicherte Outfits: Briefing parsen → jeder Cast-Slot zeigt Outfit-Dropdown mit "Standard-Look" + 10 Presets.
- Account mit gespeicherten Looks: Library-Looks zuerst, dann Divider + Presets als Fallback-Optionen.
- Preset wählen → Scene-Prompt enthält das englische Fragment; kein Fehler beim Anwenden; keine Lip-Sync-Szene wird überschrieben.
- Sprachumschaltung DE/EN/ES ändert nur die Labels im Dropdown, nicht das Prompt-Fragment.
