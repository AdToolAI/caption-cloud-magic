import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Cloud, CloudOff, HardDrive, RefreshCw, Loader2, FolderOpen, Check } from "lucide-react";
import { useCloudStorage, type CloudConnection } from "@/hooks/useCloudStorage";
import { motion } from "framer-motion";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const CloudStorageConnect = () => {
  const {
    connection,
    loading,
    syncing,
    connectGoogleDrive,
    disconnect,
    toggleAutoSync,
    listCloudFiles,
  } = useCloudStorage();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <Card className="backdrop-blur-xl bg-card/60 border-white/10">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!connection) {
    return (
      <Card className="backdrop-blur-xl bg-card/60 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Cloud-Speicher verbinden
          </CardTitle>
          <CardDescription>
            Erweitere deinen Speicher, indem du Google Drive als externen Speicher anbindest.
            Verschiebe ältere oder große Dateien dorthin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 rounded-xl bg-muted/20 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-green-500/20 flex items-center justify-center">
                  <svg viewBox="0 0 87.3 78" className="w-5 h-5">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                    <path d="M43.65 25.15L29.9 1.35C28.55 2.15 27.4 3.25 26.6 4.65L1.2 48.65c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00AC47"/>
                    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l6.85 11.7z" fill="#EA4335"/>
                    <path d="M43.65 25.15L57.4 1.35C56.05.55 54.5 0 52.9 0H34.4c-1.6 0-3.15.55-4.5 1.35z" fill="#00832D"/>
                    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2H69.05c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
                    <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25.15 59.8 53h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Google Drive</p>
                  <p className="text-xs text-muted-foreground">Verbinde deinen Google Drive Account</p>
                </div>
              </div>
              <Button onClick={connectGoogleDrive} className="gap-2">
                <Cloud className="h-4 w-4" />
                Verbinden
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              ⓘ Es wird ein Ordner "AdTool Media" in deinem Google Drive erstellt. Nur Dateien in diesem Ordner werden verwaltet.
            </p>
          </motion.div>
        </CardContent>
      </Card>
    );
  }

  // Connected state
  const usagePercent = connection.quota_bytes > 0
    ? (connection.used_bytes / connection.quota_bytes) * 100
    : 0;

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Cloud-Speicher
          </CardTitle>
          <Badge variant="outline" className="gap-1 text-green-500 border-green-500/30 bg-green-500/10">
            <Check className="h-3 w-3" />
            Verbunden
          </Badge>
        </div>
        <CardDescription>
          {connection.account_email} · {connection.account_name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Storage Usage */}
        <div className="p-4 rounded-xl bg-muted/20 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Google Drive Speicher</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatBytes(connection.used_bytes)} / {formatBytes(connection.quota_bytes)}
            </span>
          </div>
          <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(usagePercent, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Folder */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span>Ordner: <strong className="text-foreground">{connection.folder_name || 'AdTool Media'}</strong></span>
        </div>

        {/* Auto-Sync Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-white/5">
          <div>
            <Label className="text-sm font-medium">Auto-Sync</Label>
            <p className="text-xs text-muted-foreground">Neue Medien automatisch in die Cloud hochladen</p>
          </div>
          <Switch
            checked={connection.auto_sync}
            onCheckedChange={toggleAutoSync}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={listCloudFiles}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Synchronisieren
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
            Trennen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
