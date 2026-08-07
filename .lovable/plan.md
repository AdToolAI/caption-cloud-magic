# Warum der neue Account nur 3 Berechtigungen zeigt

## Was die Screenshots beweisen

Beim alten Profil zeigt Meta im Dialog Abschnitte **mit Namen konkreter Assets**:
"Manage your business" (Portfolio + Bestofproducts4u) und "Create and manage content on your Page" mit den Seiten "Mystische aber wahre Geschichten" und "Bestofproducts4u".

Beim neuen Profil (info@useadtool.ai) erscheinen dieselben Rechte **ohne jede Asset-Zeile** — nur drei generische Schalter "Content erstellen und verwalten", "Inhalte lesen", "Liste der Seiten anzeigen". Der Abschnitt "Manage your business" fehlt komplett.

Meta rendert Asset-Zeilen nur für Objekte, die das angemeldete Profil tatsächlich besitzt bzw. administriert. Keine Zeile = für dieses Profil existiert kein auswählbares Objekt. Das deckt sich exakt mit der Messung aus dem Diff-Panel: Profil `1221••••7304` liefert 0 Seiten und `business_management` wird nicht erteilt (Meta erteilt eine Portfolio-Berechtigung nicht, wenn kein Portfolio zur Auswahl steht).

Fazit, gemessen und nicht vermutet: Das ist **kein Fehler in unserer Plattform und keine App-Review-Sache**. Dem Facebook-Profil info@useadtool.ai sind schlicht keine Seiten und kein Business-Portfolio als Person zugeordnet. Die beiden Seiten hängen am Profil bestofproducts4u.

## Was du bei Meta tun musst (das löst es)

Eine der beiden Varianten:

1. **Seiten/Portfolio dem neuen Profil geben**: Meta Business Suite mit dem alten Profil öffnen → Einstellungen → Personen → info@useadtool.ai als **Vollzugriff/Administrator** zum Portfolio und zu beiden Seiten hinzufügen. Einladung mit dem neuen Profil annehmen. Danach zeigt der Dialog dort dieselben Asset-Zeilen.
2. **Oder** dauerhaft mit dem Profil verbinden, das die Seiten administriert.

Wichtig: "Nur Analyse"/"Redakteur" reicht nicht — für `pages_manage_posts` und Portfolio-Zugriff braucht es Vollzugriff.

## Was ich in der App ändere

Kein Backend-/OAuth-Eingriff. Nur der Befund wird ehrlich und handlungsleitend:

- Der bestehende Warnblock auf der Facebook-Karte bekommt statt der allgemeinen Formulierung den konkreten Befund: "Diesem Facebook-Profil sind keine Seiten und kein Business-Portfolio zugeordnet — deshalb zeigt Meta im Dialog nur drei allgemeine Schalter ohne Seitenauswahl."
- Darunter eine kurze 2-Schritt-Anleitung (Profil im Portfolio als Administrator hinzufügen ODER mit dem Seiten-Profil verbinden) plus den bereits vorhandenen Button "Mit anderem Facebook-Konto verbinden".
- Der Reset-Button bleibt, wird aber als Zweitoption dargestellt — ein Consent-Reset behebt fehlende Assets nicht.

## Technische Details

- `src/components/performance/ConnectionsTab.tsx`: Text des `metaIncomplete`-Blocks umstellen, Aktionsreihenfolge (anderes Konto zuerst, Reset sekundär).
- `src/lib/translations.ts`: Schlüssel `metaNoPagesBody` präzisieren, neue Schlüssel `metaNoAssetsSteps` in DE/EN/ES.
- Keine Änderung an Scopes, `oauth-callback`, Datenbank oder Meta-App-Konfiguration.
