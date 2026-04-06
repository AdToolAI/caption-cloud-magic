

## Problem

Der TikTok Access Token ist **abgelaufen** (`token_expires_at: 2026-04-05 21:12:00` — vor ca. 1 Stunde). Die `publish`-Funktion verwendet den abgelaufenen Token direkt, ohne vorher zu prüfen, ob er noch gültig ist. Das ergibt den 401-Fehler von TikTok: `access_token_invalid`.

Die Refresh-Logik existiert bereits in `_shared/tiktok-api.ts` (`refreshAccessToken`, `needsRefresh`), wird aber in der `publish`-Funktion **nicht aufgerufen**.

## Lösung

**Datei: `supabase/functions/publish/index.ts`** — TikTok-Publish-Bereich (ca. Zeile 795-820)

Nach dem Entschlüsseln des Tokens (Zeile 809) automatisch prüfen, ob der Token abgelaufen ist, und falls ja, den Refresh-Token verwenden:

1. `needsRefresh` und `refreshAccessToken` aus `_shared/tiktok-api.ts` importieren
2. `decryptToken` und `encryptToken` aus `_shared/crypto.ts` importieren (encryptToken falls noch nicht importiert)
3. Nach Zeile 819 einfügen:
   - `needsRefresh(connection.token_expires_at)` prüfen
   - Falls ja: `refreshToken = await decryptToken(connection.refresh_token_hash)`
   - `refreshAccessToken(refreshToken)` aufrufen
   - Neuen Access Token und Refresh Token verschlüsselt in die DB zurückschreiben
   - `token_expires_at` aktualisieren
   - Den neuen `accessToken` für den Rest der Funktion verwenden

```text
Ablauf:
  Token entschlüsseln
  -> needsRefresh(token_expires_at)?
     -> Ja: refreshAccessToken(refresh_token)
            -> DB updaten (neuer access_token, refresh_token, expires_at)
            -> accessToken = neuer Token
     -> Nein: weiter mit bestehendem Token
  -> TikTok Upload durchführen
```

## Betroffene Dateien
- `supabase/functions/publish/index.ts` — Token-Refresh vor TikTok-Upload einbauen

## Ergebnis
Der TikTok-Token wird automatisch erneuert wenn er abgelaufen ist. Der 401-Fehler tritt nicht mehr auf, solange der Refresh-Token noch gültig ist.

