## Ziel

Den World-Catalog (`/library`) um eine vierte Achse **"Cast" (Personen-Archetypen)** erweitern und gleichzeitig alle bestehenden Unterkategorien von **4 → 6 Bilder** anheben — damit Szenen-Director, @-Mentions und Composer für jede Epoche/Setting genug fertige Charaktere & Assets vorfinden, ohne dass etwas gespeichert werden muss.

---

## Mengengerüst

### A) Neue Achse: Cast Catalog (13 Sub-Packs × 6 = 78 Bilder)

| Theme | Sub-Pack | 6 Archetypen |
|---|---|---|
| historical | roman | Legionary, Centurion, Senator, Gladiator, Vestal, Emperor |
| historical | medieval | Knight, Peasant, Bishop, Queen, Bard, Crusader |
| historical | viking | Warrior, Shieldmaiden, Jarl, Skald, Berserker, Seeress |
| historical | samurai | Samurai, Ronin, Geisha, Daimyo, Ninja, Monk |
| historical | egyptian | Pharaoh, Priestess, Scribe, Charioteer, Worker, Royal Guard |
| historical | greek | Hoplite, Philosopher, Athlete, Oracle, Trader, King |
| historical | ww2 | Soldier, Pilot, Nurse, Resistance Fighter, Officer, Engineer (no political insignia) |
| historical | wildwest | Sheriff, Outlaw, Saloon Owner, Prospector, Cowgirl, Native Scout |
| modern | professions | Doctor, Chef, Police Officer, Firefighter, Pilot, Barista |
| modern | business | CEO, Lawyer, Trader, Consultant, Receptionist, Manager |
| modern | creative | Photographer, DJ, Designer, Painter, Filmmaker, Influencer |
| fantasy | classic | Wizard, Elf Ranger, Dwarf, Paladin, Sorceress, Druid |
| scifi | cyberpunk | Hacker, Netrunner, Street Samurai, Corp Suit, Mech Pilot, Synth |

Composite-Key wie bei Wardrobe: `historical:roman`, `scifi:cyberpunk` … (kompatibel mit bestehender Pill-Row UI).

### B) Bestehende Packs auf 6 erweitern (+2 pro Pack)

| Achse | Packs | Neu-Bilder |
|---|---|---|
| Locations | 7 | 14 |
| Buildings | 10 | 20 |
| Props | 10 | 20 |
| **Summe Erweiterung** | **27** | **54** |

### C) Gesamt

| Bucket | Vorher | Nachher | Neu zu generieren |
|---|---:|---:|---:|
| Locations | 28 | 42 | +14 |
| Buildings | 40 | 60 | +20 |
| Props | 40 | 60 | +20 |
| **Cast (neu)** | 0 | 78 | +78 |
| **Total** | **108** | **240** | **+132 Bilder** |

Kosten-Schätzung (Gemini Image, ~€0.04/Bild): **~€5.30** einmalig. Laufzeit über `seed-world-catalog` Batches (8/Aufruf, ~12 s): **~3–4 Min** pro Achse, gesamt **~15 Min**.

---

## Technische Umsetzung

### 1. Neue Tabelle `character_catalog_previews`
Identisches Schema wie die drei bestehenden `*_catalog_previews` (id, theme_pack, slug, label, image_url, prompt_seed, created_at), Public-Read RLS, Admin-Write.

### 2. Seeder-Erweiterung (`supabase/functions/seed-world-catalog/index.ts`)
- Neuer `kind: 'character'` Branch mit eigener Slot-Liste (13 Packs × 6 = 78 Slots)
- Bestehende Slot-Listen für location/building/prop von 4 → 6 Einträge pro Pack erhöhen
- Idempotent (skip wenn `slug` existiert) — alte 108 Bilder bleiben unangetastet, nur die +132 neuen werden generiert
- Prompts strikt EN, mit konsistentem Style-Suffix pro Kind (Cast: "full-body cinematic portrait, neutral studio backdrop, even lighting, photoreal")

### 3. UI-Hooks (read-only Anpassungen)
- `useWorldCatalog.ts`: vierten Query-Block `catalogCharacters` ergänzen
- `useUnifiedMentionLibrary.ts`: Cast-Catalog-Rows in `characters[]` mergen (analog zu Locations heute), getaggt `['catalog']`, library-first Dedupe bleibt unverändert → gespeicherte Avatare gewinnen weiter
- `CatalogBrowser.tsx`: `kind: 'character'` Variante; sessionStorage-Handoff erbt Composer-Receiver
- `Library.tsx` (`/library`): Cast-Katalog im **People-Tab** als 2. Sektion unter den persönlichen Avataren anzeigen — kein Save nötig, klick = direkt im Composer/Toolkit nutzbar

### 4. Scene Director (`supabase/functions/scene-director/index.ts`)
Cast-Catalog als zusätzlichen Match-Pool registrieren (analog Locations/Buildings/Props), damit z. B. „Ein Senator betritt den Senat" automatisch `@senator` + `@roman-senate` injiziert.

### 5. Ausführung
Nach Approval: Migration → Seeder-Edit deployen → 4× `seed-world-catalog` (location, building, prop, character) bis `done:true`.

---

## Out of Scope (später, separat)
- Cast-Variants (Posen/Outfits) für Catalog-Charaktere — Catalog ist bewusst „take it as is", Variants gibt's nur für gespeicherte Brand Characters.
- Weitere Themen (Bollywood, Anime, Folklore) — können später als reine Daten-Erweiterung nachgezogen werden.
- Voice-Matching für Cast-Catalog (Catalog-Personen haben kein `default_voice_id`).

---

## Bestätigung erbeten
Soll ich genau so umsetzen, oder möchtest du Themen/Anzahl pro Pack anpassen (z. B. 4 statt 6, oder weitere Sub-Packs wie `historical:wildwest` ergänzen/streichen)?
