

## Befund

Der User fragt, ob die 12 Visual Styles (Comic, Realistic, Cinematic, Anime, 3D Animation, Claymation, Pixel Art, Watercolor, Noir, Cyberpunk, Vintage Film, Documentary), die wir gerade im Composer Briefing eingebaut haben, auch im **Hailuo Studio** (`/hailuo-video-studio`) verfügbar sind bzw. ob Hailuo 2.3 diese Stile überhaupt umsetzen kann.

## Antwort (kurz)

**Technisch ja, aktuell nein.** Hailuo 2.3 (MiniMax) kann Style-Prompts grundsätzlich verarbeiten — wir geben es dem Modell nur noch nicht. Die Style-Picker existieren momentan **nur** im Video Composer Briefing. Im standalone Hailuo Studio gibt es keinen Style-Selector.

### Was Hailuo 2.3 wirklich kann
- ✅ **Realistic, Cinematic, Documentary, Vintage Film, Noir** → exzellent (Hailuo ist primär ein Realismus-Modell, photoreal ist sein Sweet-Spot)
- ✅ **Cyberpunk, 3D Animation** → sehr gut (genug Stilkraft im Training)
- ⚠️ **Anime, Comic, Watercolor, Claymation, Pixel Art** → funktioniert, aber qualitativ schwächer als bei spezialisierten Modellen (Kling 3 oder Seedance liefern hier oft besser)
- Style wird über den Text-Prompt gesteuert (kein separater Parameter im Replicate-API)

## Plan: Style-Selector im Hailuo Studio nachrüsten

### 1) Style-Picker UI in `HailuoVideoStudio` Page hinzufügen
Ein neuer Block über/unter dem Prompt-Input mit den 12 Style-Chips (gleiche Glyph + Label aus `composerVisualStyles.ts`). Default = "none" (kein Hint angehängt — User-Prompt bleibt unverändert).

### 2) Style-Hint in Edge Function injizieren
`supabase/functions/animate-scene-hailuo/index.ts` (und/oder die Studio-Generierungs-Function — muss noch identifiziert werden) erweitern:
- Neues Optional-Feld `visualStyle?: ComposerVisualStyle` im Request
- `getVisualStyleHint(visualStyle)` aus `_shared/composer-visual-styles.ts` an den Prompt anhängen
- Bestehende `motionPrompts`-Logik bleibt — Style wird **nach** der Motion-Beschreibung angehängt

### 3) Style-Eignungs-Hinweis in der UI
Da Hailuo nicht alle Stile gleich gut beherrscht, kleines Badge pro Style-Chip:
- 🟢 "Optimal für Hailuo" (Realistic, Cinematic, Documentary, Cyberpunk, Noir, Vintage)
- 🟡 "Funktioniert" (3D Animation, Anime)  
- 🟠 "Eingeschränkt — besser Kling/Seedance" (Comic, Watercolor, Claymation, Pixel Art) + Tooltip mit Empfehlung

### 4) Konsistente Übernahme in andere Studios (optional, in gleichem Schritt)
Da `_shared/composer-visual-styles.ts` und `src/config/composerVisualStyles.ts` bereits zentral existieren, lässt sich der gleiche Picker mit minimalem Aufwand auch in **Kling Studio**, **Seedance Studio**, **Wan Studio**, **Luma Studio** und **Sora Studio** einbauen — jeweils mit modellspezifischer Eignungs-Matrix:

| Style | Hailuo | Kling | Seedance | Wan | Luma | Sora |
|---|---|---|---|---|---|---|
| Realistic | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Cinematic | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Anime | 🟡 | 🟢 | 🟢 | 🟡 | 🟡 | 🟡 |
| Comic | 🟠 | 🟢 | 🟡 | 🟠 | 🟠 | 🟡 |
| Pixel Art | 🟠 | 🟡 | 🟡 | 🟠 | 🟠 | 🟡 |
| ... | ... | ... | ... | ... | ... | ... |

### Betroffene Dateien
- `src/pages/HailuoVideoStudio.tsx` (oder entsprechender Studio-Page-Pfad — vor Implementierung verifizieren) — Style-Picker UI
- `src/components/ai-video/StylePickerCompact.tsx` *(neu)* — wiederverwendbare Komponente für alle Studios
- `src/config/modelStyleCompatibility.ts` *(neu)* — Eignungs-Matrix pro Modell
- `supabase/functions/animate-scene-hailuo/index.ts` — Style-Hint-Injection
- *(optional)* gleiche Erweiterung für Kling/Seedance/Wan/Luma/Sora Studios + zugehörige Edge Functions

### Empfehlung — Zwei Optionen
**A) Nur Hailuo jetzt** — schnell, fokussiert auf die aktuelle Frage. ~3 Datei-Änderungen.
**B) Alle 6 AI-Video-Studios in einem Rutsch** — konsistente UX, einmal Style-Picker für die ganze AI-Video-Suite. ~12-15 Datei-Änderungen.

Welche Variante soll ich umsetzen?

