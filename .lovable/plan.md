# Atlantis-Briefing: Was die Analyse heute trifft — und was verloren geht

## Kurzantwort

Der Grundriss würde korrekt ankommen: 60 Sekunden gesamt, exakt 2 Szenen à 30 Sekunden, 9:16, kein Cast, kein Dialog, kein Voiceover, Negative Prompt. Die Szenenzahl wird über die Zeile `Szenen: 2 × 30 Sekunden` **und** die `Szene 1 / Szene 2`-Marker doppelt erkannt, die Gesamtlänge über `Länge: 60 Sekunden`; 30 s pro Szene liegen innerhalb der erlaubten Spanne (1–60 s).

Vier Dinge aus genau diesem Briefing gehen aktuell verloren oder werden falsch gesetzt.

## 1. Das komplette Sounddesign fällt weg

Im Manifest-Schema, im Produktionsplan und im Composer-Szenenmodell gibt es kein Feld für Umgebungsgeräusche, SFX oder Audio-Atmosphäre. Der Block „Sounddesign" (Wind, Möwen, Grollen, Stille, Cut-to-black mit Meeresgrollen) hat kein Ziel und wird verworfen — er landet höchstens zufällig als Prosa im Bildprompt. Bei einem Video, dessen ganze Wirkung am Ton hängt, ist das der größte Verlust.

Vorschlag: `soundDesign` pro Szene (plus global) ins Manifest und in den Plan aufnehmen, im Plan-Sheet anzeigen und beim Anwenden an den Audio-fähigen Modellprompt übergeben (Seedance 2.5, Veo). Bei Modellen ohne nativen Ton als Hinweis „Sounddesign wird im Motion Studio als Atmo-Spur benötigt" ausweisen statt still zu schlucken.

## 2. Die Kamerafahrt wird auf einen einzigen Token reduziert

Pro Szene existiert genau ein `movement`, ein `framing`, ein `angle`, ein `lighting`. Eine Choreografie wie „aerial establishing → descending crane → street-level tracking → wide coastal → push toward seabed" muss auf einen Wert kollabieren; der Rest überlebt nur, wenn das Modell ihn zufällig in den englischen Szenenprompt schreibt.

Vorschlag: Feld `cameraChoreographyEN` pro Szene (Freitext, englisch), das die vollständige Bewegungsfolge trägt, im Plan-Sheet sichtbar ist und in den Szenenprompt gehängt wird. Die Enum-Tokens bleiben unverändert für die Shot-Director-UI.

## 3. Der Ort `@atlantis` bleibt unaufgelöst

`@atlantis` existiert nicht in Cast & World. Die Mention wird als `unresolved` markiert, die Szene bekommt keine Location — die ausführliche Ortsbeschreibung (Marmor, Kanäle, Hafen, Terrassen) hat kein Zuhause.

Vorschlag: Für unaufgelöste Mentions mit Beschreibungstext im Plan-Sheet zwei Aktionen anbieten: „Als Ort in Cast & World anlegen" oder „Als Freitext-Location übernehmen". Der Beschreibungstext wird dabei mitgeführt, statt verworfen zu werden.

## 4. Untertitel würden eingeschaltet, obwohl das Briefing sie verbietet

Die Caption-Defaults stehen auf `enabled: true` / `auto-from-vo`. Bei einem Projekt ohne Voiceover und mit „keine Untertitel" im Negative Prompt ist das falsch.

Vorschlag: Regel „kein Voiceover und keine Dialogzeilen im ganzen Plan → `captions.enabled = false`", zusätzlich Auswertung expliziter Verbote im Negative Prompt.

## Zusätzlich

- Der globale Kontinuitätsblock („gleiche Stadt, gleiche Küstenlinie, Szene 2 setzt direkt an Szene 1 an") hat nur `continuityHint` pro Szene als Ziel. Beim Anwenden soll der globale Text in beide Szenen als Kontinuitäts-Hinweis übernommen werden, damit die Prompts derselben Stadt folgen.
- 30 s pro Szene können nicht alle Modelle. Wenn das ausgewählte Videomodell unter der Szenendauer liegt, soll das Plan-Sheet vor dem Anwenden warnen und Seedance 2.5 vorschlagen, statt die Szene später still zu kürzen.

## Technische Details

- `supabase/functions/_shared/briefing/manifestSchema.ts`: `soundDesign` (string, max 1000) und `cameraChoreographyEN` (string, max 600) pro Szene, `soundDesign` optional auf Projektebene; identisch in `BRIEFING_TOOL_PARAMETERS`.
- `supabase/functions/_shared/briefing/deep/index.ts`: Prompt-Regeln, damit Sounddesign-Blöcke und mehrstufige Kamerafahrten in die neuen Felder gehen statt in `anchorPromptEN`; Caption-Auto-Off-Regel nach der Manifest-Validierung.
- `src/lib/video-composer/briefing/productionPlan.ts`: gleiche Felder im Zod-Plan-Schema.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Anzeige/Bearbeitung von Sounddesign und Kamerafahrt, Aktionen für unaufgelöste Orte, Modell-Dauer-Warnung.
- `src/hooks/useApplyProductionPlan.ts`: Mapping der neuen Felder in die Composer-Szene und in den Szenenprompt; globaler Kontinuitätstext in `continuityHint`. Die Lip-Sync-Schutzfilter bleiben unverändert.
- Tests: Fixture aus genau diesem Atlantis-Briefing — prüft 2 Szenen × 30 s, leerer Cast, Captions aus, Sounddesign und Kamerafahrt pro Szene vorhanden, Negative Prompt vollständig.

Keine Änderungen an Lip-Sync-Ketten, Ankerlogik oder Rendering.
