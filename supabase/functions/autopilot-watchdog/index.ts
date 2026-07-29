/**
 * autopilot-watchdog — v297.
 *
 * Der Autopilot produziert lange Filme in einer Background-Task
 * (`EdgeRuntime.waitUntil`). Stirbt der Worker mitten in einer 25-Szenen-
 * Produktion, blieb die Zeile bisher für immer auf `running` stehen. Dieser
 * Watchdog ist die Aufsicht darüber:
 *
 *  1. Produktion `running`, aber seit STALE_MS kein Lebenszeichen → bis zu
 *     MAX_RESUMES automatische Wiederaufnahmen über `autopilot-orchestrate`
 *     im Resume-Modus (fertige Szenen bleiben unangetastet).
 *  2. Alle Szenen fertig, aber der Endschnitt sprang nie an → `autopilot-
 *     finalize` erneut anstoßen.
 *  3. Nach der letzten Wiederaufnahme: sauber als `failed` schließen, mit
 *     einer Begründung, die der Kunde versteht.
 *
 * Läuft alle 3 Minuten per pg_cron.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

/** Ohne Lebenszeichen gilt eine Produktion als tot. Eine Szene braucht max. ~4 min. */
const STALE_MS = 12 * 60_000;
const MAX_RESUMES = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "autopilot-watchdog", ok: true });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const result = { checked: 0, resumed: 0, finalized: 0, failed: 0 };

  try {
    const { data: rows } = await admin
      .from("autopilot_productions")
      .select("id, user_id, stage, status, resume_attempts, heartbeat_at, updated_at, created_at")
      .eq("status", "running")
      .limit(25);

    for (const row of rows ?? []) {
      const last = row.heartbeat_at ?? row.updated_at ?? row.created_at;
      if (last && last > cutoff) continue;
      result.checked++;

      const { data: scenes } = await admin
        .from("autopilot_production_scenes")
        .select("status")
        .eq("production_id", row.id);

      const all = scenes ?? [];
      const open = all.filter((s: Record<string, unknown>) =>
        s.status !== "completed" && s.status !== "failed"
      );
      const usable = all.filter((s: Record<string, unknown>) => s.status === "completed");

      // Fall 2: Szenen stehen, nur der Endschnitt fehlt.
      if (open.length === 0 && usable.length > 0) {
        await invoke("autopilot-finalize", { production_id: row.id, user_id: row.user_id });
        await note(admin, row, "Endschnitt wurde neu angestoßen — die Szenen waren bereits fertig.");
        result.finalized++;
        continue;
      }

      const attempts = Number(row.resume_attempts ?? 0);

      // Fall 1: Wiederaufnahme.
      if (open.length > 0 && attempts < MAX_RESUMES) {
        await admin
          .from("autopilot_productions")
          .update({ resume_attempts: attempts + 1, heartbeat_at: new Date().toISOString() })
          .eq("id", row.id);
        await note(
          admin,
          row,
          `Produktion war stehengeblieben — Wiederaufnahme ${attempts + 1} von ${MAX_RESUMES}, ${open.length} offene Szene(n).`,
          "warn",
        );
        await invoke("autopilot-orchestrate", { production_id: row.id, resume: true });
        result.resumed++;
        continue;
      }

      // Fall 3: aufgeben — aber ehrlich und mit dem, was da ist.
      if (usable.length > 0) {
        await invoke("autopilot-finalize", { production_id: row.id, user_id: row.user_id });
        await admin
          .from("autopilot_productions")
          .update({
            error_message:
              `Nicht alle Szenen konnten produziert werden — der Film wurde aus ${usable.length} fertigen Szenen geschnitten.`,
          })
          .eq("id", row.id);
        await note(
          admin,
          row,
          `Nach ${MAX_RESUMES} Wiederaufnahmen aufgegeben — Endschnitt läuft mit ${usable.length} fertigen Szenen.`,
          "warn",
        );
        result.finalized++;
        continue;
      }

      await admin
        .from("autopilot_productions")
        .update({
          status: "failed",
          stage: "failed",
          progress: 100,
          error_message: "Produktion blieb mehrfach stehen und konnte nicht fortgesetzt werden.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await note(admin, row, "Produktion abgebrochen — mehrfacher Wiederaufnahmeversuch ohne Fortschritt.", "error");
      result.failed++;
    }
  } catch (err) {
    console.error("[autopilot-watchdog] fatal", err);
    return json({ error: err instanceof Error ? err.message : "unknown", ...result }, 500);
  }

  return json({ ok: true, ...result });
});

async function invoke(fn: string, payload: Record<string, unknown>) {
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[autopilot-watchdog] invoke ${fn} failed`, err);
  }
}

async function note(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  message: string,
  severity: "info" | "warn" | "error" = "info",
) {
  await admin.from("autopilot_director_log").insert({
    production_id: row.id,
    user_id: row.user_id,
    stage: "motion",
    role: "producer",
    severity,
    message,
    meta: {},
  });
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
