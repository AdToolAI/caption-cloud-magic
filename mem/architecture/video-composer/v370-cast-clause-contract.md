---
name: v370 Cast-Clause-Vertrag (HappyHorse)
description: Cast block in plate prompts is built deterministically via _shared/cast-clause.ts; no regex rescue, no bracket tags, count always equals listed names
type: feature
---

# v370 — Cast-Block deterministisch bauen

**Ursache des `InvalidParameter - Could not process with this prompt`:**
Der Prompt trug den Cast dreifach und widersprüchlich:
`[Besetzung: Matthew (Profil), Sarah (Profil), Kailee (Profil)] Exactly four people in frame: in frame: Samuel. Exactly four people in frame: Samuel.`
Nicht die Länge (591 < 900 Zeichen) war das Problem, sondern Widerspruch + deutscher Bracket-Tag.

**Vertrag (gilt für jeden Plate-Prompt an HappyHorse):**
1. Genau EINE Cast-Klausel: `Exactly <wort> people in frame: A, B, C.`
2. Genannte Anzahl == Anzahl gelisteter Namen (immer).
3. Keine Bracket-Tags (`[Besetzung: …]`, `[Cast: …]`) im Prompt.
4. Aufbau nur über `_shared/cast-clause.ts` (`buildCastClause`), niemals per Regex-Reparatur.
5. Idempotent: erneutes Sanitisieren ändert den Text nicht mehr.

**Umsetzung:**
- `_shared/cast-clause.ts`: `buildCastClause`, `extractCastNames`, `normalizeCastInPrompt`, `validateCastContract`, `parseNameListWithRest` (Prosa hinter der Namensliste bleibt erhalten).
- `_shared/happyhorse-green-net.ts`: alte „Cast-Rescue“-Regex entfernt; `compressLipReadyPlate`/`sanitizeForHappyHorse`/`hardSanitizeForHappyHorse` nehmen optional `castNames`; Cast-Sätze werden im Satz-Pass verworfen und die kanonische Klausel einmal vorangestellt (überlebt so den Mouth-Choreography-Filter).
- `compose-video-clips`: `neutralTwoShotPrompt` nutzt den Builder; Pre-Dispatch-Contract (`validateCastContract`) baut vor dem Versand neu und loggt `v370_cast_contract_rebuilt`.
- `compose-clip-webhook`: Repair-Retry behält die Cast-Namen.
- Tests: `_shared/happyhorse-rejection.test.ts` (v370-Fälle, inkl. Idempotenz).
