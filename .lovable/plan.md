# Seedance 2.5 Lip-Sync: letzter Schritt vor dem Test

Die Pipeline ist fertig gebaut und deployed. Ein Punkt fehlt aber noch, sonst
siehst du die Funktion in der Oberfläche gar nicht.

## Was blockiert

Der Rollout-Schalter liegt in der Konfigurationstabelle `system_config`. Diese
Tabelle darf laut Zugriffsregeln nur von Konten mit Admin-Rolle gelesen werden.
Dein Konto (`info@useadtool.ai`) hat aktuell **keinen** Eintrag in der
Rollen-Tabelle. Ergebnis: Der Client kann den Schalter nicht lesen, fällt auf
"aus" zurück, und Seedance 2.5 taucht im Lip-Sync-Auswahlfeld nicht auf —
obwohl der Server ihn für dein Konto erlaubt.

Der Server selbst ist nicht betroffen (er liest mit Service-Rechten), es ist
rein ein Sichtbarkeitsproblem der Oberfläche.

## Was zu tun ist

1. **Feature-Flags lesbar machen.** Eine Lese-Regel ergänzen, die angemeldeten
   Nutzern nur Schlüssel mit dem Präfix `composer.feature.` freigibt. Alle
   anderen Konfigurationswerte (Keys, interne Schalter) bleiben admin-only.
2. **Flag-Zuweisung prüfen.** Der Schalter steht bereits auf "nur dein Konto".
   Nach Schritt 1 gegenprüfen, dass der Client ihn wirklich als aktiv liest.
3. **End-to-End-Testlauf.** Eine Szene im Video Composer mit Dialog +
   Lip-Sync, Quelle Seedance 2.5, Länge ~20 s:
   - Platte muss stumm ankommen (kein Modell-Sprechen).
   - Mit aktivem "Umgebungston vom Modell": Sprach-Gate muss `passed` oder
     `muted` in die Szene schreiben.
   - Finaler Mux: Studio-Stimme vorn, Atmo leise darunter, Lippen synchron.
4. **Ergebnis bewerten.** Fällt der Test sauber aus, Flag global aktivieren.
   Fällt er durch, bleibt er aus — kein Kunde ist betroffen.

## Danach offen (separat, nicht Teil dieses Schritts)

- Kosten-Gegenprüfung: tatsächliche ModelArk-Abrechnung eines 30-s-Clips gegen
  die kalkulierten 6,50 € Einkauf / 19,90 € Verkauf.
- Kein weiterer Code-Rückstand aus der Seedance-Integration.

## Technische Details

- Migration: `CREATE POLICY` auf `public.system_config` für `authenticated`,
  `USING (key LIKE 'composer.feature.%')`. Bestehende Admin-Policies bleiben
  unverändert; keine Schreibrechte für Nicht-Admins.
- Alternative, falls die Tabelle geschlossen bleiben soll: Auflösung des Flags
  in eine `SECURITY DEFINER`-Funktion verlagern und `useSeedance25Lipsync`
  darauf umstellen. Mehr Aufwand, gleicher Effekt — die Policy-Variante ist
  ausreichend, weil `composer.feature.*` keine Geheimnisse enthält.
- Betroffene Dateien: nur die Migration; `src/hooks/useSeedance25Lipsync.ts`
  bleibt unverändert.
