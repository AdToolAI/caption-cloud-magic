# Warum keine Bestätigungsmail kam — und was wir dagegen bauen

## Befund (verifiziert)

Für `mythoslabor@gmail.com` existiert bereits ein Konto: angelegt am 9. August, Bestätigungsmail damals verschickt, und **die E-Mail ist bereits bestätigt** (Bestätigung am selben Tag, danach erfolgreicher Login). Genau das zeigt auch die Gmail-Ansicht: die "Confirm your email"-Mail von AdTool AI vom 9. August.

Die neue Registrierung von heute war deshalb kein echter Signup, sondern ein Wiederholungs-Signup auf ein bestehendes, bestätigtes Konto. In dem Fall verschickt das Auth-System aus Sicherheitsgründen (keine Preisgabe, welche Adressen registriert sind) **keine Mail** — es meldet aber trotzdem "erfolgreich" zurück.

Unsere Oberfläche behandelt diese Antwort als normalen Signup und schickt den Nutzer auf `/auth/check-email`, wo er auf eine Mail wartet, die nie kommt. Auch der "Erneut senden"-Knopf dort kann nichts ausrichten: die Backend-Funktion erkennt "bereits bestätigt" und sendet bewusst nichts.

Kein Mailversand-Defekt — ein Fehler in der Fallunterscheidung nach dem Signup.

## Sofort für diesen Nutzer

Er kann sich direkt mit `mythoslabor@gmail.com` einloggen. Passwort unbekannt → "Passwort vergessen" auf der Login-Seite; diese Mail geht raus, weil sie ein anderer Pfad ist.

## Was gebaut wird

**1. Wiederholten Signup erkennen und ehrlich beantworten**
Nach `signUp()` prüfen, ob es sich um ein bereits existierendes Konto handelt (Supabase liefert dann einen User ohne neue Identität und ohne Session). In dem Fall:
- nicht auf die "Check your email"-Seite navigieren,
- stattdessen auf der Auth-Seite ein ruhiger Hinweis: "Für diese Adresse existiert bereits ein Konto" mit zwei Aktionen: **Anmelden** (Formular wechselt in den Login-Modus, E-Mail bleibt vorausgefüllt) und **Passwort vergessen**.

**2. Check-Email-Seite gegen Sackgassen absichern**
Beim "Erneut senden" gibt die Backend-Funktion bereits `alreadyVerified: true` zurück. Dieses Feld wird künftig ausgewertet: statt "Mail verschickt" erscheint der Hinweis, dass die Adresse schon bestätigt ist, plus direkter Login-Link.

**3. Texte in EN/DE/ES**
Alle neuen Texte über das bestehende Übersetzungsmuster, damit die eingefrorene Tri-Locale-Reinheit erhalten bleibt.

Am Mailversand selbst wird nichts geändert.

## Technisch

- `src/hooks/useAuth.tsx`: `signUp` gibt zusätzlich `alreadyRegistered` zurück, abgeleitet aus `data.user && (data.user.identities?.length ?? 0) === 0 && !data.session`. Kein Erfolgs-Toast und kein `SIGNUP_COMPLETED`-Event in diesem Fall.
- `src/pages/Auth.tsx`: `alreadyRegistered` behandeln — kein Redirect nach `/auth/check-email`, stattdessen Hinweis-Block + Umschalten auf Login; das doppelte `SIGNUP_COMPLETED`-Tracking dort ebenfalls an den echten Signup-Fall binden.
- `src/pages/CheckEmail.tsx`: Antwort von `send-verification-email` auf `alreadyVerified` prüfen und entsprechenden Zustand anzeigen.
- Keine Änderungen an Edge Functions, Datenbank oder Mail-Infrastruktur; kein Deploy nötig.
