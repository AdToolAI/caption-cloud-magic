## Kein echter Fehler — nur eine unterbrochene Zustimmung

Der „failed"-Dialog kam nicht aus einer fehlgeschlagenen Operation, sondern weil die Zustimmung zum **Storage-Bucket-Update** (`talking-head-renders` → private) im UI unterbrochen wurde, bevor ich weitermachen konnte. Nichts ist bisher kaputtgegangen.

### Bereits erfolgreich in diesem Turn erledigt
- ✅ **DB-Migration ausgeführt**: `lipsync-plates` owner-scoped, `talking-head-renders` owner-scoped, `promo_codes` SELECT für authenticated entfernt, `search_path` auf 10 Funktionen gefixt.
- ✅ **Edge Function `generate-talking-head`**: nutzt jetzt `createSignedUrl(7d)` statt `getPublicUrl`.
- ✅ **`public/sitemap.xml`**: 19 URLs statt 7 (Hubs, Pricing, FAQ, Support, alle Legal-Seiten).
- ✅ **`public/llms.txt`**: neu angelegt für AI-Crawler.
- ✅ **`index.html`**: `theme-color` auf Bond-Deep-Black `#050816`.
- ℹ️ **Supply-Chain-Scan**: liefert aktuell 0 kritische Vulns — die alte Meldung war stale, wird beim nächsten Rescan grün.

### Noch offen (dieselben Schritte, nur zu Ende geführt)

1. **`talking-head-renders` Bucket auf `public=false` flippen** — das war der unterbrochene Tool-Call. Erfordert deine Freigabe im Approval-Dialog. Ohne diesen Flip bleiben alte URLs technisch noch öffentlich, obwohl die Policy schon gehärtet ist.
2. **Rescans triggern**: `security--run_security_scan`, `seo_chat--trigger_scan`, `supabase--linter` — damit die Findings offiziell auf „fixed" gehen.
3. **Optional Sprint 4**: Font-Preload verschlanken (nur Playfair + Inter kritisch), Hero-Bild `fetchpriority="high"`, console-strip-Plugin für Production-Build.

### Nicht angefasst (bewusst deferred)
- **Sprint 2 Polling-Refactor** (`useAIJobStatus` etc. auf Realtime umbauen): technisch invasiv, sollte in eigener Runde mit Test-Zyklus laufen. Aktuelles Polling ist teuer aber funktioniert.
- **GSC-Verifikation**: braucht einen 3-Minuten-Flow mit Publish dazwischen — extra Runde.

### Freigabe

Soll ich mit **Schritt 1 (Bucket-Flip + Rescans)** weitermachen? Der Approval-Dialog kommt gleich wieder für den Storage-Bucket. Sprint 2/GSC danach in getrennten Turns.
