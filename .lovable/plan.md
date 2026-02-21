
# Fix: Doppelte `aws`-Variable verhindert Funktions-Start

## Problem

Die Edge Function `auto-generate-universal-video` kann nicht starten wegen:
```
Uncaught SyntaxError: Identifier 'aws' has already been declared (line 538/568)
```

`const aws = new AwsClient(...)` wird zweimal deklariert:
- Zeile 365: Erste Deklaration (fuer S3-Uploads von Visuals etc.)
- Zeile 568: Zweite Deklaration (neu hinzugefuegt fuer Lambda-Aufruf)

Da beide im selben Funktions-Scope liegen, crasht die gesamte Funktion beim Laden. Deshalb schlaegt auch der OPTIONS-Preflight fehl -- die Funktion laeuft gar nicht.

## Loesung

Zeile 568-572 entfernen (die zweite `const aws = new AwsClient`-Deklaration). Die bestehende `aws`-Variable von Zeile 365 ist im selben Scope und kann direkt wiederverwendet werden.

## Aenderung

**Datei**: `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 568-572 (die zweite aws-Deklaration) loeschen. Der `aws.fetch(lambdaUrl, ...)` Aufruf ab Zeile 577 bleibt unveraendert und nutzt die bereits existierende `aws`-Variable von Zeile 365.

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- Doppelte `const aws`-Deklaration entfernen
