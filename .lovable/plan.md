

## Instagram-Discovery: Root-Cause-Pfad konsequent anwenden + dem Nutzer den richtigen nächsten Schritt zeigen

### Was die Logs eindeutig sagen
```text
[meta-page-discovery] /me/accounts returned 0 page(s): []
diagnostics: { pages_found_count: 0, list_error: null }
```
Meta liefert `/me/accounts` **leer zurück, ohne Fehler**. Genau dieses Symptom ist in den offiziellen Meta-Devforen + auf Stack Overflow gut dokumentiert — und die akzeptierte Lösung lautet exakt:

> *„Solved: All I had to do was add the `business_management` permission.“*

Genau dieser Scope wird bei uns bereits nachgefordert — aber **erst beim nächsten Connect-Versuch**, weil die Trigger-Bedingung (`pages_found_count === 0`) erst durch den ersten Fehlversuch in den Metadaten landet. Im aktuellen Screenshot hat der Nutzer den **Erneut-Verbinden-Button noch nicht geklickt**, also wurde der Fix noch nie ausgelöst.

### Was wir jetzt tun

#### 1. Business-Scope auch beim allerersten Instagram-Connect anbieten
**Datei:** `src/components/performance/ConnectionsTab.tsx`

- `business_management` immer in die Standard-Instagram-Scopes aufnehmen, statt nur als Fallback nach erstem Misserfolg.
- Begründung: Meta verlangt ihn bei business-verwalteten Seiten *zwingend*. Das jetzt sofort mitzufordern erspart dem Nutzer einen kompletten Fehlversuch.
- `auth_type=rerequest` weiterhin nur dann setzen, wenn echte Re-Consent-Gründe vorliegen (declined scopes oder vorheriger Fehlschlag) — beim ersten Mal nicht.

#### 2. „Erneut verbinden“-Button im Dialog wirklich den Re-Consent-Pfad nutzen
**Datei:** `src/components/performance/FacebookPageSelectDialog.tsx`

- Aktuell schließt der Button nur den Dialog und ruft den normalen Connect-Flow erneut auf.
- Künftig muss er den vollen Re-Consent-Pfad explizit erzwingen: `auth_type=rerequest`, neuer `auth_nonce`, alle Scopes inklusive `business_management`.
- Damit zeigt Meta den vollständigen Berechtigungsdialog mit Page-Toggles und Instagram-Auswahl garantiert noch einmal — auch wenn der Nutzer vorher schon einmal zugestimmt hatte.

#### 3. Kontextspezifische Hilfe im Dialog je nach Meta-Diagnose
**Datei:** `src/components/performance/FacebookPageSelectDialog.tsx`

Bei `meta_pages_hidden_or_unavailable` / `pages_found_count = 0` zusätzlich zum bisherigen Hinweis konkret darstellen, **was der Nutzer auf Meta-Seite prüfen muss**, damit Pages überhaupt geliefert werden:

1. Instagram muss ein **Business**- oder **Creator**-Konto sein (kein Privat-Profil).
2. Instagram muss in den Facebook-Page-Einstellungen mit einer **Facebook-Seite** verknüpft sein.
3. Die Facebook-Seite muss von **demselben Facebook-Account** verwaltet werden, mit dem man sich gerade einloggt.
4. Im Meta-Consent-Dialog **muss mindestens eine Page-Checkbox aktiv** angeklickt werden — nicht nur das Instagram-Konto.

Mit deutlichem CTA:
- Primär: *„Instagram erneut verbinden (mit Business-Berechtigung)“*
- Sekundär: Link zur Meta-Hilfeseite *„Instagram mit Facebook-Seite verbinden“*.

#### 4. Diagnose-Zeile nicht reduzieren
Die kleine technische Diagnoselzeile (`0 Seiten von Meta · 0 mit IG verifiziert · 0 Verifikationsfehler`) bleibt erhalten — sie ist genau das Signal, das uns dieses Mal sofort gezeigt hat, wo das Problem liegt.

### Erwartetes Ergebnis
- **Best Case:** Beim nächsten Klick auf „Instagram erneut verbinden“ schickt die App `business_management` + `auth_type=rerequest` → Meta zeigt den vollständigen Page-Auswahldialog noch einmal → die verknüpfte Page kommt in `/me/accounts` an → Auto-Connect oder Page-Select klappt.
- **Andernfalls:** Der Nutzer sieht jetzt eine konkrete, handlungsorientierte Liste, was auf Meta-Seite (Account-Typ, Page-Verknüpfung, Page-Owner) zu prüfen ist — statt einer vagen Fehlermeldung.

### Betroffene Dateien
- `src/components/performance/ConnectionsTab.tsx`
- `src/components/performance/FacebookPageSelectDialog.tsx`

### Technische Details
- Kein Backend-/Schema-Change nötig — die Edge Functions (`oauth-callback`, `facebook-list-pages`, `facebook-select-page`) sind bereits korrekt instrumentiert.
- Kein neuer Edge-Function-Deploy nötig.
- Reine Frontend-Änderung an OAuth-URL-Konstruktion + Dialog-UX.

### Test
1. Im aktuellen Dialog auf **„Instagram erneut verbinden“** klicken.
2. Erwartung: Meta-Dialog erscheint **erneut komplett** (nicht der „bereits zugestimmt“-Shortcut), mit Page- und Instagram-Auswahl + jetzt zusätzlich Business-Berechtigung.
3. Alle Toggles aktiv lassen, mindestens eine Page anklicken, bestätigen.
4. Erwartung: zurück in der App entweder sofortiger Auto-Connect (genau 1 Page) oder echte Auswahlliste.
5. Falls weiterhin 0 Pages: die neue Hilfeliste prüft genau die 4 Meta-seitigen Voraussetzungen ab.

