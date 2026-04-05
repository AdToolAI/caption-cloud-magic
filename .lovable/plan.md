

## Plan: TikTok "In App ansehen" Button nach erfolgreichem Publish

### Was wird gemacht

Nach einem erfolgreichen TikTok-Publish wird ein Button "In TikTok ansehen" angezeigt, der den User direkt zur TikTok-App (bzw. Web-Profil) weiterleitet, wo der Draft sichtbar ist.

### Umsetzung

**Datei: `src/components/composer/PublishResultCard.tsx`**

Aktuell zeigt die Karte bei `result.ok && result.permalink` einen "View post"-Link. TikTok liefert im Sandbox-Modus aber keinen `permalink`, da es ein Draft ist.

Änderung: Wenn `result.provider === 'tiktok'` und `result.ok` ist, aber kein `permalink` vorhanden, einen speziellen Button anzeigen:
- Text: "In TikTok App öffnen"
- Link: `https://www.tiktok.com` (öffnet die TikTok-App auf Mobilgeräten via Deep Link, oder das Web-Profil auf Desktop)
- Hinweistext darunter: "Video wurde als Draft hochgeladen — öffne TikTok um es zu veröffentlichen"

Zusätzlich: Falls die `social_connections`-Daten einen TikTok-Username enthalten, den Link direkt auf `https://www.tiktok.com/@username` setzen, damit der User auf seinem Profil landet.

**Datei: `supabase/functions/publish/index.ts`**

Bei erfolgreichem TikTok-Upload den `account_name` aus der `social_connections`-Tabelle im Response mitgeben (als `permalink`-Ersatz), z.B.:
```
permalink: `https://www.tiktok.com/@${connection.account_name}`
```

### Ergebnis

Nach erfolgreichem TikTok-Publish erscheint ein Button der direkt zum TikTok-Profil führt, wo der Draft sichtbar ist.

