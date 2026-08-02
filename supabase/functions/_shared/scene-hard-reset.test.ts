/**
 * scene-hard-reset.test.ts (v374) — Erstattungsvertrag beim harten Neustart.
 *
 * Regel: Erstattet wird ausschließlich ein offener Provider-Job, den der Reset
 * selbst abbricht. Bereits geliefertes Material wird nie erstattet.
 *
 * Run: deno test supabase/functions/_shared/scene-hard-reset.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideRefund } from "./scene-hard-reset.ts";

Deno.test("v374: offener Sync.so-Job wird erstattet", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 3,
      plate_ready_generation: null,
      clip_url: null,
      dialog_shots: { status: "running", cost_credits: 640 },
    },
    knownJobIds: ["job_1"],
    hasInflightRows: true,
  });
  assertEquals(r.decision, "refunded");
  assertEquals(r.amount, 640);
});

Deno.test("v374: laufender Preflight ohne Job-Id gilt als offen", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 2,
      dialog_shots: { status: "rendering_preflight", cost_credits: 420 },
    },
    knownJobIds: [],
    hasInflightRows: false,
  });
  assertEquals(r.decision, "refunded");
  assertEquals(r.amount, 420);
});

Deno.test("v374: gelieferte Plate der aktuellen Generation wird NICHT erstattet", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 4,
      plate_ready_generation: 4,
      clip_url: "https://cdn/plate.mp4",
      dialog_shots: { status: "failed", cost_credits: 640 },
    },
    knownJobIds: [],
    hasInflightRows: false,
  });
  assertEquals(r.decision, "skipped_delivered");
  assertEquals(r.amount, 0);
});

Deno.test("v374: abgeschlossener Dialog wird NICHT erstattet", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 1,
      dialog_shots: { status: "completed", cost_credits: 500 },
    },
    knownJobIds: ["job_x"],
    hasInflightRows: true,
  });
  assertEquals(r.decision, "skipped_delivered");
});

Deno.test("v374: fertiges Lip-Sync wird NICHT erstattet", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 1,
      lip_sync_applied_at: "2026-08-02T10:00:00Z",
      dialog_shots: { status: "running", cost_credits: 500 },
    },
    knownJobIds: ["job_x"],
    hasInflightRows: true,
  });
  assertEquals(r.decision, "skipped_delivered");
});

Deno.test("v374: bereits erstattet → keine Doppelerstattung", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 2,
      dialog_shots: { status: "failed", cost_credits: 640, refunded: true },
    },
    knownJobIds: ["job_1"],
    hasInflightRows: true,
  });
  assertEquals(r.decision, "skipped_already_refunded");
  assertEquals(r.amount, 0);
});

Deno.test("v374: nichts offen, keine Kosten reserviert → keine Erstattung", () => {
  const r = decideRefund({
    scene: { plate_generation: 1, dialog_shots: null },
    knownJobIds: [],
    hasInflightRows: false,
  });
  assertEquals(r.decision, "nothing_open");
  assertEquals(r.amount, 0);
});

Deno.test("v374: veraltete clip_url einer Vorgeneration blockiert die Erstattung nicht", () => {
  const r = decideRefund({
    scene: {
      plate_generation: 5,
      plate_ready_generation: 4,
      clip_url: "https://cdn/old-plate.mp4",
      dialog_shots: { status: "dispatched", cost_credits: 300 },
    },
    knownJobIds: ["job_9"],
    hasInflightRows: false,
  });
  assertEquals(r.decision, "refunded");
  assertEquals(r.amount, 300);
});

Deno.test("v374: fehlende Szene wird nie erstattet", () => {
  const r = decideRefund({ scene: null, knownJobIds: [], hasInflightRows: false });
  assertEquals(r.decision, "nothing_open");
});
