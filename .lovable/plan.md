## Status: Scene & Character Continuity — wo wir wirklich stehen

### Was wir bereits haben (mehr als gedacht!)

**1. Character & Location Library (Motion Studio Pro)** — `/motion-studio/library`
- Persistente Charaktere mit `name`, `description`, `signature_items` (z. B. „rote Lederjacke"), `reference_image_url`, `voice_id`, `tags`
- Persistente Locations mit Lighting-Notes und Reference-Image
- `@charakter` / `@location` Mention-Editor in Prompts → wird beim Generieren automatisch zu vollem Prompt hydriert
- Wenn genau **ein** Charakter/Location getaggt ist, wird das Reference-Image als i2v-Anker an das Modell übergeben

**2. Frame-to-Shot Continuity** (Edge Function `extract-video-last-frame`)
- Letzter Frame jeder Szene wird automatisch extrahiert und als `start_image` für die nächste Szene benutzt
- Im **Video Composer** integriert (Szenen-basierte Pipeline mit Realtime-Updates)
- Hook `useFrameContinuity` ist überall verfügbar

**3. Hybrid Extend** (Edge Function `hybrid-extend-scene`) — _stärker als Artlist hier_
- 4 Modi: Forward, Backward, Bridge (zwischen 2 Szenen morphen), Style-Ref
- Backward & Bridge nutzen `end_image` (nur Kling & Luma supporten das)

**4. Multi-Model Consistency Ranking** (`modelConsistencyRanking.ts`)
- 5★ Kling (true i2v) · 4★ Hailuo, Wan, Seedance, Veo · 3★ Luma · 2★ Sora (prompt-only)
- UI zeigt Sterne pro Modell, damit User die richtige Engine für Continuity wählt

**5. Sora Long-Form Chain** (`generate-sora-chain`) — auto-extrahiert Frames zwischen Sora-Clips für 12s+ Storys

**6. Character Shot Picker** im Video Composer
- Pro Szene wählbar: Wide / Medium / Close-up / Absent
- Sherlock-Holmes-Anchor-Injection: Charakterbeschreibung wird shot-typ-spezifisch in den Prompt gepatcht

### Wo wir hinter Artlist liegen

| Feature | Artlist | Wir |
|---|---|---|
| Character Library mit Reference-Image | ✅ | ✅ |
| Auto-Frame-Continuity zwischen Shots | ✅ | ✅ (nur in Video Composer & Sora Long-Form) |
| **„Single Click 10-Shot Story" Wizard** | ✅ | ❌ Nur Sora Long-Form, nicht model-übergreifend |
| **Character Sheet (Multi-View Generator)** | ✅ Front/Side/3-4 Expressions | ⚠️ existiert nur für Explainer-Cartoons, nicht für realistische i2v |
| **Cast Consistency Map** (Visual Übersicht aller Szenen + welche Chars erscheinen) | ✅ | ❌ |
| **Continuity Toggle direkt im AI Video Toolkit** | ✅ | ❌ Toolkit greift nicht auf Library zu |

### Konkreter Vorschlag: 3 gezielte Upgrades (kein neues Modul!)

**Upgrade 1 — Character Sheet Generator für realistische Charaktere** (Library)
- Neuer Button im `CharacterEditor`: „Generate Character Sheet"
- Nutzt Gemini 3 Pro Image Preview oder Flux: erzeugt ein **4-View Sheet** (Front · Profile · ¾ View · Expression) aus einer einzigen Beschreibung oder einem Upload
- Das beste Bild wird als `reference_image_url` gespeichert + `reference_image_seed` für Reproduzierbarkeit
- Erweitert die bestehende `generate-character-sheet` Edge Function um realistic/cinematic-Modi

**Upgrade 2 — Library im AI Video Toolkit verfügbar machen**
- Im `ToolkitGenerator` einen kleinen „Cast & Locations"-Block ergänzen (1 Char + 1 Location auswählen via Popover)
- Wenn ausgewählt → Reference-Image wird automatisch als i2v-Input an die Edge Function übergeben (alle Modelle ≥ 3★ in der Ranking-Map)
- Bei Sora 2 (prompt-only) → Visual Description wird stattdessen in den Prompt injiziert + Toast-Hinweis „Sora hält Charaktere nur ~70 % konsistent — Kling für längere Stories"

**Upgrade 3 — „Story Mode" im Video Composer** (Cast Consistency Map)
- Neuer Tab/Sidebar-Block „Cast Map": zeigt eine Mini-Tabelle Szene 1–10 × Charaktere mit grünen/grauen Punkten (wo welcher Char auftritt)
- Per Szene auf einen Klick: „Continuity off / Frame-Anchor / Reference-Image" toggle
- Nutzt bereits vorhandene `extract-video-last-frame` + `characterShot`-Logik — nur eine UI-Übersicht, keine neue Backend-Logik

### Was wir bewusst NICHT tun

- **Keine neue Engine** für Character Re-ID — wir lehnen uns an Klings true-i2v an (besser als Artlists eigener Stack)
- **Keinen separaten „Continuity Mode"** als eigene Page — alles bleibt im Video Composer & Toolkit
- **Kein Auto-Storyboard aus 1 Prompt** über alle 9 Modelle — das ist Sora-Long-Form's Job, soll nicht dupliziert werden

### Antwort auf deine Frage

Wir sind **bei ~75 % des Artlist-Niveaus**. Frame-Continuity, Library und @-Mentions stehen. Was fehlt sind drei UX-Brücken:
1. Character Sheet auf Knopfdruck (1 Tag Aufwand)
2. Library-Picker im neuen Toolkit (0,5 Tage)
3. Cast Map im Composer (1 Tag)

Mit diesen 3 Upgrades sind wir auf Augenhöhe mit Artlist Studios — und durch **Hybrid Extend (Bridge-Mode)** sogar darüber hinaus.

**Soll ich diese 3 Upgrades umsetzen, oder priorisieren wir zuerst nur Upgrade 2 (Library im Toolkit) als schnellen Win?**