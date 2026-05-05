## Problem

Beim Öffnen von `/ai-text-studio` crasht die Seite mit:
> A `<Select.Item />` must have a value prop that is not an empty string.

Ursache: In `src/pages/AITextStudio.tsx` Zeile 262 steht:
```tsx
<SelectItem value="">— Keine —</SelectItem>
```
Radix UI verbietet leere Strings als Select-Wert (sie sind reserviert, um die Selection zu clearen).

## Fix (1 Datei)

**`src/pages/AITextStudio.tsx`**

1. Sentinel-Wert `"none"` statt leerem String für die "Keine Persona"-Option:
   ```tsx
   <SelectItem value="none">— Keine —</SelectItem>
   ```
2. State-Initialisierung und Handler entsprechend anpassen:
   - `personaId` default = `"none"`
   - Vor dem Senden an `text-studio-chat`: wenn `personaId === "none"` → `undefined` übergeben
3. `<Select value={personaId || "none"} onValueChange={setPersonaId}>` absichern, damit ein leerer Initial-State nicht erneut crasht.

## Bonus-Check

Während der Investigation gleich verifizieren, dass die Modell-IDs in `src/lib/text-studio/models.ts` (insb. Claude 4.1 Opus) gegen die aktuelle Anthropic API-Bezeichnung gemappt sind — sonst gibt's beim ersten Chat-Send einen 404 vom Anthropic-Endpoint. Falls falsch benannt, korrigiere ich auf den offiziellen Modell-String (`claude-opus-4-1-...`).

## Erwartetes Ergebnis

- `/ai-text-studio` lädt ohne Error-Boundary.
- "Keine Persona" funktioniert wie vorher.
- Modell-Dropdown inkl. Claude bleibt auswählbar; erster Test-Chat geht durch.
