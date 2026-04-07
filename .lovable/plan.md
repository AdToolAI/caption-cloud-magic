
## Plan: Gaming Hub-Items auf "Stream Dashboard" reduzieren

### Problem
Die Hub-Übersicht zeigt 5 separate Karten (Stream Dashboard, Clip Creator, Gaming Content Studio, Stream Analytics, Chat Manager), obwohl alle Features bereits über die Tabs im Stream Dashboard erreichbar sind. Das ist redundant.

### Änderung

**Datei: `src/config/hubConfig.ts`** — Die `items`-Liste im `gaming`-Hub auf einen einzigen Eintrag reduzieren:

```typescript
items: [
  { route: "/gaming", titleKey: "Stream Dashboard", descKey: "hubItemDesc.streamDashboard", icon: Radio },
],
```

Die 4 anderen Einträge (`clips`, `content`, `analytics`, `chat`) werden entfernt.

### Ergebnis
Die Gaming-Hub-Kachel zeigt nur noch "Stream Dashboard" — alle anderen Features sind dort über die Tabs erreichbar.
