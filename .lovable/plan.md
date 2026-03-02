
# Root-Cause-Analyse: Schema-Mismatch in InputProps

## Das eigentliche Problem

Nach intensiver Code-Analyse habe ich entdeckt, dass der `reading 'length'`-Fehler hoechstwahrscheinlich **nicht von Lottie** stammt, sondern von **ungültigen Enum-Werten** in den `inputProps`, die an das Remotion-Bundle gesendet werden. Diese verursachen einen Zod-Schema-Validierungsfehler im Lambda-Renderer.

### Beweis: Ungültige Enum-Werte im Payload

In `supabase/functions/auto-generate-universal-video/index.ts` (Zeilen 449-450):

```text
category: briefing.category || 'marketing'          // 'marketing' ist UNGÜLTIG
storytellingStructure: briefing.storytellingStructure || 'problem-solution'  // 'problem-solution' ist UNGÜLTIG
```

Das Remotion-Schema (`UniversalCreatorVideoSchema`) erwartet aber:

```text
category:  'product-ad' | 'social-reel' | 'explainer' | 'testimonial' | ...
           (NICHT 'marketing')

storytellingStructure:  'hook-problem-solution' | 'aida' | 'pas' | ...
                        (NICHT 'problem-solution')
```

### Warum das den Crash verursacht

- Zod `.default()` greift **nur bei `undefined`**, nicht bei einem ungültigen Wert
- Wenn `'marketing'` als `category` gesendet wird, wirft Zod einen `ZodError`
- Im minifizierten Lambda-Bundle (`/var/task/index.js`) wird dieser Fehler intern verarbeitet und erzeugt dabei den `reading 'length'`-Stack

### Warum die bisherigen Lottie-Fixes nichts geholfen haben

- Das Lottie-System war nie das Problem
- Die Scene-Type-Remappings (solution->intro, etc.) haben die Video-Qualitaet unnoetig reduziert
- Das Problem lag die ganze Zeit im Schema-Transport, nicht im Rendering-Pfad

---

## Umsetzungsplan

### 1. Ungültige Enum-Defaults korrigieren (Hauptfix)

Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Aenderungen:
- `category: briefing.category || 'marketing'` aendern zu `category: VALID_CATEGORIES.includes(briefing.category) ? briefing.category : 'social-reel'`
- `storytellingStructure: ...` aendern zu validiertem Wert mit Fallback `'hook-problem-solution'`

### 2. Scene-Type-Remapping entfernen (Qualitaet wiederherstellen)

Datei: `supabase/functions/auto-generate-universal-video/index.ts`

- Den temporaeren `LOTTIE_TRIGGER_REMAP` Block komplett entfernen
- Originale Scene-Types beibehalten (solution, cta, feature, proof)
- Dadurch werden Lottie-Animationen, Maskottchen und Charakter-Effekte wieder aktiv

### 3. Alle InputProps gegen das Schema validieren

Datei: `supabase/functions/auto-generate-universal-video/index.ts`

Sicherstellen, dass folgende Felder exakt zum Schema passen:
- `subtitleStyle`: nur schema-konforme Felder (`fontWeight: 'bold'` entfernen - nicht im Schema)
- `characterType`: zurueck auf `'lottie'` oder dynamisch (statt erzwungenem `'svg'`)
- Extra-Felder die nicht im Schema sind werden von Zod gestrippt - das ist OK

### 4. Robuste Enum-Validierung als Utility

Einen kleinen Helper einfuegen, der jeden Enum-Wert gegen erlaubte Werte prueft:

```text
function validateEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
```

---

## Erwartetes Ergebnis

- Kein `reading 'length'`-Fehler mehr (Schema-Validierung besteht)
- Volle Video-Qualitaet: Lottie-Charaktere, MorphTransitions, LottieIcons
- Mascots und animierte Figuren funktionieren wieder
- Die lokalen Lottie-Guards (aus frueheren Fixes) bleiben als Sicherheitsnetz bestehen

## Risiko

Minimal: Die Aenderung betrifft nur die Edge Function (automatisches Deployment). Die Lottie-Guards in den Remotion-Komponenten bleiben als zusaetzliche Absicherung erhalten.
