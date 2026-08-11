# Seedance 2.5 im Composer sichtbar machen

## Befund (geprüft, nicht vermutet)

Der Rollout-Schalter `composer.feature.seedance25_lipsync` steht in der
Konfigurationstabelle auf: aus für alle, **an für dein Konto**
(`ab6bf0d1-…`). Die Lese-Regel für `composer.feature.*` existiert ebenfalls.

Trotzdem liest die Oberfläche den Schalter nicht: Die Tabelle
`public.system_config` hat **keine einzige Tabellen-Berechtigung** vergeben —
weder für angemeldete Nutzer noch sonst jemanden. Prüfung der
Berechtigungsliste liefert null Einträge. Ohne Berechtigung schlägt jede
Abfrage mit einem Rechtefehler fehl, bevor die Lese-Regel überhaupt greift.
Der Hook fängt den Fehler ab und liefert "aus" — deshalb fehlt Seedance 2.5
im Lip-Sync-Auswahlfeld (dein Screenshot zeigt genau diesen Dialog-Modus:
"HappyHorse · Hailuo Fallback").

Im B-Roll-Modus (Dialog-Schalter aus) ist Seedance 2.5 bereits gelistet — die
Lücke betrifft ausschließlich den Dialog-/Lip-Sync-Modus.

## Umsetzung

1. **Berechtigung nachziehen.** Lesezugriff auf `public.system_config` für
   angemeldete Nutzer erteilen; Schreibrechte bleiben bei Admins bzw. dem
   Service-Konto. Die bestehende Lese-Regel begrenzt die sichtbaren Zeilen
   weiterhin auf `composer.feature.*` — Admin-Werte bleiben verborgen.
2. **Schalter global aktivieren.** Der Wert wird auf `enabled: true` gesetzt,
   damit Seedance 2.5 nicht nur für dein Konto erscheint. Ist das nicht
   gewünscht, bleibt die Konto-Liste unverändert und nur Schritt 1 läuft.
3. **Gegenprüfen.** Szene im Composer, Dialog & Lip-Sync einschalten: Seedance
   2.5 muss als letzte (Premium-)Option im Modellfeld stehen, Szenendauer bis
   30 s einstellbar.

## Technische Details

- Migration: `GRANT SELECT ON public.system_config TO authenticated;` sowie
  `GRANT ALL ON public.system_config TO service_role;`. Kein Policy-Wechsel.
- Optional Schritt 2: `UPDATE public.system_config SET value =
  jsonb_set(value, '{enabled}', 'true') WHERE key =
  'composer.feature.seedance25_lipsync';`
- Kein Anwendungscode betroffen: `useSeedance25Lipsync.ts`,
  `modelMapping.ts` und `SceneCard.tsx` bleiben unverändert.
