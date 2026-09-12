# Videos sichern, 7 Konten sperren, Testpasswort neu setzen

## A. Videos in deine Mediathek kopieren

Die 7 Konten aus dem Screenshot haben zusammen 5 Videos:

| Konto | Videos |
|---|---|
| fatimasvoiceoffaith@gmail.com | 1 |
| rihankhan2671977@gmail.com | 2 |
| naazs2106@gmail.com | 1 |
| xzyabc111@gmail.com | 1 |
| sleenkhan2@gmail.com | 0 |
| jofati7477@watchyio.com | 0 |
| jameskhan204@gmail.com | 0 |

Alle diese Videos werden — wie bereits eingerichtet — in die Mediathek von
bestofproducts4u@gmail.com kopiert, ohne sichtbaren Herkunftshinweis.
Die Kopie ist wiederholbar ohne Duplikate: bereits vorhandene Kopien werden
erkannt und nicht erneut angelegt. Die Videodateien selbst bleiben unverändert
im Speicher liegen, die Kopien verweisen auf dieselben Dateien.

Danach wird gezählt und bestätigt, dass für jedes der 5 Videos eine Kopie
in deiner Mediathek existiert. Erst wenn das stimmt, geht es zu Schritt B.

## B. Konten dauerhaft sperren (statt löschen)

Wie von dir gewählt: kein endgültiges Löschen, sondern dauerhafte
Login-Sperre für genau diese 7 Konten.

- Anmeldung ist ab sofort nicht mehr möglich (unbefristete Sperre)
- Alle bestehenden Sitzungen dieser Konten werden beendet
- Daten der Konten bleiben erhalten und die Sperre ist jederzeit umkehrbar
- Deine kopierten Videos sind davon unabhängig und bleiben in jedem Fall

Das Testkonto yaxac88729@watchyio.com wird **nicht** gesperrt.

## C. Neues Zufallspasswort für yaxac

Für yaxac88729@watchyio.com wird ein neues, zufälliges Passwort gesetzt
(24 Zeichen, Groß-/Kleinbuchstaben, Ziffern, Sonderzeichen). Bestehende
Sitzungen dieses Kontos bleiben unberührt. Das Passwort zeige ich dir
einmalig hier im Chat.

## Was unverändert bleibt

Preise, Abrechnung, Wallet, Rückerstattungen, Guthaben-Buchungen, Routing,
Verlauf/Job-Center und Lip-Sync werden nicht angefasst.

## Technische Details

- Kopie: Insert in `video_creations` für User `8948d3d9-…` mit Metadaten
  `mirrored_from_asset_id` / `mirrored_from_user_id` / `mirror_reason`,
  idempotent über den bestehenden Metadaten-Schlüssel; nutzt denselben Pfad
  wie der vorhandene `mirror_test_videos_to_admin`-Trigger.
- Sperre: `auth.users.banned_until = 'infinity'` für die 7 IDs plus Löschen
  ihrer Einträge in `auth.refresh_tokens`/`auth.sessions`.
- Passwort: `encrypted_password = crypt(<random>, gen_salt('bf'))` für
  `ee1f91c5-b61d-4188-8e95-da419e376c59`.
- Verifikation: Zählabfragen auf Mirror-Rows, `banned_until` und einen
  Login-Test mit dem neuen Passwort.
