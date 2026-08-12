# Seedance 2.5 im Lip-Sync-Pfad dauerhaft erhalten

## Bestätigte Ursache

Der letzte Lauf für Szene `696e21c8…` belegt die widersprüchliche Serverlogik:

```text
ai-seedance25 + cinematic-sync — keeping as master plate
clipSource 'ai-seedance25' not supported by composer — falling back to ai-hailuo
```

Seedance 2.5 besteht also die Lip-Sync-Allowlist, fehlt aber in der direkt danach ausgeführten allgemeinen `SUPPORTED_AI_SOURCES`-Liste. Diese zweite Liste überschreibt die bewusste Auswahl, persistiert `ai-hailuo` und lässt die 25-Sekunden-Szene anschließend mit einem Provider zurück, der nur 6/10 Sekunden unterstützt.

Zusätzlich sind zwei Frontend-Metadaten veraltet: Die Capability-Registry markiert Seedance 2.5 noch als nicht Lip-Sync-fähig, und der Cinematic-Sync-Validator führt es nicht in seiner lokalen Allowlist. Diese Stellen erzeugen Warnungen, sind aber nicht die Ursache des tatsächlichen Wechsels.

## Umsetzung

1. **Server-Routing korrigieren**
   - `ai-seedance25` in die vom Composer tatsächlich implementierten Videoquellen aufnehmen.
   - Die bestehende Rollout-Prüfung für Lip-Sync bleibt erhalten: Ohne Freigabe wird Seedance 2.5 weiterhin klar abgelehnt, niemals still auf einen anderen Provider umgeschrieben.
   - Eine explizite Seedance-2.5-Auswahl darf auf keinem normalen Dispatch-Pfad zu Hailuo oder HappyHorse mutieren.

2. **Provider-Fähigkeiten zentral konsistent machen**
   - Seedance 2.5 in der Capability-Registry als Lip-Sync- und Multi-Speaker-fähig mit 4–30 Sekunden führen.
   - Den Cinematic-Sync-Validator aus derselben Provider-Definition speisen oder mindestens auf dieselbe zertifizierte Liste umstellen; die veraltete lokale Allowlist entfernen.
   - Veraltete UI-Texte wie „HappyHorse · Hailuo Fallback“ durch eine providerneutrale Beschreibung ersetzen. Ein Fallback wird nicht mehr versprochen, weil unzulässige Kombinationen vor dem Start blockiert werden sollen.

3. **Silent-Fallback-Regel professionell absichern**
   - Für vom Nutzer ausgewählte, registrierte Provider gilt: **beibehalten oder mit verständlichem Fehler abbrechen**, niemals still wechseln.
   - Bestehende Sondermigrationen für tatsächlich andere Fälle (zum Beispiel Pika-Wartung oder Runway ohne Referenzvideo) bleiben außerhalb dieses Scopes unverändert.

4. **Regressionstests**
   - Seedance 2.5 + Cinematic-Sync + 25 Sekunden bleibt vom Picker über Dispatch bis zur gespeicherten Szene `ai-seedance25` / 25 s.
   - Seedance 2.5 ohne aktivierte Rollout-Freigabe liefert einen eindeutigen Provider-Fehler und schreibt keinen Ersatzprovider.
   - Ein unbekannter Provider wird weiterhin vom allgemeinen Schutz behandelt.
   - Frontend-Validator und Render-Warnungen erkennen Seedance 2.5 als 4–30-s-Lip-Sync-Provider.

5. **Gegenprobe am echten Projekt**
   - Die betroffene Szene einmal bewusst wieder auf Seedance 2.5 / 25 s setzen; kein automatisches Datenbank-Rewrite bestehender Szenen.
   - Dispatch und Logs prüfen: genau ein Provider vom UI-Picker bis zum ModelArk-Auftrag, kein Hailuo-Fallback.
   - Danach erst die eigentliche Lip-Sync-Ausgabe beurteilen; der zuletzt sichtbare Identitäts-Confidence-Fehler stammt bereits vom fälschlich erzeugten Hailuo-Clip und ist kein gültiger Seedance-2.5-Test.

## Technische Grenzen

- Keine Änderung an Face-Mapping, Preclip, Masken, Schwellenwerten, Sync.so, Run-Identität oder Zustandsmaschine.
- Keine Änderung an ModelArk-Payload, Preisen oder Credit-Refunds.
- `compose-video-clips` gehört zum eingefrorenen Lip-Sync-Scope. Für die Implementierung ist deshalb ein eng begrenztes Unfreeze ausschließlich für die fehlende Provider-Registrierung und ihre Tests erforderlich; danach bleibt der Freeze bestehen.
