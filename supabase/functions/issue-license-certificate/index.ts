// Issues a license certificate for a given asset.
// Generates a PDF via pdf-lib, uploads to private bucket, returns signed URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import {
  resolveLicenseInfo,
  generateCertificateNumber,
  generateVerifyToken,
  type LicenseTier,
} from '../_shared/license-mapping.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_VERIFY_BASE = Deno.env.get('PUBLIC_VERIFY_BASE') ?? 'https://useadtool.ai/verify';
const BOND_GOLD = rgb(0.96, 0.78, 0.41); // #F5C76A
const BOND_BG = rgb(0.02, 0.03, 0.09);   // #050816
const TEXT_LIGHT = rgb(0.92, 0.93, 0.96);
const TEXT_MUTED = rgb(0.62, 0.66, 0.74);

interface IssueRequest {
  asset_type: string;
  asset_id: string;
  asset_title: string;
  asset_thumbnail_url?: string | null;
  asset_source_url?: string | null;
  source_provider: string;
  license_tier?: LicenseTier;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "issue-license-certificate" });


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const user = userData.user;

    const body = (await req.json()) as IssueRequest;
    if (!body.asset_type || !body.asset_id || !body.asset_title || !body.source_provider) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Idempotency: re-use existing non-revoked certificate for same (user, asset_type, asset_id)
    const { data: existing } = await admin
      .from('license_certificates')
      .select('*')
      .eq('user_id', user.id)
      .eq('asset_type', body.asset_type)
      .eq('asset_id', body.asset_id)
      .is('revoked_at', null)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let cert = existing;

    if (!cert) {
      const info = resolveLicenseInfo(body.source_provider);
      const certNumber = generateCertificateNumber();
      const verifyToken = generateVerifyToken();

      const { data: inserted, error: insertErr } = await admin
        .from('license_certificates')
        .insert({
          user_id: user.id,
          certificate_number: certNumber,
          asset_type: body.asset_type,
          asset_id: body.asset_id,
          asset_title: body.asset_title,
          asset_thumbnail_url: body.asset_thumbnail_url ?? null,
          asset_source_url: body.asset_source_url ?? null,
          source_provider: body.source_provider,
          provider_license_name: info.provider_license_name,
          provider_license_url: info.provider_license_url,
          license_tier: body.license_tier ?? info.default_tier,
          permitted_uses: info.permitted_uses,
          restrictions: info.restrictions,
          attribution_required: info.attribution_required,
          verify_token: verifyToken,
          metadata: body.metadata ?? {},
        })
        .select('*')
        .single();
      if (insertErr) throw insertErr;
      cert = inserted;
    }

    // Profile lookup for licensee name
    const { data: profile } = await admin
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .maybeSingle();

    const licenseeLine = profile?.name
      ? `${profile.name} (${profile.email ?? user.email ?? ''})`
      : (user.email ?? 'Licensee');

    // Generate PDF
    const verifyUrl = `${PUBLIC_VERIFY_BASE}/${cert.verify_token}`;
    const pdfBytes = await buildPdf(cert, licenseeLine, verifyUrl);

    const storagePath = `${user.id}/${cert.certificate_number}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from('license-certificates')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    if (cert.pdf_storage_path !== storagePath) {
      await admin
        .from('license_certificates')
        .update({ pdf_storage_path: storagePath })
        .eq('id', cert.id);
    }

    const { data: signed } = await admin.storage
      .from('license-certificates')
      .createSignedUrl(storagePath, 60 * 60);

    return json({
      certificate_id: cert.id,
      certificate_number: cert.certificate_number,
      pdf_url: signed?.signedUrl,
      verify_url: verifyUrl,
      verify_token: cert.verify_token,
    });
  } catch (err) {
    console.error('[issue-license-certificate]', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function buildPdf(cert: any, licensee: string, verifyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: BOND_BG });

  // Gold top bar
  page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: BOND_GOLD });

  // Header
  page.drawText('LOVABLE', {
    x: 40,
    y: height - 60,
    size: 22,
    font: fontBold,
    color: BOND_GOLD,
  });
  page.drawText('LICENSE CERTIFICATE', {
    x: width - 240,
    y: height - 50,
    size: 14,
    font: fontBold,
    color: TEXT_LIGHT,
  });
  page.drawText(`#${cert.certificate_number}`, {
    x: width - 240,
    y: height - 68,
    size: 11,
    font: fontRegular,
    color: BOND_GOLD,
  });

  // Divider
  page.drawLine({
    start: { x: 40, y: height - 100 },
    end: { x: width - 40, y: height - 100 },
    thickness: 0.5,
    color: BOND_GOLD,
  });

  // Asset block
  let y = height - 140;
  const drawRow = (label: string, value: string, opts?: { gold?: boolean }) => {
    page.drawText(label, { x: 40, y, size: 9, font: fontBold, color: TEXT_MUTED });
    page.drawText(value, {
      x: 160,
      y,
      size: 11,
      font: fontRegular,
      color: opts?.gold ? BOND_GOLD : TEXT_LIGHT,
    });
    y -= 22;
  };

  drawRow('ASSET', truncate(cert.asset_title, 60));
  drawRow('ASSET TYPE', humanType(cert.asset_type));
  drawRow('ASSET ID', cert.asset_id);
  drawRow('SOURCE', cert.source_provider);
  y -= 8;
  drawRow('LICENSEE', truncate(licensee, 60));
  drawRow('ISSUED', new Date(cert.issued_at).toUTCString());
  drawRow('LICENSE TIER', String(cert.license_tier).toUpperCase(), { gold: true });

  // Permitted / Restrictions
  y -= 12;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: BOND_GOLD,
  });
  y -= 22;

  page.drawText('PERMITTED USES', { x: 40, y, size: 10, font: fontBold, color: BOND_GOLD });
  y -= 16;
  for (const use of cert.permitted_uses ?? []) {
    page.drawText(`+  ${use}`, { x: 50, y, size: 10, font: fontRegular, color: TEXT_LIGHT });
    y -= 14;
  }

  y -= 8;
  page.drawText('RESTRICTIONS', { x: 40, y, size: 10, font: fontBold, color: BOND_GOLD });
  y -= 16;
  for (const r of cert.restrictions ?? []) {
    page.drawText(`-  ${r}`, { x: 50, y, size: 10, font: fontRegular, color: TEXT_MUTED });
    y -= 14;
  }

  if (cert.attribution_required) {
    y -= 6;
    page.drawText('Attribution to original creator required.', {
      x: 40,
      y,
      size: 10,
      font: fontItalic,
      color: BOND_GOLD,
    });
    y -= 14;
  }

  // Source license reference
  y -= 14;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: BOND_GOLD,
  });
  y -= 20;
  page.drawText('SOURCE LICENSE', { x: 40, y, size: 9, font: fontBold, color: TEXT_MUTED });
  y -= 14;
  page.drawText(cert.provider_license_name, { x: 40, y, size: 11, font: fontRegular, color: TEXT_LIGHT });
  y -= 14;
  if (cert.provider_license_url) {
    page.drawText(cert.provider_license_url, {
      x: 40,
      y,
      size: 9,
      font: fontRegular,
      color: BOND_GOLD,
    });
    y -= 16;
  }

  // QR code + verify line at bottom
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 256 });
    const qrBytes = base64ToBytes(qrDataUrl.split(',')[1]);
    const qrImg = await pdf.embedPng(qrBytes);
    page.drawImage(qrImg, { x: width - 130, y: 60, width: 90, height: 90 });
  } catch (qrErr) {
    console.warn('[issue-license-certificate] QR failed', qrErr);
  }

  page.drawText('VERIFY AUTHENTICITY', { x: 40, y: 130, size: 9, font: fontBold, color: TEXT_MUTED });
  page.drawText(verifyUrl, { x: 40, y: 114, size: 9, font: fontRegular, color: BOND_GOLD });

  // Footer disclaimer
  page.drawText(
    'This certificate confirms the licensee\'s right to use the asset under the source license.',
    { x: 40, y: 60, size: 8, font: fontItalic, color: TEXT_MUTED },
  );
  page.drawText(
    'Lovable acts as a facilitator and warrants metadata integrity. See source license for full terms.',
    { x: 40, y: 48, size: 8, font: fontItalic, color: TEXT_MUTED },
  );

  return await pdf.save();
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function humanType(t: string): string {
  const map: Record<string, string> = {
    'ai-video': 'AI Video',
    'ai-image': 'AI Image',
    'ai-music': 'AI Music',
    'ai-sfx': 'Sound Effect',
    'stock-video': 'Stock Video',
    'stock-image': 'Stock Image',
    'stock-sfx': 'Stock Sound Effect',
    character: 'Brand Character',
    voiceover: 'Voiceover',
  };
  return map[t] ?? t;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
