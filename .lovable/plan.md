

## Plan: Service Worker Cache-Version bumpen + Cache-Invalidierung

### Problem
Die Published-Seite zeigt noch die alten 12 Templates, obwohl der Code korrekt auf 4 Templates umgebaut ist. 

**Ursache**: Die Service Worker Datei `public/sw.js` cached `/`, `/index.html` und alle Fetch-Responses unter dem Cache-Namen `caption-genie-v2`. Da sich dieser Cache-Name zwischen Deployments nie ändert, wird der alte SW nicht als "neu" erkannt und alte Caches werden nicht bereinigt.

### Änderungen

**1. `public/sw.js`**
- Cache-Namen von `caption-genie-v2` auf `caption-genie-v3` bumpen
- Das bewirkt, dass der SW beim nächsten Laden als "geändert" erkannt wird und im `activate`-Event alle alten Caches löscht
- Optional: `self.skipWaiting()` im `install`-Event hinzufügen, damit der neue SW sofort aktiv wird (nicht erst beim nächsten Tab-Reload)
- Optional: `clients.claim()` im `activate`-Event, damit der neue SW sofort alle offenen Tabs übernimmt

**2. Publish**
- Nach dem Cache-Bump die Seite erneut publishen

### Ergebnis
- Beim nächsten Besuch der Published-Seite erkennt der Browser die geänderte `sw.js`
- Der neue SW installiert sich, löscht den alten `caption-genie-v2` Cache
- Die neuen 4 Templates werden korrekt geladen

