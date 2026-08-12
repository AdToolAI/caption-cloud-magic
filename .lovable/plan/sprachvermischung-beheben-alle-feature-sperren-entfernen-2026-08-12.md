# Sprachvermischung beheben + alle Feature-Sperren entfernen

## Befund (gemessen)

**1. Spanisch in der deutschen/englischen Oberfläche**

Der Button auf dem Screenshot heißt `aiVid.upgradeNow`. In `src/lib/translations.ts` steht im **deutschen** Block (Zeile 18183) der Wert `'Actualizar ahora'`. Die Ursache liegt nicht in den Komponenten, sondern in den `Object.assign(translations.de|en, {...})`-Nachträgen am Dateiende.

Gezählt über alle Sprachblöcke inkl. Nachträge:
- **66 deutsche Einträge mit spanischem Text** (u. a. `de.dc.videoProcessing` = „El vídeo se está procesando…", `de.aiVid.upgradeNow`, `de.socialIntegrations.noConnections` / `.unlimited` / `.connectionFailed`)
- **2 englische Einträge mit spanischem Text** (`en.dc.videoFilesNotInAudioTracks`, `.videoFilesNotMovable`)
- Der spanische Block ist sauber.

**2. Feature-Sperren**

`src/pages/AIVideoToolkit.tsx` blockt bei `!hasFullAccess` die komplette Seite mit der Upgrade-Wand aus dem Screenshot. `useTrialAccess()` liefert `hasFullAccess` nur bei aktivem Abo oder laufendem Trial. Weitere Wände hängen an derselben Logik in `Carousel.tsx`, `Calendar.tsx`, `BrandKit.tsx`, `BioOptimizer.tsx`, `UpgradeModal.tsx`, `PlanLimitDialog.tsx` sowie an den Plan-Checks in `src/lib/entitlements.ts` und `src/lib/access-control.ts`.

## Umsetzung

### Schritt 1 — Alle Feature-Sperren aufheben
- `useTrialAccess()` gibt `hasFullAccess: true` konstant zurück (wie schon bei `useFeatureGate`, das bereits ein No-Op-Shim ist). Trial-/Abo-Status bleibt als Information erhalten, steuert aber keinen Zugang mehr.
- Die Entitlement-Prüfungen in `entitlements.ts` (`canQuickCalendarPost`, `canUseTeamFeatures`, `canUseWhiteLabel`, `canUseApi`, `canUseXTwitter`) und `hasAccess`/`hasReachedLimit` in `access-control.ts` liefern durchgehend Freigabe.
- Die Upgrade-Wände in AI Video Toolkit, Carousel, Calendar, BrandKit, BioOptimizer und `QuickPostGate` rendern damit immer den Inhalt; die reine Login-Pflicht bleibt bestehen.
- Es bleibt nur die Anmeldung als Voraussetzung — kein Test-, Abo- oder Plan-Check blockt noch irgendeine Funktion.

### Schritt 2 — Sprachvermischung bereinigen
Alle 68 kontaminierten Einträge werden einzeln korrigiert: deutscher Block bekommt deutschen Text, englischer Block englischen. Grundlage ist der jeweils korrekte Text aus einer der drei Sprachen — es wird nichts neu erfunden. Produktnamen (Sora 2, Credits, Prompt) bleiben unverändert. Grenzfälle (korrektes Deutsch, das nur einen Marker enthält) werden manuell bewertet statt pauschal ersetzt.

Zusätzlich wird `src/lib/translationsFill.ts` mitgeprüft, da es als Fallback-Ebene direkt in die Oberfläche durchschlägt.

### Schritt 3 — Dauerhafte Absicherung
`scripts/check-i18n-consistency.mjs` prüft heute nur Platzhalter innerhalb von `tx()`-Blöcken; diese Fehlerklasse fällt komplett durch. Ergänzt wird:
1. **Sprach-Kontamination**: Jeder Eintrag in `translations.ts` (Hauptblöcke **und** alle `Object.assign`-Nachträge) sowie `translationsFill.ts` wird gegen sprachtypische Marker geprüft (es: `vídeo`, `está`, `función`, `¿`, `¡`; de: Umlaute/`nicht`; en: `the/is/and`). Ein Treffer bricht den Lauf ab.
2. **Schlüssel-Parität**: Jeder Key muss in allen drei Sprachen existieren, inklusive der Nachträge.
3. **Identische Werte über Sprachen**: `de` == `es` als Warnung, mit Ausnahmeliste für Produktnamen/Kurzlabels.

### Schritt 4 — Gegenprüfung
Durchgang durch AI Video Toolkit, Director's Cut, Video-Übersetzer, Social-Integrationen, Picture Studio, News Hub und Community in DE und EN; Prüfskript muss null Treffer liefern.

## Technische Details
- Geänderte Dateien: `src/hooks/useTrialAccess.ts`, `src/lib/entitlements.ts`, `src/lib/access-control.ts`, die betroffenen Seiten mit Upgrade-Wand, `src/lib/translations.ts`, ggf. `src/lib/translationsFill.ts`, `scripts/check-i18n-consistency.mjs`.
- Keine Änderungen an Edge Functions, Datenbank, Stripe-Logik oder KI-Prompts. Abrechnung und Abo-Status bleiben technisch bestehen, steuern nur keinen Zugang mehr.
- Der Fallback in `useTranslation` (Sprache → Fill → EN → DE → Key) bleibt unverändert.
