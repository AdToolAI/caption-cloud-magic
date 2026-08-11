# Sprecher-Zuordnung: echte Ursache serverseitig beheben

## Befund (mit den echten Plandaten belegt)

Der zuletzt gespeicherte Production Plan enthält:

- Cast: nur **3 Slots** — `@founder` (Samuel), `@creative` (Kailee), `@marketer` (Sarah). Matthew / `@creator` fehlt komplett.
- Dialogzeilen: **11 Turns**, deren Sprecher `@dauer`, `@ort`, `@cast`, `@aktion`, `@stimme`, `@untertitel`, `@negative-prompt` sind.

Das sind keine Sprecher, sondern die **Strukturzeilen des Briefings** ("DAUER: …", "ORT: …", "CAST: …"). Der Script-Timing-Detektor der Edge-Function liest jede `LABEL: Text`-Zeile als Sprecherzeile; seine Ausschlussliste (`NON_SPEAKER_LABELS`) kennt nur englische/teil-deutsche Begriffe wie `scene`, `location`, `action`, aber nicht `dauer`, `ort`, `cast`, `stimme`, `untertitel`, `negative-prompt`, `ziel`, `produkt`.

Damit ist klar: Die clientseitige Auto-Besetzung war nicht der Fehler. Sie filtert diese Label-Mentions korrekt heraus — es bleiben also 0 echte Sprecher zum Zuordnen übrig, während das Warnfeld weiterhin 10–11 Pseudo-Dialogzeilen zählt.

## Umsetzung

1. **Strukturlabels nie als Sprecher lesen** (`detectScriptTimingMode.ts`)
   - Ausschlussliste um alle Briefing-Blockschlüssel erweitern: `dauer`, `länge`, `ort`, `cast`, `besetzung`, `aktion`, `stimme`, `voice`, `untertitel`, `subtitle`, `negativ-prompt`, `negative prompt`, `ziel`, `produkt`, `zielgruppe`, `tonalität`, `stil`, `format`, `kamera`, `übergang`, `projekt` — jeweils DE/EN/ES.
   - Zusätzlich strukturell absichern: eine Zeile gilt nur dann als Sprecherzeile, wenn das Label nicht in Versalien-Blockform mit bekanntem Schlüsselwort steht.
   - Ergebnis: aus einem Briefing ohne echte Dialogzeilen entstehen **keine** Dialog-Turns mehr.

2. **Cast vollständig halten**
   - Die im Briefing gewählten Cast-&-World-Figuren definieren die Mindestbesetzung. Liefert das Modell weniger Slots, werden die fehlenden Figuren in Auswahlreihenfolge als offene Slots ergänzt (max. 4) — der vierte Sprecher verschwindet damit nicht mehr.
   - Läuft in der Edge-Function beim Zusammenbau des Manifests, sodass auch der gespeicherte Plan korrekt ist.

3. **Warnfeld ehrlich machen** (`ProductionPlanSheet.tsx`)
   - "Sprecher-Zuordnung offen" und der Zähler "N Dialogzeilen übernehmen" zählen nur noch **echte** Sprecher-Turns.
   - Enthält der Plan keine echten Dialogzeilen, verschwinden Warnung und Checkbox vollständig statt 10 Meta-Zeilen anzubieten.

4. **Regressionstest**
   - Fixture aus dem Continuity-Stress-Test-Briefing (Blocklabels DAUER/ORT/CAST/AKTION + 4 gewählte Figuren).
   - Erwartung: 0 Label-Turns, 4 Cast-Slots in Auswahlreihenfolge, keine offene Sprecher-Warnung.
   - Zweite Fixture mit echtem Dialog ("Samuel: …", "Kailee: …") muss weiterhin korrekte Turns und Bindung erzeugen.

## Technische Bereiche

- `supabase/functions/_shared/briefing/deep/detectScriptTimingMode.ts` — Label-Filter
- `supabase/functions/_shared/briefing/deep/index.ts` — Cast-Mindestbesetzung aus der Briefing-Auswahl
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Zähler/Warnung nur für echte Sprecher
- Test unter `src/lib/video-composer/briefing/__tests__/`

Lip-Sync-Pipeline, gerenderte und gesperrte Szenen bleiben unverändert.
