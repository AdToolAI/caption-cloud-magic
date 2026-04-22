

## Auto-Select bei nur einer passenden Seite — damit der Connect-Flow im Video durchgängig funktioniert

### Ziel
Nach erfolgreichem Meta-OAuth soll Instagram **ohne manuellen Page-Select-Schritt** automatisch verbunden werden, wenn der Account nur **eine einzige passende Facebook-Seite mit verknüpftem Instagram-Business** hat. Damit ist der Flow visuell **identisch zum Facebook-Flow** im Video:

```text
Klick „Connect Instagram"
→ Meta-Continue
→ Rückkehr in die App
→ Verbindung steht (ohne Zwischendialog)
```

### Was geändert wird

#### 1. Auto-Resolve direkt nach OAuth-Callback
**Datei:** `supabase/functions/oauth-callback/index.ts`

- Für `provider=instagram` nach Token-Exchange:
  - Direkt `/me/accounts?fields=id,name,access_token,instagram_business_account` aufrufen
  - Pages filtern auf solche **mit** `instagram_business_account.id`
- Drei Fälle:
  - **Genau 1 IG-fähige Page** → automatisch `facebook-select-page`-Logik inline ausführen, Verbindung sofort finalisieren, Redirect mit `connected=instagram&status=success&auto_selected=true`
  - **Mehrere IG-fähige Pages** → wie bisher pending + `selection_required=true`, Page-Select-Dialog erscheint
  - **0 IG-fähige Pages** → klare Fehlermeldung „Keine Facebook-Seite mit verknüpftem Instagram-Business gefunden"

#### 2. UI zeigt sauberen Erfolgs-Toast bei Auto-Select
**Datei:** `src/components/performance/ConnectionsTab.tsx`

- Wenn `auto_selected=true` in der Callback-URL:
  - Kein Page-Select-Dialog öffnen
  - Direkt Erfolgs-Toast: „Instagram verbunden: @username"
  - `social-health` und Connection-Liste invalidieren

#### 3. Page-Select-Dialog bleibt als Fallback
- Für Accounts mit mehreren Seiten weiterhin verfügbar (kein Verlust an Funktionalität)
- Logik aus `facebook-select-page` wird im Callback **wiederverwendet** (gleiche IG-Lookup- und Profile-Fetch-Sequenz), nicht dupliziert — Helper extrahieren

### Erwartetes Ergebnis im Video
```text
Klick „Connect Instagram"
→ Meta-Login/Continue
→ Rückkehr in die App
→ Toast: „Instagram verbunden: @samuelxyz"
→ Verbindung erscheint sofort grün/connected
```

Visuell **identisch zum Facebook-Flow**, kein zusätzlicher Klick nötig.

### Betroffene Dateien
- `supabase/functions/oauth-callback/index.ts` — Auto-Resolve-Logik für Instagram bei genau 1 passender Page
- `supabase/functions/facebook-select-page/index.ts` — IG-Resolve-Logik in einen wiederverwendbaren Helper extrahieren (oder inline duplizieren, falls einfacher)
- `src/components/performance/ConnectionsTab.tsx` — Handling für `auto_selected=true` Query-Param

### Nicht betroffen
- Manueller Disconnect/Revoke bleibt
- `FacebookPageSelectDialog` bleibt als Fallback für Multi-Page-Accounts
- Permission-Anforderungen bleiben identisch (alle 6 Toggles)

### Voraussetzung
Im Meta-Dialog müssen weiterhin **alle 6 Toggles** aktiv sein (`pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`). Ohne `pages_show_list` liefert `/me/accounts` keine Pages und der Auto-Select kann nicht greifen — dann zeigen wir den klaren Fehler aus Punkt 1, Fall 3.

### Risiko
Gering. Wir nutzen die bereits funktionierende `facebook-select-page`-Logik, führen sie nur einen Schritt früher aus, wenn die Auswahl eindeutig ist.

### Test
1. Instagram trennen
2. „Connect Instagram" klicken, im Meta-Dialog alle Toggles AN, deine Seite mit verknüpftem IG auswählen
3. Erwartung: Rückkehr in die App → sofort Erfolgs-Toast, **kein** Page-Select-Dialog
4. Verbindung ist aktiv, Sync und echte Daten funktionieren

