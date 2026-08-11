# Motion Studio: Modus-Schritt ersetzen durch zwei Wege am Ende des Briefings

## Empfehlung

Ja — der Button ist die bessere Lösung. Ein Modus-Schalter ganz oben (SC 01) zwingt eine
Entscheidung ab, bevor der Nutzer überhaupt weiß, was er eingibt, er ist unsichtbar wirksam
und im Code heute faktisch wirkungslos. Zwei Aktionen am Ende des Briefings sind das
Muster, das professionelle Tools nutzen: eine klare Primäraktion und ein leiser Ausweg,
beide genau in dem Moment, in dem die Entscheidung wirklich ansteht.

```text
[ Leer ins Storyboard ]        [ ✦ STORYBOARD GENERIEREN ]
   sekundär, Ghost-Button          primär, Gold-CTA
```

## Was heute passiert (geprüft im Code)

- Der Modus schreibt `briefing.mode` (`src/types/video-composer.ts:109,195`) und wird nur in
  `BriefingTab.tsx` gelesen: CTA-Label (1054), Stock-First-Sichtbarkeit (993), Skip des
  direkten Analyse-Aufrufs (314-318).
- Der Manuell-Zweig ruft `onGoToStoryboard()`. Das landet in
  `VideoComposerDashboard.handleTabChange` (866-871), das jeden Wechsel Briefing → Storyboard
  abfängt und `storyboardTransition.attempt()` startet.
- `useStoryboardTransition.attempt` (1106-1126) kennt nur drei Guards: geschützte Szenen,
  vorhandene Szenen, zu kurzes Briefing. **`briefing.mode` wird dort nirgends geprüft.**
  Wer "Manuell" wählt, bekommt trotzdem Deep-Analyse, War Room, Plan-Sheet und AI-Kosten.

## Umsetzung

1. **Modus-Panel SC 01 entfernen**
   - Die Kachelauswahl "KI-gestützt / Manuell" fällt weg; die folgenden Slate-Nummern
     rücken auf. Das Feld `briefing.mode` bleibt im Typ und in der DB erhalten
     (Alt-Projekte laden weiter), wird aber nicht mehr über UI gesetzt.

2. **Zwei Aktionen in der Briefing-Fußzeile**
   - Primär: "Storyboard generieren" — unverändert der bestehende KI-Pfad.
   - Sekundär: "Leer ins Storyboard" — Ghost-Button links daneben, setzt intern
     `mode: 'manual'` und navigiert direkt weiter.
   - Der Leer-Weg braucht nur den Produktnamen, nicht die volle Briefing-Pflicht: er ist
     auch aktiv, wenn der Gold-CTA noch gesperrt ist.

3. **Leer heißt leer — kein Auto-Analyse-Start**
   - Neuer Guard ganz vorne in `useStoryboardTransition.attempt()`: bei
     `briefing.mode === 'manual'` sofort `{ handled: false }`. Ohne diesen Guard bleibt der
     Button wirkungslos, weil das Dashboard die Analyse weiterhin selbst anstößt.
   - Der KI-Pfad und alle bestehenden Guards bleiben unverändert.

4. **Rückweg im leeren Storyboard**
   - Im Empty-State (`StoryboardTab.tsx:698`) neben "Szene hinzufügen" eine zweite,
     dezente Aktion "Aus Briefing generieren": setzt `mode: 'ai'` und stößt die Analyse
     einmalig an. Niemand sitzt in einer Sackgasse.

5. **Stock-First**
   - Der Schalter hängt heute an `mode === 'ai'`. Da der Modus nicht mehr vorab gewählt
     wird, ist er künftig immer sichtbar — er wirkt ohnehin nur bei KI-Generierung.

6. **Absichern**
   - Test: `attempt()` mit `mode: 'manual'` und langem Briefing liefert `handled: false`
     und setzt keinen Fetch ab.

## Technische Details

- `src/components/video-composer/BriefingTab.tsx` — SC-01-Panel raus, Slate-Indizes
  nachziehen; Footer bekommt den Ghost-Button, der `onUpdateBriefing({ mode: 'manual' })`
  plus `onUpdateProject({ status: 'storyboard' })` plus `onGoToStoryboard()` ausführt;
  `handleGenerateStoryboard` behält nur noch den KI-Pfad; Stock-First-Bedingung entfällt.
- `src/hooks/useStoryboardTransition.ts` — Guard 0 auf `briefing?.mode === 'manual'`
  vor Guard 1, Kommentar analog zu den bestehenden Guards.
- `src/components/video-composer/StoryboardTab.tsx` — Sekundäraktion im Empty-State über
  die bestehende `onUpdateBriefing`-Prop, keine neue State-Quelle.
- Kein Eingriff in `analyze-briefing`, `useApplyProductionPlan`, Lip-Sync oder Render-Pfad.
- Alle neuen Texte über `tx({ de, en, es })` gemäß Language-Purity-Check.
