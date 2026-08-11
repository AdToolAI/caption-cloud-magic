# Composer-Entwurf hängt am Browser, nicht am Konto

## Was tatsächlich passiert

Die Konten verschmelzen nicht. In der Datenbank sind die Composer-Projekte
sauber pro Nutzer getrennt (jedes Projekt hat eine `user_id`, es gibt keine
geteilten Zeilen). Die Charaktere sind ebenfalls kontogebunden — deshalb siehst
du sie nur in `bestofproducts4u@gmail.com`.

Geteilt wird nur der **lokale Entwurf im Browser**: Der Video Composer speichert
den kompletten Entwurf unter dem festen Schlüssel `video-composer-draft` (plus
`video-composer-draft-tab`) im localStorage — ohne Bezug zum angemeldeten
Konto. Beim Abmelden wird er nicht gelöscht. Meldest du dich also im selben
Browser mit einem anderen Konto an, lädt der Composer den Entwurf des vorherigen
Kontos. Genau das erklärt dein Bild: gleiche Briefing-Eingaben, aber Charaktere
nur dort, wo sie wirklich hingehören.

Der Content Studio macht es bereits richtig (Schlüssel enthält die User-ID) —
der Composer und die Universal-Video-Entwürfe nicht.

## Was geändert wird

1. **Entwürfe an das Konto binden**
   Composer-Entwurf und Tab-Zustand bekommen die User-ID im Schlüssel
   (`video-composer-draft:<user-id>`). Ein Entwurf aus Konto A ist damit in
   Konto B unsichtbar.

2. **Einmalige Übernahme des alten Entwurfs**
   Beim ersten Laden nach der Umstellung wird ein vorhandener alter Entwurf
   (`video-composer-draft`) dem aktuell angemeldeten Konto zugeordnet und der
   alte Schlüssel entfernt — niemand verliert seine laufende Arbeit.

3. **Abmelden räumt auf**
   Beim Logout werden alle entwurfsartigen lokalen Daten gelöscht: Composer-
   Entwurf und -Tab, `composer_import`, Universal-Video-Wizard/Consultant,
   Toolkit-Prompt-Entwurf.

4. **Kontowechsel im laufenden Tab**
   Wechselt die angemeldete Nutzer-ID, verwirft der Composer den geladenen
   Entwurf im Speicher und lädt den des neuen Kontos statt weiterzuschreiben.

## Technische Details

- `src/components/video-composer/VideoComposerDashboard.tsx`: `STORAGE_KEY` /
  `TAB_STORAGE_KEY` werden zu Funktionen `draftKey(userId)`; `loadDraft`,
  `saveDraft`, `clearDraft`, `restoreActiveTab` und die vier Inline-Aufrufe
  (Z. 180, 1077, 1872/1873, 1934) übernehmen die User-ID aus `useAuth()`.
  Ohne angemeldeten Nutzer wird nichts geschrieben.
- Neue kleine Hilfe `src/lib/local-draft-scope.ts`: Schlüsselbildung, einmalige
  Migration des alten globalen Schlüssels, `clearAllLocalDrafts()`.
- `src/hooks/useAuth.tsx` `signOut`: ruft `clearAllLocalDrafts()` vor
  `supabase.auth.signOut()`.
- `src/lib/universal-video-draft.ts`: gleiche Schlüssel-Scoping-Logik.
- Keine Datenbank- oder RLS-Änderung; keine Berührung von Cast & World,
  Anker-Logik oder der Lip-Sync-Kette.
- Prüfung: Typecheck plus manueller Test — Entwurf in Konto A anlegen,
  abmelden, mit Konto B anmelden, Composer öffnet leeres Briefing.
