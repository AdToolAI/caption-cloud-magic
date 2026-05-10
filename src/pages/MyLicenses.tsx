import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileBadge2,
  Download,
  ExternalLink,
  Search,
  Loader2,
  ShieldOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CertRow {
  id: string;
  certificate_number: string;
  asset_title: string;
  asset_type: string;
  source_provider: string;
  provider_license_name: string;
  license_tier: string;
  verify_token: string;
  pdf_storage_path: string | null;
  issued_at: string;
  revoked_at: string | null;
}

export default function MyLicenses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("license_certificates")
        .select(
          "id,certificate_number,asset_title,asset_type,source_provider,provider_license_name,license_tier,verify_token,pdf_storage_path,issued_at,revoked_at",
        )
        .order("issued_at", { ascending: false });
      if (!error && data) setRows(data as CertRow[]);
      setLoading(false);
    })();
  }, [user]);

  const visible = rows.filter((r) =>
    !filter
      ? true
      : r.asset_title.toLowerCase().includes(filter.toLowerCase()) ||
        r.certificate_number.toLowerCase().includes(filter.toLowerCase()) ||
        r.source_provider.toLowerCase().includes(filter.toLowerCase()),
  );

  async function downloadPdf(row: CertRow) {
    if (!row.pdf_storage_path) {
      toast({ title: "PDF not available", variant: "destructive" });
      return;
    }
    const { data } = await supabase.storage
      .from("license-certificates")
      .createSignedUrl(row.pdf_storage_path, 60 * 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function revoke(row: CertRow) {
    if (!confirm(`Revoke certificate #${row.certificate_number}? This cannot be undone.`))
      return;
    const { error } = await supabase
      .from("license_certificates")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows((p) =>
      p.map((r) => (r.id === row.id ? { ...r, revoked_at: new Date().toISOString() } : r)),
    );
    toast({ title: "Certificate revoked" });
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <FileBadge2 className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">My Licenses</h1>
          <p className="text-sm text-muted-foreground">
            All license certificates issued for your assets.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search title, certificate # or provider…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileBadge2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No license certificates yet. They'll appear here as you create or save assets.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <Card
              key={row.id}
              className="p-4 flex flex-col md:flex-row md:items-center gap-4 bg-card/60"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-primary">
                    #{row.certificate_number}
                  </span>
                  <Badge variant="outline">{row.asset_type}</Badge>
                  <Badge>{row.license_tier}</Badge>
                  {row.revoked_at && (
                    <Badge variant="destructive">Revoked</Badge>
                  )}
                </div>
                <div className="font-medium truncate mt-1">{row.asset_title}</div>
                <div className="text-xs text-muted-foreground">
                  {row.source_provider} · {row.provider_license_name} ·{" "}
                  {new Date(row.issued_at).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <Link to={`/verify/${row.verify_token}`} target="_blank">
                    <ExternalLink className="w-4 h-4 mr-1" /> Verify
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadPdf(row)}
                  disabled={!row.pdf_storage_path}
                >
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
                {!row.revoked_at && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(row)}
                    className="text-destructive hover:text-destructive"
                  >
                    <ShieldOff className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
