## Problem

Beim Upload eines Charakter-Fotos im **Talking-Head-Dialog** (Motion Studio → Storyboard) erscheint der Toast **„Upload-Fehler – Bucket not found"**.

Ursache: `src/components/video-composer/TalkingHeadDialog.tsx` (Zeile 86–90) lädt in den Bucket **`library`** hoch — diesen Bucket gibt es im Projekt nicht. Vorhandene passende Buckets sind u.a. `composer-uploads` (public), `brand-characters` (privat) und `talking-head-renders` (public).

## Fix

In `TalkingHeadDialog.tsx` den Bucket von `library` auf **`composer-uploads`** umstellen (öffentlich lesbar, RLS verlangt `user_id` als ersten Pfadsegment — der bestehende Pfad `${user.id}/talking-head/...` erfüllt das bereits).

Konkret:

- Zeile 87: `.from('library')` → `.from('composer-uploads')`
- Zeile 90: `.from('library')` → `.from('composer-uploads')`

Keine Migration nötig (Bucket existiert), keine weiteren Dateien betroffen, keine Backend-Änderung. HeyGen kann die resultierende Public-URL anschließend wie bisher fetchen.

## Verifikation

1. Im Motion Studio → Storyboard → „Talking-Head erstellen" öffnen.
2. PNG/JPG hochladen → Toast „Foto hochgeladen" erscheint, Vorschau wird sichtbar.
3. Anschließend Skript + Stimme wählen und Generierung starten — sollte wie gewohnt durchlaufen.