# Plan: Location-Freitext-Fallback (E)

## Ziel
Wenn das Briefing eine Location beschreibt, die **nicht** in der Library existiert (z.B. „Split-Screen Office/Home", „verregnete Autobahn bei Nacht", „Bühne mit Nebel"), soll dieser Text **1:1** ins Storyboard übernommen und ans Video-Modell weitergereicht werden — statt still zu verschwinden. Damit bleiben Action-Szenen, exotische Kulissen und Split-Screens auch ohne vorab angelegte Library-Location möglich.

## Änderungen

### 1. Server: `supabase/functions/briefing-deep-parse/index.ts`
- Pass-A-Prompt: Regel ergänzen „Wenn Location im Briefing beschrieben ist aber kein Library-Match: setze `location.locationId = null`, fülle `location.locationName` mit einer Kurz-Phrase (max 40 Zeichen) und `location.description` mit der **wörtlichen** Briefing-Beschreibung (max 300 Zeichen)."
- Lokaler Location-Fill-Pass (v178): wenn nach Fuzzy-Match immer noch `locationId === null` UND `description` leer → aus dem Briefing-Text den nächsten Satz nach Location-Keywords (`Setting|Location|Kulisse|Szenerie|Ort`) als Fallback-Description extrahieren.
- Telemetrie: `parser_meta.location_resolution.viaFreetext` Counter.

### 2. Schema: `src/lib/video-composer/briefing/productionPlan.ts`
- `ResolvedLocation.description` bereits vorhanden — sicherstellen dass es durch alle Merges (`ensurePlanEnsemble`, `planCastDedup`) erhalten bleibt. Kein Feld-Neubau.

### 3. UI: `src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- Wenn `locationId === null` und `description` gesetzt → statt leerer Zelle einen **Freitext-Chip** „🎬 [description]" in der Location-Spalte anzeigen, mit `+ Als Location speichern`-Button (nutzt den vorhandenen `quickCreateLocation`-Pfad, propagiert ID auf alle Szenen mit gleichem `mentionKey`).
- Location-Dropdown behält Freitext-Wert als disabled Placeholder, damit klar ist: „wird als Prompt-Zusatz genutzt".

### 4. Apply: `src/hooks/useApplyProductionPlan.ts`
- Beim Bau des Szenen-Prompts: wenn kein `locationId` aber `description` vorhanden → `Setting: [description]` an den AI-Prompt anhängen (analog zum bestehenden `Wardrobe: …`-Muster für Outfit-Presets). Das garantiert dass der Freitext das Video-Modell erreicht.

## Was NICHT geändert wird
- Kein Umbau des Location-Pickers, keine neue Modal-UI.
- Kein Schreibzugriff auf `dialog_shots`, `syncso_*`, `clip_source` — Lip-Sync-Pipeline bleibt unangetastet.
- Keine automatische Erstellung von Library-Einträgen ohne User-Klick.

## Ergebnis
Briefing-Passagen wie „Sprecher 1 im Home-Office, Sprecher 2 im Café, Split-Screen" landen als Freitext in der Location-Zelle **und** im finalen Video-Prompt — der User sieht sofort was passiert, kann per Klick zur Library speichern, und Action-/Exotic-Szenarien sind ohne Vorarbeit möglich.
