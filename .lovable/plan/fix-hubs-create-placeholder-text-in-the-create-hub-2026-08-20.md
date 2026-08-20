# Fix "hubs.create" placeholder text in the Create hub

The Create hub shows the raw text `hubs.create` and `create hubDesc` instead of the real title and description. This is a leftover from the English-localization pass: the two translation *keys* for this hub were accidentally converted into translated *text*, so the app now prints the key names as literal labels.

## What will change

In the hub configuration, restore the Create hub to use its translation keys again:

- Title: `hubs.erstellen`
- Description: `hubDesc.erstellen`

Both keys already exist in all three languages:

- EN: "Create" / "Create videos, audio, and visual media content"
- DE: "Erstellen" / "Erstelle Videos, Audio und visuelle Medieninhalte"
- ES: "Crear" / "Crea videos, audio y contenido multimedia visual"

No other hub is affected — all other hubs already reference their keys correctly.

## Technical detail

`src/config/hubConfig.ts` lines 146-147: replace the `tx({...})` wrappers with the plain key strings `"hubs.erstellen"` and `"hubDesc.erstellen"`, matching the other hub definitions.

## Verification

- Open the Create hub in the preview in EN and confirm the header reads "Create" with the English description.
- Switch to DE and ES and confirm the localized title/description render.
