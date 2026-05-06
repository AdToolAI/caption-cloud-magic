Line 215 of `supabase/functions/compose-video-storyboard/index.ts` has the same bug as line 205: unescaped backticks around `cameo` and `lead` inside a template literal, which terminates the string early and breaks the parser.

## Fix

Escape the backticks on line 215 (same pattern as the line 205 fix):

```ts
- 🚨 The character MUST appear within their per-character target range (see "frequency" tag in the list above). For \`cameo\` aim for the LOW end (1–2 scenes only). For \`lead\` aim for the HIGH end. Never return a storyboard where a character is absent from every scene.
```

No other logic changes. After this, the edge function will deploy.