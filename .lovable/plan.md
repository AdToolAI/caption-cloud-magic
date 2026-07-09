# Briefing ↔ Production Plan — Abweichungs-Audit

Ich habe dein Original-Briefing gegen den generierten Plan auf den 7 Screenshots durchverglichen. Der Parser weicht in **mehreren gravierenden Punkten** vom Briefing ab. Das sind keine Kleinigkeiten — das Herzstück des Spots (4-Sprecher-Lip-Sync-Swap) wird nicht umgesetzt.

## Kritische Fehler (Show-Stopper)

**1. Gesamtdauer: 30s statt 15s**
Briefing sagt explizit „ca. 15 Sekunden" und liefert Timing 0–2,5 / 2,5–5 / 5–7,5 / 7,5–10 / 10–12,5 / 12,5–15. Plan: 3 × 10s = 30s. Parser hat die Timing-Vorgabe komplett ignoriert.

**2. Sprecher 4 fehlt vollständig**
Briefing hat 4 Sprecher mit je einem eigenen Shot. Plan hat nur S01 Hook / S02 Reveal / S03 Proof — Sprecher 4 („…die perfekt zusammenpassen.") und sein Creator-Studio-Shot existieren im Plan nicht.

**3. Endcard-Szene fehlt**
Briefing verlangt explizit Shot 3B — Endcard „AdTool AI — Perfekte Multi-Speaker-Lip-Sync-Videos in Minuten." Nicht im Plan.

**4. Split-Screen-Showcase fehlt**
Briefing Shot 3A: Split-Screen aller 4 Sprecher mit Text „4 Sprecher. 1 Skript. Perfekter Lip-Sync." — nicht im Plan.

**5. Verbatim-Skript nicht übernommen (LITERAL-Mode hat nicht gegriffen)**
Briefing hat exakte Zeilen:
- S1: „Mit AdTool AI erstellst du…"
- S2: „…realistische Lip-Sync-Videos…"
- S3: „…mit mehreren Sprechern…"
- S4: „…die perfekt zusammenpassen."

Plan zeigt in den Skript-Feldern stattdessen **Szenenbeschreibungen** wie „Speaker 2, a creative marketer, moves between desks in a modern, bright startup office…" — das ist der Shot-Prompt, nicht der Dialog. Das exakte deutsche Skript ist verloren gegangen.

**6. Ensemble-Guarantee überschießt bei Solo-Shots**
S01 Hook zeigt „Cast (4)" mit allen 4 Sprechern gleichzeitig als Gruppen-Shot („share the scene together, each visible to camera"). Briefing sagt aber klar: Shot 1A = **nur Sprecher 1 solo** auf Stadtstraße. Die neue Ensemble-Logik feuert auch dort, wo das Skript sauber Solo-Shots vorgibt.

## Wichtige Fehler (Qualität)

**7. Locations nicht zugeordnet**
Alle Szenen zeigen „— nicht zugeordnet —". Briefing gibt 4 konkrete Locations pro Sprecher vor (Stadtstraße / Startup-Office / Café / Creator-Studio). Der Location-Resolver hat keinen davon gemappt — nicht mal als Freitext-Location angelegt.

**8. Outfits alle „Standard-Look"**
Briefing beschreibt pro Sprecher Kleidung (Business-casual/Hemd+Jacke, Smart-casual, Street/Café-Look, Premium/Studio). Keiner der 10 neuen Default-Presets wurde gezogen, kein Library-Look. Trotz der Preset-Integration von eben.

**9. Voices**
S01 und S02 zeigen „Auto-Voice beim Anwenden" für Kailee — bei 4 klar unterschiedenen Sprecherprofilen sollte der Voice-Pool 4 distinkte Stimmen zuweisen (v212 voice_pool).

**10. Engine-Zuweisung inkonsistent**
S01 = cinematic-sync (bei angeblich 4 Sprechern in einem Shot — Cinematic-Sync ist aber der Multi-Speaker-N-Pfad, das passt). S02/S03 = „auto" bei Solo-Shots — sollten auch cinematic-sync werden, wenn Lip-Sync erforderlich ist (Lip-Sync-Badge ist ja auf allen gesetzt).

## Root-Cause-Hypothesen

Basierend auf der Codebase-Historie:

- **Duration-Ignore**: `briefing-deep-parse` fasst 6 Shots zu 3 Szenen zusammen und nimmt Default-Dauer 10s statt aus Briefing zu lesen. Der Prompt fordert keine Timing-Extraktion aus dem Briefing-Text.
- **Missing Speaker 4 / Endcard / Split-Screen**: Der Parser hat ein 3-Szenen-Bias (Hook/Reveal/Proof-Template) und komprimiert 6 Shots → 3 statt 6 Szenen zu erzeugen. Struktur-Marker wie „Shot 1A/1B/2A/2B/3A/3B" im Briefing werden nicht respektiert.
- **LITERAL nicht getriggert**: Das Briefing benutzt „Sprecher 1: `„Text…"`" statt `NAME:` als Label. `detectBriefingFidelity` sucht wahrscheinlich nur `^NAME:` Regex und übersieht das Format „Sprecher N:" mit deutschen Anführungszeichen. → LITERAL-Mode nie aktiviert → keine Verbatim-Zeilen → Skript-Feld bekommt Fallback-Szenenbeschreibung.
- **Ensemble über-fired**: `ensureEnsembleScene` prüft nur „mind. 2 Chars im Cast" und ignoriert, ob das Skript für diese Szene einen Solo-Speaker vorgibt. Das Overrides auch dann, wenn der Text explizit einen Sprecher benennt.
- **Location nicht gemappt**: „Moderne Stadtstraße" ist Freitext, keine Library-Location. Der Resolver macht kein Fallback auf `locationDescription` als Freitext-String pro Szene.
- **Outfit-Presets nicht auto-gewählt**: Preset-Zuweisung ist bisher manuell (User klickt Dropdown). Der Parser könnte aus Kleidungs-Keywords im Briefing das passendste Preset vorschlagen.

## Ich empfehle folgendes Fix-Bündel (nur Diagnose, keine Änderung ohne dein OK)

**A. Timing-Extraktion (kritisch)**
`briefing-deep-parse` System-Prompt erweitern um: „Wenn das Briefing explizite Sekunden/Zeitangaben (`0–2,5s`, `Länge: 15 Sekunden`, `Timing: …`) enthält, MUSS der Plan die Gesamtdauer und pro-Szenen-Dauer daraus übernehmen. Default 10s NUR wenn kein Timing spezifiziert ist."

**B. Shot-Struktur respektieren (kritisch)**
Prompt-Regel: „Wenn das Briefing Shot-Marker wie `Shot 1A/1B/2A/2B` oder nummerierte Sprecher-Blöcke enthält, erzeuge EINE Szene pro Shot — komprimiere NICHT auf 3 Template-Szenen. Endcard/Split-Screen sind eigene Szenen."

**C. LITERAL-Detector erweitern (kritisch)**
`detectBriefingFidelity` in `useStoryboardTransition.ts` zusätzlich matchen auf:
- `Sprecher\s*\d+\s*:` / `Speaker\s*\d+\s*:` / `Character\s*\d+\s*:`
- Direkte Rede in `„…"` / `"…"` / `«…»` nach einem Sprecher-Label
Diese Zeilen als Verbatim-Skript-Zeilen behandeln, nicht als Beschreibung.

**D. Ensemble-Guard nur bei fehlender Speaker-Attribution (kritisch)**
`ensureEnsembleScene` NUR dann feuern, wenn:
- Szene hat 0 explizite Sprecher-Zuweisung, UND
- Das Skript-Feld nennt keinen konkreten Speaker-Namen/Label.
Solo-Shots aus dem Briefing bleiben Solo.

**E. Location-Fallback (wichtig)**
Wenn Library-Match fehlschlägt, den Location-Freitext aus dem Briefing (z. B. „Moderne Stadtstraße, urbaner Hintergrund") als `locationDescription` in den Plan-Slot legen, damit der Nutzer im Dropdown „+ Anlegen" die Location mit einem Klick übernehmen kann. Aktuell zeigt der Slot „— nicht zugeordnet —" ohne Vorschlagswert.

**F. Outfit-Preset-Auto-Match (nice-to-have)**
`briefing-deep-parse` bekommt eine Regel: Wenn Cast-Slot einen `outfitDescription` aus dem Briefing hat aber kein `outfitLookId`, wähle das nächstliegende der 10 Default-Presets per Keyword-Match (`business` → business-casual/formal, `studio`/`premium` → tech-founder/evening-elegant, `street`/`casual` → streetwear/weekend-relaxed). Preset-ID in `outfitPreset` schreiben.

## Technische Details (welche Dateien wären betroffen)

- `supabase/functions/briefing-deep-parse/index.ts` — System-Prompt für Timing- & Shot-Struktur-Extraktion, Fidelity-Preservation für Sprecher-Zeilen, Outfit-Preset-Matching
- `src/hooks/useStoryboardTransition.ts` — `detectBriefingFidelity` Regex-Erweiterung um `Sprecher N:` und deutsche Quotes
- `src/lib/motion-studio/syncCastFromPrompt.ts` (`ensureEnsembleScene`) — Guard gegen Solo-Shot-Overrides
- `src/lib/video-composer/briefing/ensurePlanEnsemble.ts` — gleicher Guard client-seitig
- Location-Fallback: `ProductionPlanSheet.tsx` Location-Dropdown zeigt `locationDescription` als Vorschlagswert im „+ Anlegen"-Feld

## Reihenfolge / Priorität

1. **C** (LITERAL-Detector) — löst 5 & indirekt 6, dein Skript wird 1:1 übernommen
2. **B** (Shot-Struktur) — löst 2, 3, 4 (Sprecher 4, Endcard, Split-Screen erscheinen)
3. **A** (Timing) — löst 1 (15s statt 30s)
4. **D** (Ensemble-Guard) — löst 6 (Solo-Shots bleiben solo)
5. **E** (Location-Fallback) — löst 7
6. **F** (Outfit-Auto-Match) — löst 8

## Frage an dich

Willst du:
- **„alle 6"** — komplettes Fix-Bündel A–F umsetzen
- **„1–4"** — nur die kritischen 4 (Skript/Struktur/Timing/Ensemble), Location & Outfit später
- **„nur C+B"** — die zwei größten Hebel zuerst, dann testen und weiter
- Eigene Auswahl / Reihenfolge nennen
