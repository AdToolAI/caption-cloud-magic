

## Hard-Reset automatisch vor jedem Instagram-Connect

### Was ich in den Logs gefunden habe

**Entscheidend:** Es gibt **keine** Logs für `instagram-oauth-revoke`. Der Hard-Reset wird also gar nicht ausgeführt, bevor du auf "Connect Instagram" klickst.

Was passiert tatsächlich:

```text
Du klickst direkt auf "Connect Instagram"
→ instagram-oauth-start läuft (Logs zeigen das)
→ Meta sieht: App-Grant existiert noch
→ Meta zeigt "You previously logged into AdTool AI Integration with Facebook"
→ Du klickst "Continue as Samuel"
→ Meta gibt sofort Code zurück, kein Consent-Dialog
```

Der ganze Hard-Reset-Code, den wir gebaut haben, wird **nie ausgelöst**, weil er nur beim manuellen Disconnect läuft — und das hast du in der Praxis nicht jedes Mal vorher gemacht.

Deshalb ändert sich für dich nichts: Meta erkennt den App-Grant bei jedem Connect-Versuch wieder und überspringt den Consent-Pfad.

### Was ich ändern werde

#### 1. Auto-Hard-Reset in `handleConnect` für Instagram
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Wenn du auf **Connect Instagram** klickst, läuft ab jetzt **vor** dem Aufruf von `instagram-oauth-start` automatisch:

- `supabase.functions.invoke('instagram-oauth-revoke')`
- wartet auf `hardResetComplete` / `revoked`
- erst danach: Redirect zur Meta-Authorize-URL

So wird Metas App-Grant garantiert revoked, bevor der OAuth-Flow neu startet.

#### 2. Sichtbarer Status für den Reset
- Toast / Inline-Status: „Resetting Meta authorization…“
- bei erfolgreichem Revoke: weiter zur OAuth-URL
- bei Fehler beim Revoke (z. B. Token nicht mehr gültig): klare Meldung, dass Meta die App noch kennen könnte, und der Connect-Button versucht es trotzdem

#### 3. Sicherheitsnetz im Backend
**Datei:** `supabase/functions/instagram-oauth-start/index.ts`

Zusätzlich zum Frontend-Reset führt `instagram-oauth-start` selbst noch einmal eine **Best-Effort Revoke-Routine** aus:

- vor dem Bauen der Authorize-URL
- nutzt die noch in der DB liegenden Meta-Tokens (instagram + facebook)
- ruft `DELETE /{meta-user-id}/permissions` auf
- löscht beide Rows (`instagram` + `facebook`) aus `social_connections`

Damit ist der Hard-Reset garantiert, selbst wenn der Frontend-Call das aus irgendeinem Grund auslässt.

#### 4. Klarer UX-Hinweis bei „You previously logged into …"
**Datei:** `src/components/performance/ConnectionsTab.tsx`

Wenn nach dem Connect-Flow Meta trotzdem ohne Consent zurückspringt (erkennbar daran, dass die neue Connection sofort als „instagram_pending“ ankommt, ohne dass eine echte Permission-Auswahl stattfand), zeigen wir einen Hinweis:

> „Meta hat die App-Berechtigung im Browser noch zwischengespeichert. Bitte logge dich kurz auf facebook.com aus und versuche es erneut, um den vollen Berechtigungsdialog zu sehen."

Das ist der einzige zuverlässige Weg, Metas browserseitige Session-Caching zu umgehen.

### Wichtige Erwartung

- Der Hard-Reset auf Meta-Seite ist jetzt **immer aktiv**, nicht mehr nur beim manuellen Disconnect.
- Der „Continue as …"-Screen kann von Meta **trotzdem** als erste Hürde gezeigt werden, weil deine **Browser-Session** auf facebook.com weiterhin eingeloggt ist. Das kontrolliert Meta, nicht wir.
- Entscheidend ist: nach dem „Continue"-Klick muss der **Berechtigungsdialog** kommen — und genau das setzt voraus, dass der App-Grant bei Meta entfernt wurde, was wir jetzt erzwingen.

### Betroffene Dateien
- `src/components/performance/ConnectionsTab.tsx`
- `supabase/functions/instagram-oauth-start/index.ts`
- evtl. minimale Helper-Extraktion für die Revoke-Routine, damit sie sowohl in `instagram-oauth-revoke` als auch in `instagram-oauth-start` nutzbar ist

### Risiko
Gering. Der Hard-Reset existiert bereits — er wird nur jetzt automatisch im Connect-Flow ausgelöst statt nur beim expliziten Disconnect.

### Test nach Umsetzung
1. **Direkt** auf „Connect Instagram" klicken (kein vorheriges manuelles Disconnect)
2. prüfen, dass im Hintergrund der Auto-Hard-Reset läuft (Toast „Resetting Meta authorization…")
3. erst danach öffnet sich der Meta-Flow
4. wenn nach „Continue as Samuel" immer noch direkt zurückgesprungen wird: einmal auf facebook.com ausloggen und Schritt 1 wiederholen
5. der Berechtigungsdialog sollte dann kommen
6. nach Rückkehr in die App muss automatisch der Page-Select-Dialog im Instagram-Modus erscheinen

