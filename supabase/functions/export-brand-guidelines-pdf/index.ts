// Export Brand Guidelines as a Bond-2028-style PDF.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const GOLD = rgb(0.96, 0.78, 0.41);
const BG = rgb(0.02, 0.03, 0.09);
const LIGHT = rgb(0.92, 0.93, 0.96);
const MUTED = rgb(0.62, 0.66, 0.74);

function hexToColor(hex: string) {
  const m = hex?.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return rgb(0.5, 0.5, 0.5);
  const v = parseInt(m[1], 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "export-brand-guidelines-pdf", url: "https://example.com/mock.pdf" });

  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const userId = JSON.parse(atob(authHeader.replace("Bearer ", "").split(".")[1])).sub;

    const { brandKitId } = await req.json();
    const { data: kit } = await supa.from("brand_kits").select("*").eq("id", brandKitId).eq("user_id", userId).single();
    if (!kit) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });

    const { data: voiceSamples = [] } = await supa.from("brand_voice_samples").select("*").eq("brand_kit_id", brandKitId);

    const pdf = await PDFDocument.create();
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);

    // -------- Cover --------
    const cover = pdf.addPage([595, 842]);
    cover.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: BG });
    cover.drawRectangle({ x: 40, y: 760, width: 60, height: 4, color: GOLD });
    cover.drawText("BRAND GUIDELINES", { x: 40, y: 700, size: 32, font: bold, color: LIGHT });
    cover.drawText(kit.brand_name ?? "Untitled Brand", { x: 40, y: 660, size: 22, font: regular, color: GOLD });
    cover.drawText(`Version ${kit.version ?? 1}  ·  Generated ${new Date().toISOString().slice(0, 10)}`, { x: 40, y: 630, size: 10, font: regular, color: MUTED });

    if (kit.brand_tone) {
      cover.drawText("TONE", { x: 40, y: 560, size: 10, font: bold, color: GOLD });
      cover.drawText(String(kit.brand_tone), { x: 40, y: 545, size: 14, font: regular, color: LIGHT });
    }
    if (kit.target_audience) {
      cover.drawText("AUDIENCE", { x: 40, y: 510, size: 10, font: bold, color: GOLD });
      cover.drawText(String(kit.target_audience).slice(0, 80), { x: 40, y: 495, size: 12, font: regular, color: LIGHT });
    }

    // -------- Colors --------
    const colorPage = pdf.addPage([595, 842]);
    colorPage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: BG });
    colorPage.drawText("COLOR PALETTE", { x: 40, y: 780, size: 18, font: bold, color: GOLD });
    const palette = [
      { label: "Primary", hex: kit.primary_color },
      { label: "Secondary", hex: kit.secondary_color },
      { label: "Accent", hex: kit.accent_color },
      ...((Array.isArray(kit.color_palette) ? kit.color_palette : []) as string[]).slice(0, 5).map((h, i) => ({ label: `Palette ${i + 1}`, hex: h })),
    ].filter((c) => c.hex);

    let y = 720;
    for (const c of palette) {
      colorPage.drawRectangle({ x: 40, y: y - 40, width: 80, height: 50, color: hexToColor(c.hex) });
      colorPage.drawText(c.label, { x: 140, y: y - 5, size: 12, font: bold, color: LIGHT });
      colorPage.drawText(String(c.hex).toUpperCase(), { x: 140, y: y - 22, size: 10, font: regular, color: MUTED });
      y -= 70;
      if (y < 80) break;
    }

    // -------- Voice --------
    const voicePage = pdf.addPage([595, 842]);
    voicePage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: BG });
    voicePage.drawText("BRAND VOICE", { x: 40, y: 780, size: 18, font: bold, color: GOLD });
    let vy = 740;
    const groups: Record<string, string[]> = { do: [], dont: [], tagline: [], banned: [] };
    for (const s of voiceSamples as any[]) (groups[s.kind ?? "do"] ||= []).push(s.text ?? s.sample_text ?? "");
    const labels: Record<string, string> = { do: "DO", dont: "DON'T", tagline: "TAGLINES", banned: "BANNED WORDS" };
    for (const k of ["do", "dont", "tagline", "banned"]) {
      const list = groups[k];
      if (!list?.length) continue;
      voicePage.drawText(labels[k], { x: 40, y: vy, size: 11, font: bold, color: GOLD });
      vy -= 16;
      for (const t of list.slice(0, 6)) {
        voicePage.drawText(`• ${String(t).slice(0, 80)}`, { x: 50, y: vy, size: 10, font: regular, color: LIGHT });
        vy -= 14;
        if (vy < 80) break;
      }
      vy -= 10;
    }

    const bytes = await pdf.save();
    const fileName = `${userId}/${brandKitId}-guidelines-${Date.now()}.pdf`;
    const { error: upErr } = await supa.storage.from("brand-assets").upload(fileName, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw upErr;
    const { data: signed } = await supa.storage.from("brand-assets").createSignedUrl(fileName, 60 * 60 * 24 * 7);

    return new Response(JSON.stringify({ ok: true, url: signed?.signedUrl, path: fileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("export-brand-guidelines-pdf error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
