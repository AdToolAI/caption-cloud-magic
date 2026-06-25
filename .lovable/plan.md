## Fix: Outfit-Dropdown listet 2 vorhandene Looks als "undefined"

### Diagnose
Im Outfit-Picker (`ProductionPlanSheet.tsx`, Z. 105-117) wird das Label so gebaut:
```ts
const lookName = m.meta?.outfitName ?? m.name;
```
Wenn `m.meta` aus irgendeinem Grund nicht durchgereicht wird (z. B. weil ein zukünftiger `dedupe`-Schritt das Objekt flach kopiert oder ein anderer Aggregator die outfit-mention ohne `meta` erzeugt), bleibt nur `m.name`. Dieses `name` wird in `useUnifiedMentionLibrary` (Z. 116) als Template-String gebaut:
```ts
name: `${byAvatar.get(l.avatar_id) ?? 'Avatar'} — ${l.name}`
```
Wenn `l.name` an irgendeiner Stelle undefined ist, entsteht der String `"Samuel Dusatko — undefined"` — exakt das beobachtete Verhalten. In der DB sind die Namen für Samuel ("Casual", "Greek Hoplite") gesetzt, also liegt der Fehler im JS-Pfad, nicht in den Daten.

### Fix (rein UI/Label, kein Pipeline-Touch)

**1. `src/hooks/useUnifiedMentionLibrary.ts`** (Z. 107-137, outfit mapping)
- Defensiv: `const lookLabel = (typeof l.name === 'string' && l.name.trim()) ? l.name.trim() : 'Unbenannter Look';`
- Verwende `lookLabel` sowohl in `name` als auch in `meta.outfitName`, sodass nie ein undefined/null in Template-Strings rutscht.

**2. `src/components/video-composer/briefing/ProductionPlanSheet.tsx`** (Z. 105-117, `outfitsByCharacter`)
- Robusteres Label-Resolving:
  ```ts
  const lookName =
    (m.meta?.outfitName && String(m.meta.outfitName).trim()) ||
    (m.name?.split(' — ')[1] ?? '').trim() ||
    m.name?.trim() ||
    'Unbenannter Look';
  ```
- Zusätzlich Dedupe auf `lookId`, damit derselbe Look bei doppelten Mention-Quellen nicht zweimal auftaucht.

**3. SelectItem-Rendering** (Z. 630-632)
- Hard-Guard: `{o.name || 'Unbenannter Look'}` — letzte Verteidigungslinie, falls oben doch etwas durchrutscht.

### Validierung
- ProductionPlan-Sheet öffnen → Outfit-Dropdown bei Samuel zeigt "Casual" und "Greek Hoplite".
- Smoke-Test: outfit-Row in DB temporär ohne Name → Dropdown zeigt "Unbenannter Look", nicht "undefined".
- Keine Änderungen an Lip-Sync-, Anchor- oder Compose-Pipeline.
