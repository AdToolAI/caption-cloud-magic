

## Stop. Diagnose first — keine weiteren blinden Fixes.

Ich habe in diesem Loop bereits **5 verschiedene Code-Änderungen** an denselben drei Dateien gemacht — jede mit einer überzeugenden Begründung, jede mit dem Effekt "Symptome verschoben, nicht gelöst". Das ist klassisches Loop-Verhalten und ich höre damit auf.

## Was ich jetzt brauche statt weiterer Hypothesen

**Echte Daten von einem konkreten fehlgeschlagenen Render**, nicht Theoriemodelle:

1. **Edge Function Logs** vom letzten Render: `compose-video-assemble` — was wurden tatsächlich für Werte berechnet (sumSceneFrames, durationSeconds pro Szene, realDuration)
2. **Renderer-Bundle-Version**: ist das Lambda-Bundle nach dem letzten Fix tatsächlich neu deployed worden? (`bundle-version.json` checken)
3. **DB-Snapshot eines konkreten Composer-Projekts**: was steht wirklich in `assembly_config`? Welche `durationSeconds` hat jede Szene? Welcher Render lief zuletzt durch?
4. **Audio/Voiceover-State**: wann wurde das WAV zuletzt generiert? Vor oder nach den Szenen-Anpassungen?

## Und 2 Klärungsfragen an dich, weil ich das nicht raten kann

### Frage 1: Hast du seit dem letzten Fix das Lambda-Bundle redeployed?
Ich habe in Plan + Code geschrieben "redeploy nicht vergessen" — aber ich sehe nicht ob du den `npx remotion lambda sites create ...` Befehl tatsächlich ausgeführt hast. Wenn nicht, läuft das Lambda **immer noch mit dem alten Bundle** — alle meine letzten Code-Änderungen sind dann unwirksam.

### Frage 2: Welche Symptome **genau** in welcher Reihenfolge?
- Stotterer (ursprünglich) → angeblich behoben
- Gummibandeffekt → angeblich behoben  
- Wiederholung von Szene 5 + VO-Cut → ?
- **Aktuell**: was siehst/hörst du **konkret**? An welchen Übergängen? Audio oder Video oder beides?

## Plan

### Phase 1 — Echte Diagnose (lese, analysiere, NICHT codieren)

1. **Bundle-Version prüfen**: `bundle-version.json` von S3 fetchen → ist das aktuelle Bundle deployed?
2. **Edge Function Logs lesen**: letzter `compose-video-assemble` Run → welche `sumSceneFrames`, `durationInFrames`, `realDuration` pro Szene wurden gelogt?
3. **DB-Query**: dein letztes `composer_project` mit allen `assembly_config`-Werten, plus letzter `video_render` mit Status + Output-URL
4. **Code-Re-Read**: aktuellen Stand von `ComposedAdVideo.tsx`, `compose-video-assemble/index.ts`, `VoiceSubtitlesTab.tsx` lesen — was ist nach den letzten Edits **wirklich** im Code?

### Phase 2 — Hypothese mit Daten begründen

Erst nach den echten Werten formuliere ich eine neue Hypothese — diesmal mit konkreten Frame-Zahlen, nicht Spekulation. Beispiel-Format:
> "Szene 4: real=176f, configured=210f, sentToRenderer=176f. Szene 5: real=176f, configured=210f, sentToRenderer=176f. Audio-Track: 13.5s = 405f. Komposition-sumFrames: 880f = 29.33s. Differenz: ..."

### Phase 3 — Gezielter Fix (NICHT vorher)

Wenn die Daten zeigen:
- **Bundle nicht deployed** → User muss redeployen, kein Code-Change
- **Edge-Function-Werte korrekt, Renderer ignoriert sie** → Bundle-Cache-Problem oder Renderer-Bug
- **WAV wurde vor Probe generiert** → WAV-Regenerationspflicht in UI einbauen
- **Etwas ganz anderes** → entsprechend handeln

### Phase 4 — Verify

Konkreter Test mit dem **gleichen** Composer-Projekt, vergleichen mit den vorherigen Render-URLs (Vorher/Nachher).

## Klärungsfragen die ich dir jetzt stelle

Beantworte bitte diese 2 Punkte bevor ich weiter mache:

1. **Bundle-Deploy-Status**: Hast du nach meinem letzten Code-Change (Edge Function + Renderer Vereinfachung) den Befehl `npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1` in deinem CMD ausgeführt? (Ja/Nein/Weiß nicht mehr)

2. **Aktuelles Symptom**: Beschreibe in **einem** Satz was genau falsch ist:
   - "Wieder Stotterer an Übergang X→Y"
   - "Wieder Wiederholung an Übergang X→Y"  
   - "Wieder Gummiband an Übergang X→Y"
   - "Audio-Cut an Übergang X→Y"
   - "Etwas Neues: ..."

## Geänderte Dateien (voraussichtlich nach Daten-Analyse)

Noch unbekannt — ich entscheide nach den echten Logs/DB-Werten welche Datei tatsächlich angefasst werden muss. Möglich sind:
- **Keine** (nur Bundle-Redeploy nötig)
- `src/components/video-composer/VoiceSubtitlesTab.tsx` (WAV-Regenerationszwang)
- `supabase/functions/compose-video-assemble/index.ts` (Probe-Reihenfolge)
- `src/remotion/templates/ComposedAdVideo.tsx` (Audio-Sequence-Geometrie)

## Warum dieser Plan diesmal anders ist

Ich habe in den letzten 5 Iterationen **gecodet ohne zu messen**. Das endet jetzt. Phase 1 produziert **null Code-Änderungen** — nur Datenerhebung. Erst wenn ich die echten Frame-Zahlen aus deinem letzten Render habe, mache ich einen Fix. Wenn die Daten zeigen "alles korrekt im Code, nur Bundle alt" → kein Code-Change, nur Deploy-Anweisung.

