## Status: Casting & Scene Building — wo wir wirklich stehen

Vergleich mit Artlists vier Säulen ihres "Casting & Scene Building"-Pakets:

### Säule 1: Charaktere casten (mehrere Vibes pro Person)

| Artlist | Wir |
|---|---|
| 1 Beschreibung → 4–8 Visualisierungen → User wählt Vibe | ⚠️ Teilweise: `generate-character-sheet` macht jetzt 4-View-Sheet (Front/3-4/Profile/Expression) eines **einzigen** Looks |
| Multi-Vibe Picker ("Realistic / Cinematic / Editorial / Documentary") | ❌ Fehlt |
| Mehrere `reference_image_url`s pro Charakter | ❌ Schema hat nur 1 URL |

**Status: ~40 %** — der Sheet-Generator existiert, aber liefert nur eine ästhetische Variante. Casting bedeutet *mehrere Optionen vergleichen*.

### Säule 2: Locations scouten (umfärben, Objekte platzieren)

| Artlist | Wir |
|---|---|
| Location-Library mit Reference-Image | ✅ `motion_studio_locations` |
| Wände umfärben / Möbel verschieben (Inpaint) | ⚠️ Magic Edit (FLUX Fill Pro) existiert im Picture Studio — aber **nicht** vom Location-Editor aus aufrufbar |
| Lighting-Varianten (Tag / Nacht / Golden Hour) | ❌ Fehlt |
| Multi-Angle-Sheet (Wide / Medium / Detail) | ❌ Fehlt |

**Status: ~35 %** — Backend & Inpaint-Engine sind da, nur die Brücke vom Location-Editor zu Magic Edit fehlt.

### Säule 3: Story-Sequenzen mit Kontinuität über mehrere Shots

| Artlist | Wir |
|---|---|
| Frame-to-Shot Continuity | ✅ `extract-video-last-frame` + Hook |
| Hybrid Extend (Bridge zwischen Szenen) | ✅ Stärker als Artlist (4 Modi) |
| Cast Consistency Map | ✅ Letztes Update — fest im Storyboard |
| Sora Long-Form Chain (12 s+) | ✅ |
| Cast & Locations Picker im Toolkit | ✅ `ToolkitCastPicker` |

**Status: ~90 %** — Hier sind wir auf Augenhöhe oder besser.

### Säule 4: Scene Library für team-weite Wiederverwendung

| Artlist | Wir |
|---|---|
| Persönliche Library (Charaktere/Locations) | ✅ |
| **Geteilte Workspace-Library** (mehrere Seats sehen dieselben Assets) | ❌ RLS = nur `auth.uid() = user_id` |
| **Scene Snippets** (Storyboard-Szenen wiederverwendbar speichern) | ❌ Fehlt komplett |
| Public Marketplace / Community Cast | ❌ Out of Scope |

**Status: ~25 %** — größte Lücke. Library ist heute strikt single-user.

---

## Zusammenfassung in einer Zahl

**~55 % des Artlist-Casting-Levels.**
Stark in Continuity (90 %), schwach in Multi-Vibe-Casting (40 %), Location-Scouting (35 %) und Team-Sharing (25 %).

---

## Vorschlag: 3 gezielte Upgrades (kein neues Modul)

### Upgrade A — Multi-Vibe Casting (geschätzt 1 Tag)

- DB: neue Tabelle `motion_studio_character_variants` (1:N zu Character) mit `vibe`, `image_url`, `seed`, `is_primary`
- Edge Function: `generate-character-sheet` um Modus `multi-vibe` ergänzen → liefert 4 Bilder in 4 Stilen (Realistic / Cinematic / Editorial / Documentary) in **einem** Gemini-Call (Bilder parallel)
- UI: im `CharacterEditor` neuer Block "Cast" mit Grid → User klickt eine Variante an → wird `is_primary = true` (das ist die `reference_image_url`)
- Toolkit/Composer benutzen weiterhin nur die primäre Variante → 0 Breaking-Changes

### Upgrade B — Location Scouting Tools (geschätzt 1 Tag)

- "In Magic Edit öffnen"-Button im `LocationEditor` → übergibt die Reference-URL an Picture Studio Inpaint (existierende FLUX Fill Pro Pipeline) → speichert das Resultat als neue `motion_studio_locations`-Zeile (oder als Variante via Tabelle aus Upgrade A, generisch)
- "Lighting-Varianten generieren"-Button → 1 Reference-Image + Prompt-Suffixe ("at sunrise / at night / overcast") → 3 Image-to-Image Generierungen (Gemini 3 Pro Image Edit)
- Beide Outputs landen direkt in der Library, taggierbar

### Upgrade C — Scene Snippets + Workspace Sharing (geschätzt 1.5 Tage)

- DB: neue Tabelle `motion_studio_scene_snippets` (Felder: `name`, `prompt`, `cast_character_ids`, `location_id`, `clip_url`, `last_frame_url`, `tags`, `workspace_id` nullable)
- Im Video Composer SceneCard → "Als Snippet speichern" + im StoryboardTab "Snippet einfügen" (Picker)
- **Workspace Sharing**: alle drei Tabellen (`characters`, `locations`, `scene_snippets`) bekommen optional `workspace_id` und eine zweite RLS-Policy `is_workspace_member(auth.uid(), workspace_id)`. Default bleibt privat (`workspace_id = NULL`); Toggle pro Asset "Mit Team teilen"
- Library-Picker zeigt zwei Tabs: "Meine" / "Team"

### Was wir bewusst NICHT tun

- Kein Public-Marketplace (Community-Cast) — out of scope, rechtlich heikel
- Keine Re-Generierung bereits gerenderter Szenen wenn der Snippet sich ändert — Snippets sind Templates, keine Live-Bindings
- Kein eigenes "Casting Studio" als neue Page — alles bleibt im bestehenden Library-Editor

---

## Reihenfolge / Priorisierung

1. **Upgrade A (Multi-Vibe Casting)** — größter sichtbarer Sprung in Richtung Artlist-Demo
2. **Upgrade C (Scene Snippets + Sharing)** — eliminiert die größte funktionale Lücke
3. **Upgrade B (Location Scouting)** — Polish, baut auf Upgrade A's Variants-Tabelle auf

Mit allen drei Upgrades sind wir bei **~85–90 %** Artlist-Niveau und in Continuity weiter vorn.

---

## Frage an dich

Welche Reihenfolge soll ich umsetzen?

- **Variante 1 (empfohlen):** Alle 3 in oben genannter Reihenfolge — ca. 3.5 Tage Arbeit, Casting + Sharing zuerst
- **Variante 2 (schnellster Wow-Effekt):** Nur Upgrade A — Multi-Vibe Casting allein, danach evaluieren
- **Variante 3 (größter Business-Wert):** Nur Upgrade C — Workspace-Sharing + Scene Snippets (Team-Feature, bessere Pro/Enterprise-Conversion)
