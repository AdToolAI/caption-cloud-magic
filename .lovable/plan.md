

## Bugfix: Storyboard-Edge-Function ist defekt → „Image Mode" wird ignoriert

### Symptom
User wählt im Briefing **„KI Bild-Szenen"** (Image-Mode), aber im generierten Storyboard ist trotzdem **„KI (Hailuo)"** als Quelle aktiv.

### Root Cause
`supabase/functions/compose-video-storyboard/index.ts` hat in den Zeilen **335-345** Code-Rest-Müll von einem unsauberen Edit:

```ts
        }),
      });
                },                          // ← Zombie-Code
                required: ["scenes"],       // ← Zombie-Code
                additionalProperties: false,// ← Zombie-Code
              },                            // ← Zombie-Code
            },                              // ← Zombie-Code
          },                                // ← Zombie-Code
        ],                                  // ← Zombie-Code
        tool_choice: {...},                 // ← Zombie-Code
      }),                                   // ← Zombie-Code
    });                                     // ← Zombie-Code
```

Diese 11 Zombie-Zeilen kommen **nach** dem korrekt geschlossenen `fetch(...)`-Call — sie sind syntaktisch valide JS-Object-Literale ohne Bezug, aber sie machen die Function entweder kaputt oder lassen sie auf ein älteres Deployment zurückfallen, das `videoMode` noch nicht kennt. Resultat: die Function liefert `clipSource: 'ai-hailuo'` (Default), egal was der User wählt.

Das ist auch der Grund, warum keine **Effekte** und keine **Mixed/Image-Szenen** im UI erscheinen — die ganze Phase-3-Logik läuft nie durch.

### Fix
**Datei:** `supabase/functions/compose-video-storyboard/index.ts`

**Aktion:** Zeilen **336-345** komplett löschen (die 11 Zombie-Zeilen nach dem ersten `});`-Block in Zeile 335).

Vor dem Fix endet der gültige Code in Zeile 335 mit:
```
        }),
      });
```
Dann muss direkt Zeile 347 (`if (!response.ok) {`) folgen — keine Zwischenzeilen.

### Verifikation nach dem Fix
1. Edge function wird automatisch redeployt
2. Im Briefing **„KI Bild-Szenen"** wählen
3. Storyboard generieren → alle Szenen sollten als **„KI Bild (Gemini)"** markiert sein, nicht als „KI (Hailuo)"
4. Bei **„Mixed Mode"** → erste + letzte Szene = Hailuo, mittlere = Gemini
5. Effekt-Badges (`Wand2`-Icon mit z. B. „GlowOrbs", „LightRays") erscheinen unter jeder Szene

### Risiko & Rollback
- **Risiko: Sehr niedrig.** Reine Code-Bereinigung von toten Zeilen. Keine Schema- oder API-Änderung.
- **Rollback:** Git-Revert der einen Datei.

### Aufwand
~2 Minuten — eine Datei, eine `line_replace`-Operation.

