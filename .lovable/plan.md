

## Fix: KI Picture Studio translations showing raw keys in English UI

### Root Cause
The English `picStudio` translations (lines 15333–15526) were accidentally placed **inside** the `Object.assign(translations.es, {...})` block (which starts at line 15291 for ES `vidTrans`). This means:
- The EN locale has **no** `picStudio` namespace → raw keys like `picStudio.pageTitle` are displayed
- The ES locale gets the **English** picStudio values (overwriting its own Spanish ones at line 15578)

### Fix (1 file: `src/lib/translations.ts`)
1. **Close** the ES `Object.assign` block **before** the EN `picStudio` block — add `});` after line 15332 (end of ES `vidTrans`)
2. **Open** a new `Object.assign(translations.en, {` before the `picStudio:` block at line 15333
3. **Close** it with `});` after line 15526 (end of the EN `picStudio` block)

This is a structural bracket fix — no translation content changes needed. The German UI remains untouched.

