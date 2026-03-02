

## Fix: Explizites Scheduling-Feld setzen statt keines

### Ursache (endgueltig identifiziert)

Die AWS Lambda-Funktion laeuft mit einer **neueren Remotion-Version** als 4.0.424 (die `concurrency`-Option wurde erst ~Juli 2025 hinzugefuegt, siehe remotion-dev/remotion#5459). In dieser Version gilt:

- Wenn **keines** der Scheduling-Felder (`framesPerLambda`, `concurrency`) gesetzt ist, berechnet Remotion intern Defaults fuer **beide**
- Die eigene Validierung prueft dann "sind beide gesetzt?" und wirft den Fehler

Unsere bisherige "neutrales Scheduling"-Strategie (alle Felder entfernen) war fuer v4.0.424 korrekt, **aber die deployete Lambda laeuft auf einer neueren Version**.

### Loesung

Genau **ein** Scheduling-Feld explizit setzen: `framesPerLambda` mit einem dynamisch berechneten Wert. So weiss Remotion eindeutig, welche Strategie gilt.

### Technische Aenderungen

**Datei: `supabase/functions/_shared/remotion-payload.ts`**

Die "neutral scheduling"-Logik aendern:

```text
Vorher:  Alle 3 Scheduling-Felder loeschen (keines senden)
Nachher: framesPerLambda IMMER setzen (berechnet oder Default 20),
         concurrency und concurrencyPerLambda IMMER loeschen
```

Konkret:
- Neue Hilfsfunktion `calculateFramesPerLambda(durationInFrames)` die den Remotion-Standardalgorithmus nachbildet (interpoliert zwischen 75 und 150 basierend auf Framecount)
- Nach der Normalisierung: `concurrency` und `concurrencyPerLambda` immer entfernen
- `framesPerLambda` immer setzen: entweder den explizit uebergebenen Wert ODER den berechneten Default (mindestens 20)

**Keine weiteren Dateien betroffen** -- die Caller bleiben unveraendert, da der Normalizer den Wert jetzt selbst berechnet.

### Warum das funktioniert

- Remotion sieht `framesPerLambda` explizit gesetzt und berechnet keinen `concurrency`-Default
- Die Validierung "sind beide gesetzt?" ist erfuellt (nur eines ist gesetzt)
- Der berechnete Wert entspricht exakt dem, was Remotion intern auch berechnen wuerde

### Berechnungsformel (aus Remotion-Docs)

```text
concurrency = interpolate(frameCount, [0, 18000], [75, 150], clamp)
framesPerLambda = max(frameCount / concurrency, 20)
lambdasNeeded = ceil(frameCount / framesPerLambda)
final = ceil(frameCount / lambdasNeeded)
```

Fuer ein 1800-Frame-Video (60s bei 30fps): `framesPerLambda = 24`
