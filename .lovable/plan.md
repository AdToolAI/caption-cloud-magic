# Ton, Untertitel und Lip-Sync: sauberer Weg statt Automatik

## Antwort auf die Kernfrage

Der professionelle Weg ist nicht „Briefing erzeugt Ton", sondern: **Das Briefing erfasst die Tonabsicht als Daten. Erzeugt wird Ton nur in einem eigenen, sichtbaren Schritt nach der Bildgenerierung.** Damit bleibt die Lip-Sync-Kette unangetastet — sie sieht weiterhin stumme Clips plus die Voiceover-Spur, genau wie heute.

Der Composer hat dafür schon den richtigen Schalter: `withAudio` pro Szene (Veo/Kling setzen `generate_audio=false`, Sora wird beim Stitch stummgeschaltet). Heute wird der beim Briefing-Apply nicht gesetzt, und Sounddesign-Text hat gar kein Feld. Genau diese zwei Lücken schließen wir — ohne neue Automatik.

## Die drei Tonquellen sauber trennen

```text
Provider-Ton   (Seedance/Veo/Sora/Kling erzeugen Musik + Atmo im Clip)
Studio-Ton     (Atmo/SFX/Musik als eigene Spuren im Motion Studio)
Sprache        (Voiceover / Lip-Sync-Dialog)
```

Regel, die überall gilt: **Provider-Ton und Studio-Ton schließen sich pro Szene aus.** Beides gleichzeitig ergibt doppelte Atmosphäre und doppelte Musik — genau der Fehler, den wir nicht ins Motion Studio holen wollen.

Daraus folgt ein einziges Feld pro Szene, `audioSource`, mit drei Werten:

| Wert | Bedeutung | `withAudio` | Lip-Sync |
| --- | --- | --- | --- |
| `provider` | Modell erzeugt Ton mit (Atmo + Musik im Clip) | true | gesperrt |
| `studio` | Clip stumm, Ton kommt später als Spuren | false | erlaubt |
| `silent` | Clip stumm, kein Ton geplant | false | erlaubt |

Lip-Sync-Szenen setzen zwingend `studio` (oder `silent`) — Provider-Ton auf einer Lip-Sync-Szene wird gar nicht erst angeboten. Das ist die Schutzregel, die verhindert, dass Sound und Lip-Sync kollidieren.

## Was das Briefing tut — und was nicht

Das Briefing **schreibt nur Absicht**, nie Audio:

- Neues Feld `soundDesign` pro Szene (plus global) — der Text aus dem Briefing wird wortgetreu abgelegt und im Plan-Sheet angezeigt.
- `audioSource` wird beim Anwenden abgeleitet: Szene mit Dialog/Lip-Sync → `studio`; Szene ohne Sprache mit Sounddesign-Text → Vorschlag je nach gewähltem Modell (Modell mit eigenem Ton → `provider`, sonst `studio`); nichts davon → `silent`.
- Der Vorschlag ist im Plan-Sheet pro Szene sichtbar und umschaltbar. Kein stiller Automatismus.

Für das Atlantis-Briefing heißt das konkret: kein Cast, kein VO, ausführliches Sounddesign, Modell Seedance 2.5 → beide Szenen kommen als `provider` mit dem Sounddesign-Text im Prompt an, und der Kunde sieht im Sheet den Hinweis, dass nachträgliche SFX-Spuren dann nicht mehr nötig sind.

## Der Audio-Schritt im Motion Studio

Nach der Clipgenerierung bekommt jede Szene im Audio-Bereich eine Karte mit dem hinterlegten Sounddesign-Text und drei Wegen:

- **Provider-Ton behalten** — nichts tun, SFX-Aktionen sind für diese Szene ausgegraut mit Begründung.
- **Automatisch erzeugen** — der Sounddesign-Text geht als Prompt an die SFX-Generierung, das Ergebnis landet als eigene Atmo-Spur. Nur bei `studio`/`silent`.
- **Manuell** — eigene Datei hochladen oder aus der Bibliothek wählen.

Wechselt jemand nachträglich von `provider` auf `studio`, wird die Szene als „neu zu generieren" markiert, statt heimlich einen Clip mit eingebranntem Ton stummzuschalten.

## Untertitel

Untertitel hängen an Sprache, nicht an Ton. Regel:

- Voiceover oder Dialogzeilen im Plan → Untertitel an, Quelle bleibt `auto-from-vo`.
- Weder VO noch Dialog → Untertitel aus. Provider-Ton ändert daran nichts, weil Musik und Atmo nicht untertitelt werden.
- Ein explizites Verbot im Negative Prompt („keine Untertitel", „no subtitles") schaltet sie zusätzlich hart aus.

Heute stehen die Defaults auf „an", das Atlantis-Briefing bekäme also Untertitel ohne einen einzigen gesprochenen Satz.

## Kamerafahrt und Ort (aus derselben Analyse)

Zwei kleinere Lücken, die im selben Zug mitlaufen, weil sie dieselben Dateien betreffen:

- Mehrstufige Kamerafahrten kollabieren heute auf ein einziges `movement`-Token. Neues Feld `cameraChoreographyEN` trägt die vollständige Bewegungsfolge in den Szenenprompt; die Enum-Werte bleiben für die Shot-Director-UI erhalten.
- Unaufgelöste Orts-Mentions mit Beschreibungstext (`@atlantis`) werden im Plan-Sheet mit zwei Aktionen angeboten: „In Cast & World anlegen" oder „Als Freitext-Location übernehmen" — statt den Beschreibungstext zu verwerfen.
- Liegt die Szenendauer über dem, was das gewählte Videomodell kann, warnt das Plan-Sheet vor dem Anwenden und schlägt Seedance 2.5 vor, statt später still zu kürzen.

## Technische Details

- `supabase/functions/_shared/briefing/manifestSchema.ts` + `src/lib/video-composer/briefing/productionPlan.ts`: `soundDesign` (max 1000), `audioSource` (`provider|studio|silent`), `cameraChoreographyEN` (max 600) pro Szene; `soundDesign` optional auf Projektebene. Gleiche Felder in `BRIEFING_TOOL_PARAMETERS`.
- `supabase/functions/_shared/briefing/deep/index.ts`: Prompt-Regeln, damit Sounddesign-Blöcke und Kamerafahrten in die neuen Felder gehen statt in `anchorPromptEN`; Untertitel-Auto-Off nach der Validierung.
- `src/hooks/useApplyProductionPlan.ts`: Ableitung `audioSource` → `withAudio`, Sperre `provider` bei Dialog/Lip-Sync, Sounddesign in den Szenen-Datensatz, Kamerafahrt an den Prompt, globaler Kontinuitätstext in `continuityHint`. Die bestehenden Lip-Sync-Schutzfilter (`clip_status`, `dialog_shots`, `lock_reference_url`) bleiben unverändert; es wird weiterhin nie in `dialog_shots` oder `syncso_*` geschrieben.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`: Sounddesign- und Kamerafahrt-Anzeige, Tonquellen-Umschalter mit Begründung, Aktionen für unaufgelöste Orte, Modell-Dauer-Warnung.
- Motion-Studio-Audiobereich: Szenenkarte mit Sounddesign-Text und den drei Wegen; SFX-Aktionen gesperrt bei `audioSource === 'provider'`; Umschalten auf `studio` markiert die Szene als neu zu generieren.
- `src/config/aiVideoModelRegistry.ts`: explizites Flag `nativeAudio` pro Modell (heute nur implizit über `withAudio`-Sonderfälle im Generierungscode verteilt) — eine Quelle für UI-Sperren und Vorschlagslogik.
- Tests: Atlantis-Briefing als Fixture (2 × 30 s, leerer Cast, Untertitel aus, `audioSource === 'provider'` bei Seedance, Sounddesign und Kamerafahrt vorhanden); zusätzlich ein Test, der `audioSource === 'provider'` auf einer Dialog-/Lip-Sync-Szene verbietet.

Keine Änderungen an Lip-Sync-Ketten, Ankerlogik, Rendering oder Preisen.
