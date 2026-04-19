

## Befund

**User wurde erstellt** (`45dc5d43-…`), aber die **Verifizierungs-E-Mail wurde NIE versendet**, weil das Token-Speichern in der Edge Function gecrasht ist:

```
code: "42P10"
message: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
```

### Ursache
Die Edge Function `send-verification-email` nutzt `.upsert(...).onConflict('user_id')` auf die Tabelle `email_verification_tokens` — aber auf der Spalte `user_id` existiert **kein** UNIQUE-Constraint. Postgres lehnt das ab → Token wird nicht gespeichert → keine E-Mail versendet → User wartet vergeblich.

Das erklärt auch, warum die Tabelle vorher leer war: **jeder bisherige Signup ist an genau diesem Punkt gescheitert.**

---

## Lösung (2 saubere Schritte)

### Schritt 1: UNIQUE-Constraint auf `email_verification_tokens.user_id` hinzufügen
Migration:
- Vorher Duplikate aufräumen (vorsichtshalber, falls welche existieren — aktuell ist die Tabelle aber leer)
- `ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_tokens_user_id_key UNIQUE (user_id);`

Damit funktioniert `.upsert(..., { onConflict: 'user_id' })` korrekt: ein neuer Signup-Versuch desselben Users überschreibt das alte Token statt zu duplizieren.

### Schritt 2: Manuell Verifizierungs-E-Mail für `dusatkojr@web.de` neu auslösen
Da der User schon existiert (kein erneuter Signup nötig):
- Direkter Edge-Function-Call von `send-verification-email` mit der existierenden `userId` und `email`
- Das erzeugt jetzt (mit gefixtem Constraint) erfolgreich ein Token und versendet die E-Mail via Resend

### Verifikation
1. Logs von `send-verification-email` zeigen `Email sent successfully: <id>`
2. Eintrag in `email_verification_tokens` existiert für `user_id = 45dc5d43-…`
3. User bekommt die Mail in `dusatkojr@web.de`
4. Klick auf Link → `verify-email` setzt `email_confirmed_at` → Welcome-Bonus wird ausgelöst

### Aufwand
~5 Minuten (1 Migration + 1 Function-Call + Verifikation)

