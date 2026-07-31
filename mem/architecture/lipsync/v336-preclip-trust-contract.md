---
name: v336 Preclip Trust Contract
description: Multi-speaker probe_unavailable is allowed only for constructively verified single-face preclips; full plates and ambiguous crops remain fail-closed
type: feature
---

# v336 — Preclip Trust Contract

Server-rendered preclips do not have a cached JPEG probe because server-side
MP4 extraction is disabled. Their trust must therefore be derived explicitly
from construction evidence, never from a fabricated `preclip_face_count`.

A multi-speaker preclip is constructively trusted only when all are true:

- render succeeded;
- measured face-share meets the active floor (0.24 for N>=2);
- geometry is not suspicious;
- ambiguity risk is clean;
- no sibling face center lies inside the final crop.

If the subsequent face probe is unavailable, a trusted preclip may dispatch
with code `trusted_preclip_without_probe`. An untrusted multi-speaker input or
full plate fails closed with `untrusted_multispeaker_without_probe`. If a real
probe exists and sees zero/multiple faces, the existing hard block remains.

Implementation is centralized in `_shared/preclip-trust.ts`; both
`compose-dialog-segments` and `syncso-face-gate` consume this contract.