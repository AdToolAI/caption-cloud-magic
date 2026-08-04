---
name: Founders Circle UI & Anonymitäts-Vertrag
description: Eigene Gold-UI für aktive Gründer (data-founder Layer, Crest, Status-Karte) und das absolute Verbot, Platznummer/Position/Rang/Beitrittsdatum eines Gründers anzuzeigen
type: feature
---

# Founders Circle

## Anonymitäts-Vertrag (unverhandelbar)
In keiner Oberfläche darf sichtbar werden, **welcher** der 1.000 Gründer ein User ist.
Verboten: Platznummer, Position, Rang, Reihenfolge, exaktes Beitrittsdatum (`claimed_at`).
Erlaubt: nur die **Restlaufzeit** des Vorteils, berechnet aus `expires_at`.

Deshalb wird `FoundersSlotBadge` (Zähler "noch X von 1.000 frei") für aktive Gründer
ausgeblendet — Zählerstand + eigener Beitrittszeitpunkt würden die Position verraten.
Datenseitig ist es bereits sauber: `founders_signups` speichert keine Nummer, RLS erlaubt
nur `auth.uid() = user_id` (kein Listen-Select, keine ableitbare Reihenfolge).

## UI-Layer
- `useFounderStatus` ist die einzige Quelle für den Gründerstatus.
- `FounderExperience` setzt `data-founder="true"` auf `<html>`; der Gold-Layer liegt
  ausschließlich als gescopte Tokens in `index.css` (`[data-founder="true"]`),
  nie als hartkodierte Farbklassen in Komponenten.
- `FounderCrest` (Header), `FounderStatusCard` (Home + `/willkommen`),
  `FounderPriorityChip` — alle im gleichen Gold-Vokabular (primary-Token, kein amber).
- Vorteile in der Karte: 20 % auf Credit-Käufe, Priority-Rendering, voller Studio-Zugang.
