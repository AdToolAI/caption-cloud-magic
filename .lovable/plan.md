## Ursache

Der Screenshot/Run zeigt nicht deine App-Loginseite. In den aktuellen Run-Metadaten steht nach `auth-page-loaded` diese URL:

```text
https://lovable.dev/login?redirect=.../auth-bridge?...return_url=.../auth
```

Browserless landet also auf der Lovable-Preview-Zugangsseite, nicht auf `/auth` deiner App. Deshalb findet er kein `input#password` aus `src/pages/Auth.tsx` und bricht ab.

Zusätzlich gibt es einen zweiten Fehler: Die Edge Function versucht bei Login-Problemen `category: "auth"` in `qa_bug_reports` zu speichern, aber die DB-Check-Constraint erlaubt aktuell nur Kategorien wie `workflow`, `console`, `network`, `assertion` usw. Deshalb zeigt das Cockpit `Bugs: 0`, obwohl intern ein Bug-Insert versucht wurde.

## Plan

### 1. QA-Ziel-URL auf eine öffentlich erreichbare App-URL umstellen
- In `qa-agent-execute-mission/index.ts` den Default für `QA_TARGET_URL` von der `id-preview--...lovable.app` Preview auf die öffentliche App-Domain ändern, z. B. `https://useadtool.ai`.
- Damit Browserless direkt deine echte App-Route `/auth` öffnet und nicht über `lovable.dev/auth-bridge` läuft.
- Optional: Ziel-URL im Run-Metadata speichern, damit im Cockpit sichtbar ist, gegen welche Domain getestet wurde.

### 2. Auth-Bridge-Falle explizit erkennen
- In `_shared/browserlessClient.ts` nach dem `goto('/auth')` prüfen, ob `page.url()` auf `lovable.dev/login` oder `lovable.dev/auth-bridge` zeigt.
- Wenn ja: sofort mit einer klaren Fehlermeldung abbrechen:

```text
QA target is protected by Lovable preview auth bridge; use public QA_TARGET_URL
```

- So wartet der Bot nicht 20 Sekunden auf ein Passwortfeld, das dort nie existiert.

### 3. Bug-Insert reparieren
- In `qa-agent-execute-mission/index.ts` keine nicht erlaubte Kategorie `auth` mehr verwenden.
- Login-/Auth-Fehler vorerst als `category: "workflow"` speichern und im `network_trace.failure_area = "auth"` markieren.
- Dadurch erscheinen die Bug Reports wieder im Cockpit statt still an der DB-Constraint zu scheitern.

### 4. QA-Testuser robuster machen
- `qa-agent-setup-test-user/index.ts` erweitern, damit der QA-Testuser zusätzlich eine Admin-Rolle in `user_roles` bekommt.
- Das ist wichtig, weil viele Smoke-Missionen Admin-/geschützte Bereiche testen und `ProtectedRoute requireRole="admin"` nutzt.
- Rollen bleiben weiterhin in der separaten Rollen-Tabelle, nicht im Profil.

### 5. Cockpit-Transparenz verbessern
- In `QACockpit.tsx` bei Run-Karten die Ziel-URL und bei Login-Fehlern eine klare Hinweismeldung anzeigen, z. B.:

```text
Ziel-URL ist durch Preview-Auth geschützt. QA muss gegen Published/Custom Domain laufen.
```

- Den existierenden Heartbeat-Block beibehalten.

## Erwartetes Ergebnis

Nach der Änderung startet der Smoke-Run nicht mehr gegen die geschützte Preview-Bridge, sondern gegen die öffentlich erreichbare App. Falls die App-Loginseite selbst ein Problem hat, wird der Bug korrekt im Bug-Inbox sichtbar. Falls Login klappt, besucht der Bot danach die eigentlichen Mission-Pfade und `Steps` geht von `0/1` auf `1/1`.

## Betroffene Dateien

- `supabase/functions/qa-agent-execute-mission/index.ts`
- `supabase/functions/_shared/browserlessClient.ts`
- `supabase/functions/qa-agent-setup-test-user/index.ts`
- `src/pages/admin/QACockpit.tsx`