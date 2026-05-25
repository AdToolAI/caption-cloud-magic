# Fix: Onboarding wird erneut gezeigt, obwohl abgeschlossen

## Problem
Neue Nutzer durchlaufen beim ersten Login das `NicheTutorialModal` (3 Schritte) auf `/home` und erzeugen ihre Strategie. Das Panel **„Erste Schritte"** unten links enthält den Punkt **„Onboarding abschließen"**, der auf `/onboarding` verlinkt.

`/onboarding` ist aber ein **zweiter, größerer Wizard mit 6 Schritten** (`src/pages/Onboarding.tsx`) — er prüft **nicht**, ob das Onboarding bereits abgeschlossen wurde, und startet immer bei Schritt 1 (Sprache). Deshalb sieht der Nutzer alles noch einmal.

Zusätzlich markiert `NicheTutorialModal` zwar `onboarding_profiles`, setzt aber **nicht** `profiles.onboarding_completed = true`. Beide „Onboardings" sind also nicht synchronisiert.

## Lösung (3 kleine, gezielte Änderungen)

### 1. `src/pages/Onboarding.tsx` — Guard hinzufügen
Beim Mount prüfen, ob für den eingeloggten Nutzer bereits ein `onboarding_profiles`-Eintrag existiert **oder** `profiles.onboarding_completed === true`. Wenn ja → sofort `navigate("/home", { replace: true })` und kurzer Toast: „Onboarding ist bereits abgeschlossen". Solange der Check läuft, ein dezenter Loading-State statt des Wizards.

### 2. `src/components/onboarding/NicheTutorialModal.tsx` — Status konsistent setzen
Beim Abschluss des Modals (in `generatePlan` direkt nach dem Upsert von `onboarding_profiles`) zusätzlich `profiles.onboarding_completed = true` updaten. So sind beide Quellen konsistent.

### 3. `src/components/onboarding/GettingStartedChecklist.tsx` — Erledigten Schritt nicht mehr verlinken
Wenn `step.done === true` ist, statt `<Link>` ein nicht-klickbares `<div>` rendern (Cursor `default`, kein Hover/Navigieren). Verhindert generell, dass abgehakte Schritte unbeabsichtigt erneut gestartet werden — nicht nur für Onboarding.

## Was bewusst NICHT geändert wird
- Der `/onboarding`-Wizard bleibt funktional erhalten (z. B. für Re-Runs aus Settings), nur der automatische Re-Entry über das Panel ist blockiert.
- Keine DB-Migration nötig — alle Felder existieren bereits.
- Keine Änderung am `NicheTutorialModal`-Flow selbst (3 Schritte + Plan-Preview bleiben).

## Verifikation
- Mit dem frisch angelegten Testaccount `info@useadtool.ai` einloggen → Modal durchlaufen → auf „Onboarding abschließen" im Panel klicken → Weiterleitung auf `/home` statt 6-Step-Wizard.
- Checkliste zeigt Onboarding-Step als abgehakt und nicht mehr klickbar.
