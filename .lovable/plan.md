# Live Sweep Fix — Deploy der fehlenden Edge Functions

## Diagnose

Der Sweep-Button zeigt **"Failed to send a request to the Edge Function"**, weil:

1. `qa-live-sweep` und `qa-live-sweep-bootstrap` existieren als Dateien im Repo (im letzten Loop erstellt)
2. Aber: `POST /functions/v1/qa-live-sweep-bootstrap` → **404 NOT_FOUND**
3. Edge-Function-Logs sind leer → wurden nie aufgerufen, weil nie deployed

Das passiert manchmal, wenn neue Functions im selben Loop erstellt werden, in dem auch DB-Migrations laufen — der automatische Deploy-Schritt wird übersprungen.

## Fix (1 Schritt)

**Manuelles Deploy** der beiden Functions erzwingen via `supabase--deploy_edge_functions`:

- `qa-live-sweep`
- `qa-live-sweep-bootstrap`

Das ist die einzige notwendige Aktion. Code, DB, Bucket, RLS und UI sind bereits korrekt.

## Verifikation

Nach dem Deploy:
1. `OPTIONS /qa-live-sweep-bootstrap` → 200 (statt 404)
2. Im Cockpit "Bootstrap Assets" klicken → erzeugt 3 Assets im `qa-test-assets` Bucket
3. "Run Live Sweep" klicken → läuft sequentiell durch die Provider, Hard-Cap 20 € greift

## Was nicht angefasst wird

- Keine Code-Änderungen an den Functions
- Keine DB-Migration
- Keine UI-Änderungen
- Keine neuen Secrets

Falls nach dem Deploy ein zweiter Fehler auftritt (z.B. fehlendes Secret in einer Provider-Function), wird der separat im Bug-Inbox sichtbar — der Sweep selbst läuft dann aber zumindest an.
