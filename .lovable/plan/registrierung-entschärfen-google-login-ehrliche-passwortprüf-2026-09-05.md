# Registrierung entschärfen: Google-Login + ehrliche Passwortprüfung

## Was ich geprüft habe

- Die Registrierungsseite bietet aktuell nur E-Mail + Passwort. Es gibt keinen Google-Knopf (weder auf der Anmelde- noch auf der Registrierungsseite).
- Unsere eigene Prüfung verlangt nur mindestens 6 Zeichen. Ein 12-Zeichen-Passwort mit Groß-/Kleinschreibung, Zahlen und Sonderzeichen wird von uns also nicht abgelehnt.
- Die Meldung "Passwort zu schwach" stammt aus der Antwort des Anmeldedienstes und wird bei uns auch dann so angezeigt, wenn der eigentliche Grund ein anderer ist: Der Dienst kann Passwörter ablehnen, die in bekannten Datenlecks aufgetaucht sind. Solche Passwörter sind formal stark, aber bekannt — die Meldung "zu schwach" ist dann irreführend.
- Ob diese Leck-Prüfung aktiv ist, ist noch nicht bestätigt. Das ist der erste Schritt.

## Schritte

1. **Ursache bestätigen**
   Aktuelle Passwort-Einstellungen des Anmeldedienstes auslesen (Mindestlänge, Zeichenanforderungen, Leck-Prüfung) und mit einem Testlauf auf der Registrierungsseite nachstellen, welche Meldung genau zurückkommt.

2. **Passwortregeln klar und fair setzen**
   Mindestlänge 8, keine erzwungenen Sonderzeichen. Die Leck-Prüfung bleibt aktiv (sie schützt Kunden), bekommt aber eine eigene, verständliche Meldung: "Dieses Passwort taucht in bekannten Datenlecks auf. Bitte wähle ein anderes." — statt "zu schwach".

3. **Live-Rückmeldung schon beim Tippen**
   Unter dem Passwortfeld eine kleine Anzeige: erfüllte/offene Anforderungen und eine Stärke-Leiste. So sieht man vor dem Absenden, ob das Passwort passt, statt erst nach einer abgelehnten Registrierung.

4. **Google-Anmeldung**
   Ein "Mit Google fortfahren"-Knopf oben auf Anmeldung und Registrierung, mit Trennlinie zur E-Mail-Variante. Danach landet man wie gewohnt im Dashboard bzw. im Onboarding. Der Google-Anbieter wird im selben Zug im Backend eingerichtet, sonst schlägt der erste Klick fehl.

5. **Alle drei Sprachen**
   Neue Texte (Knopf, Trenner, Passwortanforderungen, Leck-Meldung) in EN, DE, ES.

## Technisch

- `src/pages/Auth.tsx`: OAuth-Knopf mit `signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })`; Passwort-Mindestlänge von 6 auf 8; neue Komponente `src/components/auth/PasswordStrength.tsx`.
- `src/lib/authErrors.ts`: `pwned`/`compromised` von `weak` trennen, eigener Code `password_leaked`.
- Backend: `configure_auth` (Mindestlänge, HIBP-Status) und Google-Provider konfigurieren; Redirect-URLs für Vorschau, veröffentlichte App und beide eigenen Domains hinterlegen.
- Für Google brauche ich Client-ID und Client-Secret aus der Google Cloud Console — die frage ich beim Umsetzen als Geheimnis ab.
- Keine Änderungen an Billing, Wallet, Video- oder Lip-Sync-Pfaden.
