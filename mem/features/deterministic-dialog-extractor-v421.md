---
name: Deterministischer Dialog-Extraktor v421
description: dialogTurns kommen ausschliesslich aus extractDialog.ts; das LLM darf keine Sprecherzeilen mehr erfinden
type: feature
---

- `supabase/functions/_shared/briefing/deep/extractDialog.ts` ist die einzige Quelle für `dialogTurns`.
- Erkannt wird: `@mention: "Text"` (auch inline in Prosablöcken, typografische Quotes), `@mention: Text` am Zeilenanfang, `Name: Text` wenn Name einem Cast-Slot entspricht.
- Strukturlabels (DAUER, ORT, CAST, AKTION, …) werden über `isNonSpeakerLabel` hart ausgeschlossen.
- Der Pass läuft in `deep/index.ts` VOR Continuous-Split, Solo-Enforcement und `bindTurnSpeakerIds`. Findet er Turns, überschreibt er alles vorherige (LLM, Script-Timing, Speaker-Map, Rescue). Findet er keine, bleiben nur Turns mit echtem Cast-Mention.
- Slot-Prinzip: Die Mention ist der Slot. Figurwechsel am Slot aktualisiert alle Zeilen dieser Mention.
- Prosafelder (action, visualDescription, anchorPromptEN, …) werden per `stripQuotedDialog` von wörtlichem Dialog befreit.
