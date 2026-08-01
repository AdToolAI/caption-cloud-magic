import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveReplicateCredential } from "./mouth-motion-verdict.ts";

Deno.test("resolveReplicateCredential prefers REPLICATE_API_KEY", () => {
  const values: Record<string, string> = {
    REPLICATE_API_KEY: "primary-key",
    REPLICATE_API_TOKEN: "legacy-token",
  };
  assertEquals(resolveReplicateCredential((name) => values[name]), "primary-key");
});

Deno.test("resolveReplicateCredential supports legacy token alias", () => {
  const values: Record<string, string> = { REPLICATE_API_TOKEN: "legacy-token" };
  assertEquals(resolveReplicateCredential((name) => values[name]), "legacy-token");
});

Deno.test("resolveReplicateCredential returns null without either secret", () => {
  assertEquals(resolveReplicateCredential(() => undefined), null);
});