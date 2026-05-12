## Problem

1. **Wardrobe-Generierung schlägt fehl** mit `Edge Function returned a non-2xx status code`. Edge-Function-Logs zeigen wiederholt `error: Unauthorized`. Der User ist eingeloggt (Sidebar zeigt 22 Credits, Notifications aktiv) und ruft `supabase.functions.invoke('generate-avatar-wardrobe', …)` korrekt auf — der `Authorization`-Header wird also gesendet. Trotzdem schlägt `supabaseUser.auth.getUser()` in der Edge Function fehl.

2. **Bestehende Avatare** (vor Stage 22 erstellt — z.B. Matthew & Sarah Dusatko im Screenshot) haben **kein** sauberes "default-outfit Portrait", weil das nur in `createCharacter` automatisch ausgelöst wird. Sie sehen entsprechend mit Originalbild aus, und die Wardrobe-Restyles erben Outfit/Lichtsetting des Originals statt der sauberen Studio-Base.

---

## Lösung

### Teil 1 — Auth-Fix in `generate-avatar-wardrobe`

Den fragilen `supabaseUser.auth.getUser()`-Pfad (eigener anon-Client, der `/auth/v1/user` mit dem User-JWT aufruft) ersetzen durch das robuste Pattern, das wir in anderen kürzlich gefixten Functions nutzen: **Token aus dem Header extrahieren und direkt mit dem Service-Role-Client `supabaseAdmin.auth.getUser(token)` validieren**. Das umgeht potenzielle Edge-Cases mit Signing-Keys/legacy ANON_KEY-Mismatch.

```ts
const token = authHeader.replace(/^Bearer\s+/i, '');
const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
if (authErr || !user) throw new Error('Unauthorized');
```

Damit fällt der separate `supabaseUser`-Client komplett weg. Auth-Header wird trotzdem gefordert. Logging um den genauen Fehler erweitern (`authErr?.message`) damit künftige Auth-Probleme sofort sichtbar sind.

### Teil 2 — "Generate Default Portrait" für bestehende Avatare

Zwei Touchpoints, beide nutzen die **bereits existierende** `generate-avatar-portrait` Edge Function mit `variant: 'default_outfit'` (kostet ~$0.005 pro Avatar via Gemini 3.1 Flash Image):

**A) Per-Avatar Button auf der Avatar-Karte**
- Neuer kleiner Button "Generate Studio Portrait" (Sparkles-Icon) auf `BrandCharacterCard.tsx`, sichtbar wenn `portrait_mode !== 'auto_default_outfit'` oder wenn der User es erneuern will.
- Nutzt den bestehenden `useAvatarPortrait`-Hook, ergänzt um optionalen `variant`-Parameter (`'hedra' | 'default_outfit'`, default `'default_outfit'`).
- Spinner-State während Generierung, Toast bei Fertig.

**B) Bulk-Backfill Aktion auf `/brand-characters`**
- Neuer Outline-Button neben "Repair images" → **"Generate studio portraits"**.
- Iteriert sequentiell über alle eigenen Charaktere, bei denen `portrait_mode !== 'auto_default_outfit'`, und ruft `generate-avatar-portrait` mit `variant: 'default_outfit'` auf.
- Progress-Toast (`x / y abgeschlossen`), abschließend Invalidate von `['brand-characters']`.
- Confirm-Dialog vorab mit Hinweis auf ungefähre Dauer (~10–20s pro Avatar) und dass das alte Portrait überschrieben wird.

### Out of Scope
- Kein zusätzliches DB-Migration nötig (`portrait_mode`-Spalte existiert seit Stage 22, `generate-avatar-portrait` schreibt sie bereits).
- Keine Änderung an `generate-avatar-portrait` selbst.
- Keine Änderung an `clone-preset-avatar` (Preset-Avatare haben bereits saubere Portraits aus dem Seeder).

---

## Geänderte Dateien

- **edited** `supabase/functions/generate-avatar-wardrobe/index.ts` — Auth-Pattern auf Service-Role-validate-Token umgestellt + besseres Error-Logging.
- **edited** `src/hooks/useAvatarPortrait.ts` — optionaler `variant`-Parameter.
- **edited** `src/components/brand-characters/BrandCharacterCard.tsx` — "Generate Studio Portrait"-Button.
- **edited** `src/pages/BrandCharacters.tsx` — "Generate studio portraits"-Bulk-Button mit Progress-Toast.

---

## Validierung

1. Edge Function `generate-avatar-wardrobe` redeployen, einmal aus dem UI triggern, Logs prüfen → erwarten: `start … done`, kein `Unauthorized`.
2. Auf einem Bestands-Avatar (z.B. Matthew Dusatko) per Karten-Button "Generate Studio Portrait" klicken → neue saubere Portrait-URL erscheint.
3. Bulk-Button auf `/brand-characters` einmal laufen lassen → alle Bestands-Avatare bekommen das default-outfit Portrait.
4. Anschließend Wardrobe-Sheet → "Generate Wardrobe Sheet" für Medieval testen → 4 Outfits werden erfolgreich generiert.
