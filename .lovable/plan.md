## Ausgangslage

Der **Motion Studio Superuser** läuft mit **14/14 (100%)** sauber durch und deckt die Composer-Kernpipeline ab:
Briefing → Auto-Director → Scenes → Brand → Reframe → Render → Export.

Es fehlen jedoch **produktive Pfade**, die in echten User-Flows häufig genutzt werden – diese sollten wir abdecken, um Regressionen früh zu erkennen.

---

## Vorschlag: 8 neue Szenarien (MS-19 bis MS-26)

### 🎙️ Audio / Voice Pipeline (3 Szenarien) – **Hoher Impact**
Aktuell komplett ungetestet, obwohl jedes Composer-Video Voiceover & Musik nutzt.

- **MS-19: Voiceover-Skript Generation** → `generate-voiceover-script`
  Reachability + Schema-Validation für `{ script, scenes }`.
- **MS-20: ElevenLabs Voice List** → `list-voices`
  Stellt sicher, dass die ElevenLabs-Anbindung lebt (kritisch nach API-Key-Rotation).
- **MS-21: Stock Music Search** → `search-stock-music`
  Validiert Suno/Pixabay-Anbindung mit einem Beispiel-Query.

### 🎬 Stock Asset Pipeline (2 Szenarien) – **Mittlerer Impact**
Composer fällt bei "AI-generate failed" auf Stock zurück → muss erreichbar sein.

- **MS-22: Stock Video Search** → `search-stock-videos`
  Pexels/Pixabay-Reachability-Check mit `{ query: "ocean" }`.
- **MS-23: Stock Image Search** → `search-stock-images`
  Unsplash/Pexels-Fallback für Scene-Generation-Failures.

### 📥 Composer Import & Templates (2 Szenarien) – **Mittlerer Impact**
- **MS-24: FCPXML Re-Import (Round-Trip)** → `composer-import-fcpxml`
  Hardening-Test: Sendet kleinen XML-Snippet, erwartet `{ scenes }`-Parse.
- **MS-25: Trending Templates Schema** → `get-video-templates`
  Validiert, dass `{ templates: [...] }` mit `id, name, briefing_defaults` zurückkommt (MS-8 prüft nur Bucket).

### 📦 Asset Bundle Export (1 Szenario) – **Niedriger Impact, aber User-facing**
- **MS-26: Composer Bundle Export** → `composer-export-bundle`
  Hardening-Test: Erwartet 404/400 bei nicht-existentem Projekt (Fallback-Verhalten wie MS-12).

---

## Umsetzungsschritte

1. **`supabase/functions/motion-studio-superuser/index.ts`** erweitern:
   - 8 neue Szenarien-Objekte zum `scenarios`-Array hinzufügen.
   - Wo nötig `optional: true` setzen (für API-Key-abhängige Tests wie ElevenLabs).
   - Konsistenten Naming-Schema verwenden (`MS-19` bis `MS-26`).

2. **Step-Counter im Frontend prüfen**: Falls die Sidebar (Project/Director/Assets/Brand/Reframe/Render/Export/Integrity) Counts hardcoded hat, neue Szenarien den richtigen Steps zuweisen:
   - Assets: MS-19, MS-20, MS-21, MS-22, MS-23
   - Director: MS-24
   - Project: MS-25
   - Export: MS-26

3. **Deploy** der Funktion und **Fast Run** starten, um zu verifizieren.

---

## Erwartetes Ergebnis

- **Total**: 22 Szenarien (statt 18)
- **Coverage**: Composer + Audio + Stock + Templates + Import + Bundle-Export
- **Pass-Rate**: 22/22 erwartet (alle deployten Funktionen sollten passieren; falls nicht, liefert der Test umsetzbare Erkenntnisse).

---

## Optional (nicht Teil dieses Plans, aber denkbar für später)
- **Hailuo Scene Animation** (`animate-scene-hailuo`) – nur falls Composer Animation aktiv nutzt.
- **Sora Scene Batch** (`generate-sora-scenes-batch`) – Long-Form-spezifisch, eigener Test sinnvoller.
- **Background Music Seeding** (`seed-background-music`) – Admin-Wartungsfunktion, nicht Pipeline.
