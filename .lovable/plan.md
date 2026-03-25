

## YouTube zur Plattform-Auswahl im Tutorial hinzufuegen

### Problem
Im `PlatformStep.tsx` fehlt YouTube als Plattform-Option. Der `ChannelSelector` und `usePlatformCredentials` unterstuetzen YouTube bereits.

### Aenderung

**`src/components/onboarding/PlatformStep.tsx`**: YouTube-Eintrag zum `platformOptions`-Array hinzufuegen mit dem Youtube-Icon aus lucide-react und roter Farbe (`text-red-600`).

