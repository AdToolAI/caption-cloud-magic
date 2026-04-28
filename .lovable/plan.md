## Problem

Auf `/motion-studio/library` wird "0 Charaktere" angezeigt, obwohl in der DB ein Charakter ("Richard Löwenherz") für deinen User korrekt gespeichert ist. Der Speichern-Toast erscheint also zu Recht — die Anzeige ist defekt.

## Ursache

`useMotionStudioLibrary.loadAll()` läuft genau einmal beim Mount, abhängig von `user`. Es gibt **keinen Refresh** nach `createCharacter`. In den meisten Fällen funktioniert das, weil `createCharacter` den neuen Eintrag direkt per `setCharacters((prev) => [created, ...prev])` lokal in den State schiebt — aber:

1. **Race condition beim ersten Mount**: Wird die Library-Page geladen, *bevor* `useAuth` den Session-Restore beendet hat (`user` ist noch `null`), läuft `loadAll` mit leerem State und setzt `loading=false`. Sobald der User wenige ms später kommt, läuft `loadAll` zwar erneut über `useCallback`-Deps — aber der Initial-Load mit `user=null` lässt eine kurze Race-Phase zu, in der bereits gespeicherte Daten nicht erscheinen.
2. **Härter**: Nach dem Speichern aus dem `CharacterEditor` heraus wird der Dialog geschlossen und nichts erneut gefetcht. Die UI verlässt sich nur auf den `setCharacters((prev) => [created, ...prev])`-Trick. Wenn `createCharacter` aus irgendeinem Grund das Insert-Result-Objekt nicht in den lokalen State pusht (z. B. weil zwischendurch ein Tab-Wechsel den State zurücksetzt, oder der Dialog auf einer anderen Page-Instance lebt), bleibt die Library leer — und ein Reload zeigt "0".
3. **Plus**: Beim Reload der Page sehen wir, dass dein User-Eintrag definitiv da ist (DB-Check bestätigt), aber `tags`-Spalte ist nullable und Default `'{}'`. Das ist nicht das Problem, RLS ist auch sauber (`auth.uid() = user_id`).

Konkret heißt das: Das Insert klappt, der Toast stimmt, aber die Liste wird nach dem Schließen des Editors **nicht neu geladen**, und ein einfacher Browser-Reload zeigt das Ergebnis erst, wenn `useAuth` den User vor `loadAll` hat — was bei dir beim Routing offenbar nicht passiert.

## Fix

**1. `useMotionStudioLibrary` robust machen**
- `loadAll` nicht früh mit `user=null` als "leer" abschließen — stattdessen `loading=true` lassen, bis ein User da ist, dann fetchen.
- Beim Auth-State-Change (`onAuthStateChange` über Supabase) ein Re-Fetch triggern.
- `createCharacter` / `createLocation`: nach Insert zusätzlich `loadAll()` (oder gezielter: nochmal aus der DB nachladen), damit unabhängig vom State-Trick die Liste konsistent ist.

**2. `CharacterEditor` & `LocationEditor`**
- Nach `onSaved` einen optionalen `refetch`-Hook aus der Library aufrufen lassen (oder einfach in `useMotionStudioLibrary` selbst nach create immer fetchen — siehe oben).

**3. UX-Sicherung**
- Wenn `loading` true ist, nicht gleichzeitig "Noch keine Charaktere" zeigen (aktuell wird der Skeleton korrekt gezeigt — das ist okay, aber der Übergang `user=null → user=set` darf den Empty-State nicht kurz aufflashen).

### Zu ändernde Dateien
- `src/hooks/useMotionStudioLibrary.ts` — Auth-aware Loading + Re-Fetch nach Create
- (kein UI-Change nötig in `Library.tsx` / `CharacterEditor.tsx`)

### Verifikation
- Nach Fix: Page `/motion-studio/library` neu laden → "Richard Löwenherz" erscheint sofort.
- Neuen Charakter anlegen → erscheint sofort + bleibt nach Reload.