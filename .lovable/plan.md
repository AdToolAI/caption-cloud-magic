# Abschlussanalyse: Briefing → fertiger Clip

Ergebnis der Durchsicht der kompletten Strecke, plus drei kleine Korrekturen,
die vor dem Testlauf sinnvoll sind, und ein konkretes Testprotokoll.

## Die Strecke, Station für Station

```text
Briefing-Eingabe (BriefingTab)
  └─ analyze-briefing  (Modi storyboard / deep / freeform, 3-Modell-Kette
                        Gemini Flash → Flash → Pro, lokalisierte Fehler)
      └─ Produktionsplan (ProductionPlanSheet) → Freigabe durch dich
          └─ useApplyProductionPlan
               · schreibt Projekt + Szenen
               · wählt Modell/Länge (pickClipSourceForDuration)
               · schlägt Quick- oder Direkt-Modus vor (einmalig)
               └─ SceneCard: Modell, Länge, Lip-Sync, Bildanschluss,
                             Umgebungston
                   └─ compose-video-clips  (Dispatch pro Anbieter)
                        · Seedance 2.5 → ModelArk-Task (kein Webhook)
                        · Bild-Inputs: genau EIN Slot
                        · stumme Platte bei Lip-Sync
                        └─ modelark-poll → compose-clip-webhook
                             · Sprach-Gate für Umgebungston
                             · letztes Bild für die Folgeszene
                             └─ compose-dialog-segments (Sync.so:
                                Preclip → Face-Gate → Dispatch)
                                 └─ sync-so-webhook
                                     └─ render-sync-segments-audio-mux
                                         └─ DialogStitchVideo (Remotion)
                                             └─ Export (EDL/FCPXML/Bundle)
```

Absicherungen, die schon greifen: Plan-Übernahme überschreibt nie eine bereits
gerenderte oder laufende Szene; Sync.so hat Circuit Breaker und Watchdog;
ModelArk-Aufträge laufen auch weiter, wenn der Browser zu ist; das Sprach-Gate
kann einen fertigen Render nie in einen Fehler verwandeln.

## Drei Lücken, die ich vor dem Testlauf schließen würde

1. **Dialogszenen werden auf 15 s gekürzt.** Die Modellwahl bei der
   Plan-Übernahme kürzt Dialogszenen still auf das Limit des voreingestellten
   Anbieters, weil dort noch steht, Seedance 2.5 sei nicht lip-sync-fähig.
   Seit gestern ist es das (hinter dem Rollout-Schalter). Eine 25-s-Dialogszene
   aus dem Briefing landet daher als 15-s-Szene im Projekt — genau der Fall,
   den du testen willst.
   → Bei aktivem Schalter dürfen Dialogszenen ebenso auf Seedance 2.5
   umgeroutet werden statt gekürzt.

2. **Untergrenze uneinheitlich.** Der Vorab-Check lehnt Seedance-Szenen unter
   4 s ab, die Dispatch-Stelle erlaubt rechnerisch 3 s. Eine Zahl, an einer
   Stelle: 4 s.

3. **Fehlgeschlagener Guthaben-Abzug verschwindet still.** Schlägt der Abzug
   nach dem Start der Clips fehl, wird nur geloggt. Für den Testlauf ist das
   unkritisch, aber es sollte mindestens als Warnung im Job-Ergebnis
   auftauchen, damit du es siehst.

## Testprotokoll (in dieser Reihenfolge)

1. **Briefing** mit gemischten Szenen: eine 8-s-Establisher-Szene ohne Dialog,
   eine 25-s-Dialogszene mit einer Figur, eine 12-s-Szene ohne Dialog.
   Erwartung: Analyse liefert Plan, Dialogszene bleibt 25 s und trägt
   Seedance 2.5.
2. **Plan übernehmen**, Modus-Vorschlag prüfen (sollte „Direkt" sein, weil
   Sprache vorkommt).
3. **Szene 1 rendern** (kein Dialog, Provider-Ton erlaubt) — Sichtprüfung.
4. **Szene 2 rendern** (Dialog + Lip-Sync + „Umgebungston vom Modell") —
   erwartet: stumme Sprache im Plate, Atmo vorhanden, Sprach-Gate `passed`.
5. **Szene 3 mit Bildanschluss „Nahtlos"** — erwartet: startet auf dem letzten
   Bild von Szene 2.
6. **Finaler Mux + Export** — Stimme vorn, Atmo leise darunter, Lippen
   synchron, Untertitel korrekt.
7. Guthaben vorher/nachher notieren, um die Kalkulation gegenzuprüfen.

Ich begleite jeden Schritt: nach jedem Render lese ich Szenenstatus,
Funktions-Logs und die Gate-Ergebnisse und melde, was auffällt.

## Technische Details der drei Korrekturen

- `src/lib/composer/pickClipSourceForDuration.ts`: `pickClipSourceForDuration`
  bekommt ein Feld `longFormDialogAllowed` (vom Client aus
  `useSeedance25Lipsync()` gespeist). Ist es gesetzt und überschreitet eine
  Dialogszene das Limit ihres Anbieters, wird auf `ai-seedance25` umgeroutet
  statt gekürzt. Aufrufer: `src/hooks/useApplyProductionPlan.ts`. Kommentar
  in der Datei entsprechend korrigieren; Tests in
  `src/lib/composer/__tests__/` ergänzen.
- `supabase/functions/compose-video-clips/index.ts:4173`: Clamp auf
  `Math.max(4, Math.min(30, …))` angleichen an den Guard bei `:1892`.
- `supabase/functions/compose-video-clips/index.ts:4700-4735`: Bei
  fehlgeschlagenem Abzug ein `creditWarning` in die Antwort aufnehmen (kein
  Abbruch, kein Verhaltenswechsel).

Keine Änderung an der Lip-Sync-Kette selbst (v400-Freeze bleibt unangetastet).
