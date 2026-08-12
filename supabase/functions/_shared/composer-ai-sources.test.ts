import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSupportedComposerAiSource } from "./composer-ai-sources.ts";

Deno.test("Seedance 2.5 is a supported composer source", () => {
  assert(isSupportedComposerAiSource("ai-seedance25"));
});

Deno.test("unknown providers remain unsupported", () => {
  assertFalse(isSupportedComposerAiSource("ai-unknown"));
});