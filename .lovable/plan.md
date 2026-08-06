# Meta: Was nach `public_profile` noch fehlt

`public_profile` hat jetzt **Advanced Access**. Damit funktioniert der reine **Login** über Facebook für beliebige Nutzer. Das **Verbinden von Seiten und das Posten** braucht aber weitere Berechtigungen, die im Code angefordert werden und aktuell noch auf Standard Access stehen dürften.

## Welche Berechtigungen die App tatsächlich anfordert

| Kanal | Angeforderte Scopes (im Code verifiziert) |
|---|---|
| Facebook | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` |
| Instagram | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` |

Solange diese Scopes nur **Standard Access** haben, klappt das Verbinden nur mit Konten, die unter **App roles → Roles / Test users** eingetragen sind. Fremde Kunden bekommen sonst wieder „Feature nicht verfügbar" oder eine leere Seitenliste.

## Schritt 1 — Advanced Access beantragen

In **App Review → Permissions and Features** für jede dieser Berechtigungen **Request advanced access** klicken:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

Meta verlangt dafür je Berechtigung:
- **Screencast** des kompletten Flows: Login → Verbindungen → Facebook/Instagram verbinden → Seite auswählen → Post veröffentlichen.
- **Testing instructions** mit Testkonto (Login-Daten eines AdTool-Testaccounts) und dem Klickpfad.
- **Business Verification** des Meta-Business-Kontos (Ausweis/Gewerbenachweis). Ohne verifizierte Firma werden Pages-Scopes regelmäßig abgelehnt.

## Schritt 2 — Vorher intern testen (geht sofort, ohne Review)

Mit deinem eigenen Konto als App-Admin sind alle Scopes bereits nutzbar. Damit sollten wir vor dem Review einmal komplett durchspielen:

1. In AdTool → **Verbindungen → Facebook verbinden**: Kommt das Meta-Dialogfenster, wird eine Seite gefunden, wird die Verbindung gespeichert?
2. Dasselbe für **Instagram** (Instagram muss ein Business-/Creator-Konto sein und mit einer Facebook-Seite verknüpft sein — sonst liefert Meta 0 Seiten).
3. Einen echten Testpost über den Composer veröffentlichen.
4. Im **Diagnose-Panel unter Verbindungen** prüfen, ob die gemeldeten Redirect-URIs exakt mit den in **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** hinterlegten übereinstimmen.

Der Screencast für den Review fällt bei diesem Durchlauf direkt mit ab.

## Schritt 3 — TikTok und YouTube

- **YouTube**: Google-OAuth-Consent-Screen muss von „Testing" auf „In production" stehen, sonst nur 100 Testnutzer. Bei sensiblen Scopes (`youtube.upload`) ist ein Google-Verification-Prozess nötig.
- **TikTok**: läuft laut Projektnotizen noch im **Sandbox-Modus** — nur eingetragene Testnutzer. Für Kunden muss die App bei TikTok zur Review eingereicht werden.

## Antwort kurz

Der Facebook-**Login** sollte jetzt problemlos gehen. Das **Verbinden und Posten** für fremde Kunden geht erst nach Advanced Access für die Pages-/Instagram-Scopes. Für dein eigenes Konto kannst du sofort alles testen.

## Was ich auf Wunsch übernehme

Kein Code-Umbau nötig. Ich kann aber:
- den Diagnose-Bereich so erweitern, dass er **je Scope** Standard vs. Advanced Access anzeigt (analog zur bestehenden `public_profile`-Prüfung), damit du den Review-Fortschritt direkt in AdTool siehst.
