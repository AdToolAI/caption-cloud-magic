

## Nischen-Tutorial fuer bestehende Accounts erzwingen

### Problem
Das Nischen-Tutorial (Nische, Plattformen, Ziele) wird nur bei der Erstregistrierung im `/onboarding`-Flow durchlaufen. Bestehende Accounts haben kein `onboarding_profiles`-Eintrag und bekommen daher keine personalisierten Starter-Plaene oder KI-Empfehlungen.

### Loesung

Beim Login auf `/home` pruefen, ob der User bereits ein `onboarding_profiles`-Eintrag hat. Wenn nicht, wird ein modaler Nischen-Wizard angezeigt (nicht die komplette Onboarding-Seite, da Sprache/Brand bereits gesetzt sind). Erst nach Abschluss sieht der User das Dashboard mit personalisiertem Starter-Plan.

```text
Bestehender User loggt sich ein
  → Home.tsx prueft: hat User onboarding_profiles?
  → NEIN → Nischen-Tutorial-Modal (4 Schritte: Nische → Plattformen → Ziele → Plan generieren)
  → JA → Normales Dashboard
```

### Aenderungen

| Datei | Aenderung |
|---|---|
| `src/components/onboarding/NicheTutorialModal.tsx` | NEU — Modal-Wizard mit 4 Schritten: NicheStep, PlatformStep, GoalsStep, StarterPlanPreview. Nutzt bestehende Step-Komponenten. Speichert in `onboarding_profiles`, ruft `generate-starter-plan` auf, zeigt Plan-Vorschau. |
| `src/pages/Home.tsx` | Beim Laden pruefen ob `onboarding_profiles` fuer User existiert. Wenn nicht: `NicheTutorialModal` anzeigen (blockierend). Nach Abschluss: `loadDashboardData()` neu aufrufen um Starter-Plan zu laden. |

### Technische Details

**NicheTutorialModal.tsx**:
- Vollbild-Dialog (nicht schliessbar ohne Abschluss)
- Nutzt existierende Komponenten: `NicheStep`, `PlatformStep`, `GoalsStep`, `StarterPlanPreview`
- Speichert Profil via `supabase.from("onboarding_profiles").upsert()`
- Ruft `generate-starter-plan` Edge Function auf
- Nach "Los geht's" schliesst Modal und laedt Dashboard neu

**Home.tsx Aenderungen**:
- Neuer State: `showNicheTutorial` (boolean)
- In `useEffect` beim Laden: Query auf `onboarding_profiles` wo `user_id = user.id`
- Wenn kein Eintrag: `setShowNicheTutorial(true)`
- Render: `{showNicheTutorial && <NicheTutorialModal onComplete={handleTutorialComplete} />}`
- `handleTutorialComplete`: setzt `showNicheTutorial = false`, ruft `loadDashboardData()` auf

