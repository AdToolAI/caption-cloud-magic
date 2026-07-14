## Ziel
Das goldene Sparkles-Icon aus dem Screenshot wird das neue App-Logo — überall im UI und als Favicon (Browser-Tab / Suchleiste).

## Assets
- Upload `user-uploads://image-1784060666.png` (goldene Sparkles auf schwarz) → wird zur einzigen Logo-Quelle.
- Zwei Varianten aus derselben Datei:
  1. **Icon-only** (`public/favicon.png`) — für Browser-Tab.
  2. **Icon + Wortmarke** wird nicht ersetzt: die "AdTool AI"-Wortmarke im Header bleibt, nur das Icon davor wird ausgetauscht.

## Schritte
1. **Favicon**
   - `public/favicon.png` mit dem Sparkles-Icon überschreiben.
   - Alte `public/favicon.ico` löschen.
   - `index.html` prüfen: `<link rel="icon" href="/favicon.png" type="image/png">` — falls schon so, nichts ändern; sonst anpassen.
   - Apple-Touch-Icon (falls vorhanden) auf dieselbe Datei zeigen lassen.

2. **App-Header-Logo**
   - Bestehendes AdTool-AI-Logo-Asset (aktuell goldenes "A"-Clapper) durch das Sparkles-Icon ersetzen.
   - Neues Asset unter `src/assets/logo-sparkles.png` als Lovable-Asset-Pointer anlegen (via `lovable-assets`, kein Binary im Repo).
   - Zentrale Logo-Komponente (z. B. `src/components/Logo.tsx` bzw. wo aktuell das "A"-Clapper importiert wird) auf das neue Asset umstellen.
   - Größe/Alignment im Header unverändert lassen; nur die Bildquelle tauschen.

3. **Weitere Fundstellen prüfen und angleichen**
   - Loading-Splash / Auth-Seiten / E-Mail-Templates / OG-Fallback — überall dort, wo aktuell das alte Clapper-Icon steht, dieselbe neue Datei einsetzen.
   - Manifest (`public/manifest.json`) `icons`-Einträge auf die neue PNG umbiegen.

4. **Sanity-Check**
   - Preview neu laden → Favicon im Tab sichtbar.
   - Header-Logo im Dashboard, Landing, Auth sichtbar.
   - Kein doppeltes altes Logo mehr im Bundle.

## Was ich NICHT ändere
- Keine Farbtokens, kein Design-System-Update.
- Keine Wortmarke "AdTool AI" austauschen.
- Keine Logik/Business-Layer.

## Offene Frage
Auf dem zweiten Screenshot ist neben dem Sparkles-Icon weiter der Buchstabe "A" als Wortmarke zu sehen. Soll ich das so lassen (Sparkles-Icon + Text "AdTool AI") oder soll das Icon das "A" komplett ersetzen (nur Sparkles + "dTool AI" wäre komisch — vermutlich meinst du: Sparkles + volle Wortmarke)?
