

## Problem

Der TikTok-Code verwendet `atob(connection.access_token_hash)` (Zeile 809), was die rohen verschlüsselten Binärdaten zurückgibt — **nicht** den eigentlichen Access Token. Alle anderen Provider (X, YouTube) verwenden die korrekte `decryptToken()` Funktion aus `_shared/crypto.ts`, die den Token erst per AES-GCM entschlüsselt.

Das Ergebnis von `atob()` auf verschlüsselte Daten enthält nicht-druckbare Zeichen, weshalb Deno's `fetch` den Header-Wert ablehnt: "failed to parse header value".

## Lösung

**Datei: `supabase/functions/publish/index.ts`**

1. `decryptToken` importieren (falls noch nicht importiert)
2. Zeile 809 ändern von:
   ```typescript
   const accessToken = atob(connection.access_token_hash).trim().replace(/[\r\n\t]/g, '');
   ```
   zu:
   ```typescript
   const accessToken = await decryptToken(connection.access_token_hash);
   ```

Das ist exakt das gleiche Muster wie bei X und YouTube.

## Ergebnis

Der TikTok Access Token wird korrekt entschlüsselt und der "failed to parse header value" Fehler ist behoben.

