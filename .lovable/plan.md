## Ziel

Die redundante "Brand Character"-Zeile (Single-Select) im AI Video Studio entfernen, wenn Kling Omni aktiv ist, da das neue Unified Cast & Lip-Sync Panel bereits die Charakter-Auswahl (bis zu 4) übernimmt. Andernfalls kann derselbe Charakter zweimal ausgewählt werden — einmal im BrandCharacterSelector und einmal im Cast-Panel.

## Änderung

**Datei:** `src/components/ai-video/ToolkitGenerator.tsx` (Zeilen 862–868)

Die `<Card>` mit `<BrandCharacterSelector />` wird konditional gerendert — nur wenn **nicht** Kling Omni:

```tsx
{!isKlingOmni && (
  <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60">
    <BrandCharacterSelector
      value={brandCharacter?.id ?? null}
      onChange={setBrandCharacter}
    />
  </Card>
)}
```

## Warum nur bei Omni ausblenden

- Für alle anderen Modelle (Kling 3, Hailuo, Veo, HappyHorse …) bleibt der klassische Brand-Character-Lock nützlich, da der `ToolkitCastWorldPicker` dort weiterhin die einzige Cast-Quelle ist und der Lock als Cross-Studio-Kontinuität dient.
- Nur bei Omni ist das neue Unified Panel die alleinige Quelle für Charaktere → dort ist die Zeile redundant und widersprüchlich.

## Nicht betroffen

- `brandCharacter`-State und Analytics/Usage-Tracking bleiben erhalten (werden nur nicht mehr via UI im Omni-Modus gesetzt).
- Kein Backend-Change.
- Andere Modelle unverändert.
