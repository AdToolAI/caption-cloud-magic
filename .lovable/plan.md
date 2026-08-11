# Motion Studio: Manueller Modus sauber verdrahten

## Was heute passiert (geprüft im Code)

Der Modus-Schalter (SC 01 "KI-gestützt" / "Manuell") schreibt `briefing.mode`
(`src/types/video-composer.ts:109,195`) und wird mit dem Briefing als JSON gespeichert
(`src/hooks/useComposerPersistence.ts:131`). Gelesen wird der Wert aber **nur** in einer
einzigen Datei: `src/components/video-composer/BriefingTab.tsx`.

Dort bewirkt "Manuell" genau zwei Dinge:
- Der CTA heißt "Weiter zum Storyboard" statt "Storyboard generieren" (Zeile 1054).
- Der Stock-First-Schalter wird ausgeblendet (Zeile 993).
- Der direkte Aufruf `analyze-briefing?mode=storyboard` wird übersprungen (Zeile 314-318).

## Der Widerspruch

Der Manuell-Zweig ruft `onGoToStoryboard()` auf. Das landet in
`VideoComposerDashboard.handleTabChange` (Zeile 866-871), und der fängt jeden Wechsel
Briefing → Storyboard ab und startet `storyboardTransition.attempt()`.
`useStoryboardTransition.attempt` (Zeile 1106-1126) kennt nur drei Guards: geschützte Szenen,
bereits vorhandene Szenen, zu kurzes Briefing. **`briefing.mode` wird dort nirgends geprüft.**

Ergebnis: Wer "Manuell" wählt und genug Briefing-Text hat, bekommt trotzdem die volle
Deep-Analyse mit War Room, Plan-Sheet und AI-Kosten — also exakt das, was er abgewählt hat.
Der "Skip" in BriefingTab ist damit wirkungslos. Nur bei sehr kurzem Briefing (< 40 Zeichen)
fühlt sich der Manuell-Modus heute korrekt an.

Zweitens: Der Modus ist ein reines Briefing-Flag. Nach dem Storyboard-Einstieg liest ihn
niemand mehr — Autopilot, Szenen-KI-Buttons und Plan-Übernahme verhalten sich identisch.
Das ist vertretbar (manuelle Nutzer sollen einzelne KI-Helfer ja punktuell nutzen dürfen),
aber es sollte bewusst so benannt sein statt zufällig.

## Umsetzung

1. **Manuell heißt manuell — kein Auto-Analyse-Start**
   - In `useStoryboardTransition.attempt()` einen vierten Guard ganz vorne ergänzen:
     bei `briefing.mode === 'manual'` sofort `{ handled: false }` zurückgeben.
     Damit navigiert das Dashboard einfach zum Storyboard, ohne War Room und ohne
     AI-Request. Der Hook bekommt `briefing` bereits als Prop, es ist kein neues Wiring nötig.

2. **KI-Modus bleibt unverändert**
   - Kein Eingriff in Guards 1-3, in `analyze-briefing`, in die Plan-Übernahme oder in
     `useApplyProductionPlan`. Der KI-Pfad verhält sich exakt wie heute.

3. **Manueller Einstieg wird nicht zur Sackgasse**
   - Der leere Storyboard-Zustand (`StoryboardTab.tsx:698`) bekommt zusätzlich zum
     "Szene hinzufügen"-CTA eine zweite, dezente Aktion "Doch KI-Vorschlag erzeugen",
     die den Modus auf `ai` setzt und die Analyse einmalig anstößt. So bleibt der
     Wechsel jederzeit möglich, ohne zurück ins Briefing zu müssen.

4. **Modus im Storyboard sichtbar machen**
   - Kleiner Statusindikator in der Storyboard-Kopfzeile ("Manuell" / "KI-gestützt"),
     klickbar zum Umschalten. Damit ist für den Nutzer erkennbar, warum die Analyse
     lief oder nicht lief.

5. **Absichern**
   - Test in `src/hooks/__tests__/` : `attempt()` mit `mode: 'manual'` und langem
     Briefing muss `handled: false` liefern und darf keinen Fetch absetzen.

## Technische Details

- `src/hooks/useStoryboardTransition.ts` — Guard 0 auf `briefing?.mode === 'manual'`
  vor Guard 1; Kommentarblock analog zu den bestehenden Guards.
- `src/components/video-composer/BriefingTab.tsx` — Manuell-Zweig bleibt wie er ist
  (er wird durch den neuen Guard erstmals wirksam).
- `src/components/video-composer/StoryboardTab.tsx` — Empty-State-Sekundäraktion +
  Modus-Chip; beides über bestehende `onUpdateBriefing`-Prop, keine neue State-Quelle.
- Keine Änderungen an Lip-Sync-Dateien, an `analyze-briefing` oder am Render-Pfad.
- Alle neuen Texte über `tx({ de, en, es })` gemäß Language-Purity-Check.
