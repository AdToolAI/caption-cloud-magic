import { FileBadge2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useLicenseCertificate,
  type IssueCertificateInput,
} from "@/hooks/useLicenseCertificate";
import { cn } from "@/lib/utils";

interface LicenseButtonProps extends IssueCertificateInput {
  variant?: "default" | "ghost" | "outline" | "secondary";
  size?: "default" | "sm" | "icon";
  className?: string;
  label?: string;
}

export function LicenseButton({
  variant = "ghost",
  size = "sm",
  className,
  label = "License",
  ...input
}: LicenseButtonProps) {
  const { issueAndDownload, issuing } = useLicenseCertificate();

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      disabled={issuing}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        issueAndDownload(input);
      }}
      title="Download license certificate"
    >
      {issuing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileBadge2 className="w-4 h-4 text-primary" />
      )}
      {size !== "icon" && <span>{label}</span>}
    </Button>
  );
}
