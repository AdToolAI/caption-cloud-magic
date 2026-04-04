

## Plan: Push-Notifications reparieren — Service Worker registrieren

### Problem
Der Service Worker (`public/sw.js`) wird nirgends registriert. Dadurch hängt `navigator.serviceWorker.ready` endlos und der Toggle reagiert nicht.

### Änderungen

**1. `src/main.tsx` — Service Worker Registration hinzufügen**
- Nach dem `createRoot`-Aufruf den SW registrieren
- Guard gegen iframe/Preview-Umgebung (damit es im Lovable-Editor nicht stört)
- Nur in Production registrieren

```typescript
// Nach createRoot(...)
const isInIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreview = window.location.hostname.includes("id-preview--");

if (!isInIframe && !isPreview && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

**2. `src/hooks/usePushNotifications.ts` — Timeout & Fallback**
- Wenn `navigator.serviceWorker.ready` nicht innerhalb von 5 Sekunden resolved, selbst `/sw.js` registrieren und erneut versuchen
- Bei Fehler eine klare Fehlermeldung anzeigen statt endlos zu hängen
- Loading-State korrekt zurücksetzen bei Timeout

### Ergebnis
Nach diesen 2 Änderungen wird der Service Worker beim App-Start registriert. Der Toggle funktioniert dann: Browser fragt nach Permission → Subscription wird erstellt → Push-Notifications kommen an.

