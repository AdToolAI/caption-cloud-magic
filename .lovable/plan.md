# Facebook-Verbindung: „Feature nicht verfügbar"

## Was der Screenshot zeigt

- App-ID `1769514810345813`, du bist Administrator.
- **App Review ist durch**: `instagram_content_publish` und `instagram_basic` sind *Approved*, `pages_manage_posts`, `pages_show_list`, `pages_read_engagement` sind *Renewed*.
- Der Modus-Schalter oben steht auf **Live**.
- **`App type: None`** — das ist der auffällige Punkt.

Damit fällt meine bisherige Vermutung („App nur im Entwicklungsmodus, Review fehlt") weg. Die Berechtigungen sind da, die App ist live — die Meldung muss eine andere Ursache haben.

## Die verbleibenden zwei Kandidaten

1. **Unvollständige App-Grunddaten / Use-Case-Konfiguration.** Meta blendet genau den Text „wir aktualisieren zusätzliche Details für diese App" ein, wenn eine live geschaltete App Pflichtangaben vermissen lässt (Datenschutz-URL, Datenlöschungs-Hinweis, Kategorie, App-Symbol) oder der Use Case „Facebook Login" nicht abgeschlossen konfiguriert ist. `App type: None` deutet genau in diese Richtung.
2. **Redirect-URI nicht in der Erlaubnisliste.** Steht die exakte Backend-Callback-URL nicht unter „Gültige OAuth-Redirect-URIs", blockt Meta den Dialog — teils mit derselben generischen Meldung statt einer präzisen URI-Fehlermeldung.

Beides ist nicht am Code reparierbar, aber beides lässt sich **serverseitig auslesen** statt zu raten.

## Was ich umsetze: Diagnose statt Raten

**Schritt 1 — App-Status hart auslesen**
`oauth-config-check` bekommt einen Meta-Abschnitt, der mit App-Token (`META_APP_ID|META_APP_SECRET`) die Graph API abfragt:
- `/{app-id}?fields=name,link,privacy_policy_url,app_type,category` → welche Pflichtfelder leer sind.
- Ergebnis pro Feld als „gesetzt / fehlt" im Diagnose-Panel.

**Schritt 2 — Redirect-URI gegenprüfen**
Die im Backend verwendete Callback-URL wird im Panel im Klartext angezeigt, mit Kopier-Button, damit sie 1:1 in die Meta-Login-Einstellungen übernommen werden kann. Zusätzlich Abgleich, ob Start-Funktion und Callback-Funktion dieselbe URL verwenden.

**Schritt 3 — Ehrliche Fehlerseite**
Kommt der Nutzer ohne `code` aus dem Meta-Dialog zurück, zeigt der Verbindungsbereich künftig Metas `error_reason`/`error_description` im Klartext statt „Verbindung fehlgeschlagen" — damit die nächste Ursache sofort benannt ist.

## Was du parallel in Meta prüfen solltest

- **App-Einstellungen → Grunddaten**: Datenschutzerklärung-URL, Nutzungsbedingungen, App-Symbol (1024×1024), Kategorie, Datenlöschungs-Callback. Alles ausgefüllt und gespeichert?
- **Facebook Login → Einstellungen**: unter „Gültige OAuth-Redirect-URIs" muss exakt stehen:
  `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback`
- **Required actions** (linke Leiste, dort stehen 11 Alerts): offene Pflichtaufgaben blockieren den Login-Dialog. Der genaue Grund steht meist wörtlich dort.

## Technische Details

- `supabase/functions/oauth-config-check/index.ts`: neuer Abschnitt `meta_app_status`, Graph-API-Call `GET /v24.0/{app-id}` mit App-Token, ohne Nutzer-Token; Timeout und Fehlerfall sauber als „unbekannt" melden.
- `src/components/performance/ConnectionDiagnostics.tsx`: neue Zeilen „App-Grunddaten" und „Redirect-URI (Soll-Wert)" pro Meta-Kanal.
- `supabase/functions/oauth-callback/index.ts`: `error`, `error_reason`, `error_description` aus der Rückleitung in die App-Redirect-URL durchreichen.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.
