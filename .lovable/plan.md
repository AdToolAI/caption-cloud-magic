## Problem

Das QA-Cockpit hat das Passwort des `qa-bot@useadtool.ai` Test-Users nur **in den ersten 8 Zeichen** angezeigt (`password.slice(0, 8)`). Das vollständige Passwort ist damit verloren — es wurde nirgendwo persistiert und der Toast verschwindet ohnehin nach wenigen Sekunden.

Lösung: (1) Passwort neu generieren via `qa-agent-setup-test-user` mit explizitem Reset-Flag, (2) UI so umbauen, dass das vollständige Passwort sicher angezeigt, kopiert und direkt als Secret gespeichert werden kann — ohne dass es jemals in Logs, Toasts oder LocalStorage abgeschnitten oder geleakt wird.

## Änderungen

### 1. Edge Function: `qa-agent-setup-test-user` erweitern
- Neuer optionaler Parameter `reset_password: true` → setzt für existierende User ein **neues** Passwort via `supabase.auth.admin.updateUserById()` und gibt es zurück.
- Ohne Flag bleibt das Verhalten idempotent (kein Passwort-Reset bei existierenden Usern).

### 2. UI: `src/pages/admin/QACockpit.tsx` — sichere Passwort-Anzeige
- Statt Toast mit Truncation → **dedizierter Modal-Dialog** ("Test-User-Zugangsdaten") mit:
  - Vollständigem Passwort in einem `<input type="text" readOnly>` (monospace, voll selektierbar)
  - **"Kopieren"-Button** mit Clipboard-API (zeigt nach Klick "Kopiert ✓")
  - **"Show/Hide"-Toggle** (Default: maskiert mit `••••`, Klick enthüllt)
  - Warnhinweis: *"Dieses Passwort wird nur jetzt einmalig angezeigt. Speichere es sofort als Secret `QA_TEST_USER_PASSWORD`."*
  - **Direkt-Link / Button** der die Secret-Anlage triggert (öffnet den Secrets-Dialog mit vorausgefülltem Namen)
- Zusätzlicher Button **"Passwort zurücksetzen"** im "Test-User"-Bereich → ruft Edge Function mit `reset_password: true` auf und öffnet denselben Modal mit dem neuen Passwort.
- **Entfernen** des `slice(0, 8)`-Truncation-Codes komplett.

### 3. Sicherheits-Hygiene
- Passwort wird **nicht** in `console.log` ausgegeben.
- Passwort wird **nicht** in React-State persistiert nach Modal-Close (Cleanup mit `setPassword(null)`).
- Edge Function loggt das Passwort weiterhin **nicht** in Function-Logs (nur `created: true/false`).

## Workflow nach Implementierung

1. User klickt im QA-Cockpit auf **"Passwort zurücksetzen"**.
2. Modal öffnet sich mit vollständigem neuem Passwort + Kopier-Button.
3. User kopiert es, klickt **"Als Secret speichern"** → Secrets-Dialog öffnet sich.
4. Modal schließen → Passwort wird aus dem Speicher entfernt.

## Betroffene Dateien

- `supabase/functions/qa-agent-setup-test-user/index.ts` — Reset-Flag-Logik
- `src/pages/admin/QACockpit.tsx` — Modal + Reset-Button, Truncation entfernen
