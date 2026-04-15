<final-text>Kurzbefund

- Du hast recht: Der reine Deploy ist hier nicht das Kernproblem. Im aktuellen Code sind der kompakte Phasen-Stepper und der GET-Check im Service Worker bereits vorhanden.
- Dass du trotzdem noch den alten Balken plus `Cache.put ... POST/PATCH unsupported` siehst, spricht sehr stark für einen alten aktiven Service Worker bzw. ein altes gecachtes Frontend-Bundle.
- Zusätzlich gibt es im Wizard einen echten Logikfehler: Mehrere Step-Wechsel sind hart auf `4/5/6` codiert. Sobald der optionale Schritt `product-images` aktiv ist, landet der Flow auf dem falschen Screen. Das erklärt die unfertige/leere zweite Ansicht.

Plan

1. Service Worker hart entschärfen
- `public/sw.js` so umbauen, dass er nicht mehr pauschal alle GET-Requests cached.
- Den Worker auf Push-Benachrichtigungen und höchstens minimale App-Shell-Dateien begrenzen.
- Cache-Version erhöhen und beim Aktivieren alte `caption-genie-*` Caches konsequent löschen.
- Dadurch werden alte Bundles nicht mehr weiter ausgeliefert und die `Cache.put`-Fehler verschwinden zuverlässig.

2. Service-Worker-Registrierung bereinigen
- In `src/main.tsx` die Registrierung so anpassen, dass sicher ein frischer Worker gezogen wird.
- Alte Registrierungen/Caches beim Wechsel sauber entfernen.
- `src/hooks/usePushNotifications.ts` an dieselben Guards koppeln, damit kein Fallback versehentlich wieder einen problematischen Worker registriert.

3. Wizard-Logik von harten Indizes auf Step-IDs umstellen
- In `src/components/universal-video-creator/UniversalVideoWizard.tsx` einen Helper wie `goToStep('consultation' | 'generating' | 'preview' | 'export')` einführen.
- Alle harten Sprünge (`setCurrentStep(4/5/6)`) ersetzen, besonders in:
  - `handleConsultationSkip`
  - `handleAutoGenerationComplete`
  - `handleSwitchToManual`
  - `handleRetry`
  - `handleRateLimitRetry`
- So funktioniert der Flow auch korrekt, wenn `product-images` eingeschoben ist.

4. Leere/unfertige Ansicht absichern
- Wenn ein Projekt schon vorhanden ist, der Wizard aber noch auf `generating` steht, automatisch auf `preview` weiterleiten.
- Für ungültige Zustandskombinationen eine defensive Fallback-UI ergänzen, damit nie wieder nur ein leerer schwarzer Bereich sichtbar ist.

5. Sichtbare Phasenleiste final verifizieren
- Nach dem Cache-Break sollte der bereits vorhandene kompakte Phasen-Stepper tatsächlich live erscheinen.
- Falls nötig, danach noch Feintuning an Abstand/Labelbreite, aber erst nachdem wirklich der frische Bundle geladen wird.

Technische Details

- Betroffene Dateien:
  - `public/sw.js`
  - `src/main.tsx`
  - `src/hooks/usePushNotifications.ts`
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- Hauptursachen:
  - alter aktiver Service Worker bzw. altes gecachtes Frontend
  - harte Step-Indizes trotz optionalem `product-images`-Schritt
- Erwartetes Ergebnis:
  - kein `Cache.put`-Fehler mehr
  - der neue kompakte Stepper wird wirklich angezeigt
  - kein leerer/unfertiger Screen mehr nach Beratung oder Generierung
  - Produkt-Ads mit Bild-Upload springen sauber zu Generierung, Preview und Export</final-text>