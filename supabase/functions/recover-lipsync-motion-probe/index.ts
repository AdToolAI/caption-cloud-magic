import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const SCENE_ID = "69d56a49-8f59-42ab-ab06-8868f0b42db1";
const measurements = [
  { idx: 0, jobId: "fdb70a4a-4f03-4e5d-8183-2b7365fa2d56", yavg: 925.5969848632812 },
  { idx: 1, jobId: "78d31fa6-6a13-4efc-8f05-3016969967d2", yavg: 790.22607421875 },
  { idx: 2, jobId: "d56f8442-545b-4248-9dec-d5a9e51787e3", yavg: 2030.457275390625 },
  { idx: 3, jobId: "2f051102-9515-4853-8426-e99f85c91863", yavg: 890.8831176757812 },
];

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  const now = new Date().toISOString();

  for (const measurement of measurements) {
    const { error } = await admin.rpc("update_dialog_pass_slot", {
      _scene_id: SCENE_ID,
      _pass_idx: measurement.idx,
      _patch: {
        status: "done",
        motion_probe_status: "passed",
        motion_probe_job_id: measurement.jobId,
        motion_probe_passed_at: now,
        yavg_probed_at: now,
        yavg_value: measurement.yavg,
        yavg_method: "ffmpeg-mouth-band-v339-recovery",
      },
    });
    if (error) return Response.json({ error: error.message, idx: measurement.idx }, { status: 500 });
  }

  await admin.from("composer_scenes").update({
    lip_sync_status: "running",
    twoshot_stage: "motion_probe_passed_4_of_4",
    clip_error: null,
    updated_at: now,
  }).eq("id", SCENE_ID);

  const response = await fetch(`${url}/functions/v1/lipsync-watchdog`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: "{}",
  });
  const watchdog = await response.json().catch(() => null);
  return Response.json({ ok: response.ok, watchdog }, { status: response.ok ? 200 : 502 });
});