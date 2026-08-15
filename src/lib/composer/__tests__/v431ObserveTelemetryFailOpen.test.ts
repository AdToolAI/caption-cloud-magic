/**
 * v431 G3.1d — Observe-Telemetrie ist strikt best effort.
 *
 * Gesichert wird der präzisierte Observe-Vertrag:
 *  1. Observe schreibt genau EINEN append-only Diagnose-Insert über das RPC
 *     `composer_record_callback_observation` — und sonst nichts.
 *  2. Ein Telemetriefehler (RPC-Error ODER Exception) verändert weder Verdikt
 *     noch Rückgabewert; er wird nicht erneut versucht und nie nach außen
 *     geworfen.
 */
import { describe, it, expect, vi } from "vitest";
import { observeCallbackProvenance } from "../../../../supabase/functions/_shared/v431-ledger.ts";

const SCENE = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";

function adminStub(rpc: (name: string, args: any) => any) {
  const job = {
    id: JOB,
    scene_id: SCENE,
    run_id: RUN,
    stage: "base_video",
    plate_generation: 3,
    external_job_id: "ext-1",
    status: "dispatched",
  };
  const scene = { active_run_id: RUN, plate_generation: 3 };
  return {
    rpc: vi.fn(async (name: string, args: any) => rpc(name, args)),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "composer_pipeline_jobs" ? job : scene,
          }),
        }),
      }),
    }),
  } as any;
}

const INPUT = {
  pipelineJobId: JOB,
  sceneId: SCENE,
  stage: "base_video" as const,
  externalJobId: "ext-1",
  reportedRunId: RUN,
  handler: "unit-test",
};

describe("v431 G3.1d — Observe-Telemetrie", () => {
  it("schreibt genau eine Telemetriezeile über das gehärtete RPC", async () => {
    const admin = adminStub(() => ({ data: "obs-1", error: null }));
    const res = await observeCallbackProvenance(admin, INPUT);

    expect(res.verdict).toBe("bound");
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = admin.rpc.mock.calls[0];
    expect(name).toBe("composer_record_callback_observation");
    expect(args.p_handler).toBe("unit-test");
    expect(args.p_verdict).toBe("bound");
    expect(args.p_pipeline_job_id).toBe(JOB);
  });

  it("ignoriert einen RPC-Fehler und ändert das Verdikt nicht (kein Retry)", async () => {
    const admin = adminStub(() => ({ data: null, error: { message: "denied" } }));
    const res = await observeCallbackProvenance(admin, INPUT);

    expect(res.verdict).toBe("bound");
    expect(res.jobId).toBe(JOB);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it("ignoriert eine Exception im Telemetriepfad vollständig", async () => {
    const admin = adminStub(() => {
      throw new Error("telemetry down");
    });
    await expect(observeCallbackProvenance(admin, INPUT)).resolves.toMatchObject({
      verdict: "bound",
      ledgerRunId: RUN,
      ledgerPlateGeneration: 3,
    });
  });

  it("mutiert keine Produktionsdaten (nur Telemetrie-RPC)", async () => {
    const admin = adminStub(() => ({ data: "obs-1", error: null }));
    await observeCallbackProvenance(admin, INPUT);
    const rpcNames = admin.rpc.mock.calls.map((c: any[]) => c[0]);
    expect(new Set(rpcNames)).toEqual(new Set(["composer_record_callback_observation"]));
  });
});
