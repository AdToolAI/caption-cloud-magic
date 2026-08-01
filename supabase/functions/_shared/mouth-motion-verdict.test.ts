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
Deno.test("normaliseFrameOutput accepts string, array and FileOutput shapes", () => {
  assertEquals(normaliseFrameOutput("https://cdn/x.jpg"), "https://cdn/x.jpg");
  assertEquals(normaliseFrameOutput(["https://cdn/a.jpg"]), "https://cdn/a.jpg");
  assertEquals(normaliseFrameOutput({ url: () => "https://cdn/b.jpg" }), "https://cdn/b.jpg");
  assertEquals(normaliseFrameOutput({ url: "https://cdn/c.jpg" }), "https://cdn/c.jpg");
  assertEquals(normaliseFrameOutput(null), null);
  assertEquals(normaliseFrameOutput({ url: "not-a-url" }), null);
});
