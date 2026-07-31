## Ziel

Die Positionierung endet aktuell an der Startseite. Nach der Anmeldung spricht das Produkt weiter die Caption-Sprache. Diese Lücke wird geschlossen — ohne Umbau der Navigation und ohne Funktionsverlust.

Verbindliche Hierarchie in allen Texten:
1. **Ein Creator. Ein ganzes Studio.** (Marke)
2. **Alle führenden KI-Modelle. Ein durchgängiger Workflow.** (Differenzierung)
3. **Von der Idee zum fertigen Video — ohne Filmteam.** (Nutzen)

Social bleibt erhalten, wird aber sprachlich als **letzter Schritt** eingeordnet: Video fertig → veröffentlichen. Nicht als eigenes Produkt.

---

## 1. Onboarding: erster Eindruck bestätigt das Versprechen

Betrifft `WelcomeModal`, `OnboardingFlow`, `GettingStartedChecklist`, `ProductTour`, `StarterPlanPreview`, `GoalsStep`, `PlatformStep`.

- Der erste vorgeschlagene Schritt wird **„Dein erstes Video"** statt „Create Your First Caption".
- Die Getting-Started-Checkliste folgt dem Produktionsweg: Charakter anlegen → Szene bauen → Stimme wählen → exportieren → veröffentlichen.
- Der Plattform-Schritt wird als Ausspielziel formuliert („Wo soll dein Video hin?"), nicht als Kanalverwaltung.
- Die Ziel-Auswahl bekommt videoorientierte Optionen statt reiner Posting-Ziele.

## 2. Preisdarstellung in Studio-Einheiten

Heute sind Features als „20 AI captions per month" gestaffelt — das widerspricht dem Versprechen und der bereits umgesetzten Umstellung auf Media Credits.

- Feature-Listen in `translations.ts` und `UpgradeModal.tsx` werden auf Video-, Bild- und Musik-Einheiten sowie Studio-Zugang umformuliert.
- Captions bleiben als Nebenleistung gelistet, nicht als Hauptmerkmal.
- Der Beta-Preis und der Gründer-Rabatt bleiben unverändert; nur die Beschreibung ändert sich.

## 3. Sprach-Sweep durch die Anwendung

- Überschriften, leere Zustände, Tooltips und Erfolgs-/Fehlermeldungen, die „Social Media Manager", „Caption-Generator" oder ähnliche Formulierungen als Produktbeschreibung verwenden, werden angepasst.
- **Wichtig:** Rein funktionale Vorkommen bleiben unberührt — ein Eingabefeld für den Begleittext eines Posts heißt weiterhin „Caption". Geändert wird nur, wo das Produkt sich selbst beschreibt.
- Die Bereiche Composer, Coach, Calendar und Caption Insights bekommen eine kurze Einordnung als Veröffentlichungs-/Distributionsschritt.

## 4. E-Mails

Betrifft die Willkommens-, Aktivierungs-, Drip- und Rückgewinnungs-Strecken.

- Betreffzeilen und Einstiegsabsätze folgen der neuen Hierarchie.
- Die Handlungsaufforderung führt in die Videoproduktion, nicht in den Caption-Generator.
- Rechtliche Fußzeilen und Abmeldelogik bleiben unverändert.

## 5. Drei Sprachen gleichzeitig

Jede Textänderung wird in **DE, EN und ES** gepflegt. Keine Sprache bleibt auf dem alten Stand — sonst entsteht genau die Inkonsistenz, die wir beheben wollen.

---

## Technische Hinweise

- Schwerpunkt liegt auf `src/lib/translations.ts` (drei Sprachblöcke), `src/components/onboarding/*` und `src/components/UpgradeModal.tsx`.
- E-Mail-Texte liegen in den Funktionen `process-activation-emails`, `process-drip-emails`, `process-winback-emails` und `grant-welcome-bonus`.
- Es werden keine Routen entfernt, keine Navigation umgebaut, keine Datenbankänderungen vorgenommen und keine Preise verändert. Reine Präsentationsebene.
- `mem://brand/positioning-territory` dient als verbindliche Textquelle und wird um die Regel „Social = Distributionsschritt" ergänzt.

## Nicht Teil dieses Plans

- Navigation nach Workflow ordnen
- Caption-Bereiche zurückstufen oder verstecken
- Neue Funktionen
