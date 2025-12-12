import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, User, Shield, CreditCard, Settings, Link2, Eye } from "lucide-react";
import { AccountHeroHeader } from "@/components/account/AccountHeroHeader";
import { ProfileTab } from "@/components/account/ProfileTab";
import { SecurityTab } from "@/components/account/SecurityTab";
import { SubscriptionTab } from "@/components/account/SubscriptionTab";
import { AdvancedTab } from "@/components/account/AdvancedTab";
import { ConnectionsTab } from "@/components/account/ConnectionsTab";
import { PrivacyTab } from "@/components/account/PrivacyTab";
import { StorageUsagePanel } from "@/components/settings/StorageUsagePanel";

const Account = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="container max-w-4xl mx-auto">
        <AccountHeroHeader />

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 h-14 bg-card/60 backdrop-blur-xl border border-white/10 p-1 rounded-xl">
            <TabsTrigger 
              value="profile" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profil</span>
            </TabsTrigger>
            <TabsTrigger 
              value="security"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Sicherheit</span>
            </TabsTrigger>
            <TabsTrigger 
              value="connections"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Verbindungen</span>
            </TabsTrigger>
            <TabsTrigger 
              value="privacy"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Datenschutz</span>
            </TabsTrigger>
            <TabsTrigger 
              value="subscription"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Abo</span>
            </TabsTrigger>
            <TabsTrigger 
              value="advanced"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg h-full"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Erweitert</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <ProfileTab />
            <div className="mt-6">
              <StorageUsagePanel />
            </div>
          </TabsContent>

          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>

          <TabsContent value="connections">
            <ConnectionsTab />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyTab />
          </TabsContent>

          <TabsContent value="subscription">
            <SubscriptionTab />
          </TabsContent>

          <TabsContent value="advanced">
            <AdvancedTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Account;
