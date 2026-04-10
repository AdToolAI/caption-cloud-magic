

# Fix: "View Post" Button für Facebook Publishing

## Problem
Nach dem erfolgreichen Veröffentlichen auf Facebook fehlt der "View Post"-Button, den Instagram hat. Zwei Ursachen:

1. **Permalink-Format falsch**: Die Edge Function gibt `https://facebook.com/${postId}` zurück, wobei `postId` im Graph-API-Format ist (z.B. `123456789_987654321`). Dieses URL-Format funktioniert nicht zuverlässig.
2. **Mock-Fall**: Wenn keine Verbindung besteht, wird `permalink: undefined` zurückgegeben.

## Lösung
Die Edge Function (`supabase/functions/publish/index.ts`) anpassen, um korrekte Facebook-Permalinks zu generieren:

### Änderung in `publishToFacebook`
- **Für Feed/Photo Posts** (Zeile 754-766): Nach dem erfolgreichen Post die Graph API aufrufen, um den echten Permalink zu holen:
  ```
  GET /{post_id}?fields=permalink_url&access_token=...
  ```
  Falls der API-Call fehlschlägt, als Fallback `https://www.facebook.com/${postResponse.id}` verwenden (mit `pageId_postId` Split).

- **Für Video Posts** (Zeile 731-736): Gleiche Logik – nach Upload den Permalink via Graph API holen oder Fallback `https://www.facebook.com/${pageId}/videos/${videoId}` verwenden.

### Betroffene Datei
- `supabase/functions/publish/index.ts` — `publishToFacebook` Funktion, 2 Stellen (Video-Return ~Zeile 735, Feed-Return ~Zeile 765)

### Ergebnis
- Der `PublishResultCard` zeigt automatisch den "View post"-Link, da `result.permalink` dann korrekt gesetzt ist (die Komponente prüft bereits `result.ok && result.permalink`).

