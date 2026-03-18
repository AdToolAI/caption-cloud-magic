

# Phase 9b: Anti-Gibberish-Text in KI-Bildern

## Problem

Flux 1.1 Pro generiert haeufig unlesbaren Pseudo-Text in Bildern (z.B. "Wokaha: Dur Duze retaten" auf Dashboards in Szene 3). Die aktuelle Loesung haengt `NO text` ans **Ende** des Prompts -- Flux ignoriert das bei langen Prompts, weil die Aufmerksamkeit auf den Anfang fokussiert ist.

## Ursache

Flux-Modelle haben kein separates `negative_prompt`-Feld. Anti-Text-Anweisungen am Prompt-Ende werden bei langen Prompts abgeschnitten oder ignoriert. Besonders Szenen mit "Dashboard", "screen", "interface" im Prompt triggern Text-Generierung.

## Loesung

Zwei Aenderungen:

### 1. `generate-premium-visual/index.ts` (Zeile ~229)

Anti-Text-Anweisung an den **Anfang** des Prompts verschieben und verstaerken:

```text
// Vorher:
prompt + `. CRITICAL: Generate ONLY visual elements...`

// Nachher:  
`STRICT RULE: This image must contain ZERO text, ZERO letters, ZERO numbers, ZERO words, ZERO writing of any kind. All screens, dashboards, and displays must show ONLY abstract shapes, graphs without labels, and color blocks - never any readable or unreadable text. ` + prompt + `. Avoid: ${NEGATIVE_PROMPT}`
```

### 2. `auto-generate-universal-video/index.ts` (Zeile ~811)

Gleiches Prinzip -- Anti-Text-Prefix vor den eigentlichen Prompt:

```text
const antiTextPrefix = 'ABSOLUTE RULE: Zero text, zero letters, zero numbers in the image. All screens and dashboards show only abstract colorful shapes and graphs without any labels or writing. ';

const prompt = antiTextPrefix + (attempt === 0
  ? `${scene.visualDescription}...`
  : `Abstract professional background...`);
```

## Dateien

| Datei | Aenderung |
|-------|----------|
| `generate-premium-visual/index.ts` | Anti-Text-Anweisung an Prompt-Anfang |
| `auto-generate-universal-video/index.ts` | Anti-Text-Prefix vor Scene-Prompt |

Kein S3-Redeploy noetig -- nur Edge Function Deployment.

