# Lip-Sync-Proof-Szene nur noch in der deutschen UI zeigen

## Was sich ändert

Der Abschnitt "Ein Briefing. Ein fertiger Clip." (Proof Moment mit dem 4-Sprecher-Clip auf Deutsch) wird auf der Startseite nur noch angezeigt, wenn die UI-Sprache **Deutsch** ist. In Englisch und Spanisch entfällt der Abschnitt vollständig — dort folgt direkt nach dem Hero das KI-Modell-Arsenal.

Die Komponente bleibt im Code erhalten, sodass sie später (z. B. mit einem englischen Clip) einfach wieder freigeschaltet werden kann.

## Technisch

- `src/pages/Index.tsx`: `<ProofMoment />` in eine bedingte Ausgabe setzen — `{language === 'de' && <ProofMoment />}` (die Seite nutzt bereits `const { t, language } = useTranslation()`).
- Kein Eingriff in `ProofMoment.tsx` selbst, keine Änderungen an Übersetzungen, SEO oder anderen Sektionen.
