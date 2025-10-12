import { useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { pricingPlans } from "@/config/pricing";
import { Loader2, Crown, Calendar } from "lucide-react";

const Account = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, subscribed, productId, subscriptionEnd } = useAuth();

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

  const planInfo = getProductInfo(productId);
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12 px-4">
        <div className="container max-w-4xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Account Settings</h1>
            <p className="text-muted-foreground">Manage your subscription and preferences</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isPro && <Crown className="h-5 w-5 text-warning" />}
                Current Plan: {planInfo.name}
              </CardTitle>
              <CardDescription>
                {subscribed 
                  ? "You have access to premium features"
                  : "Upgrade to unlock premium features"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              {subscribed ? (
                <>
                  {subscriptionEnd && (
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">Next Billing Date</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(subscriptionEnd).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => navigate('/billing')}
                  >
                    Manage Subscription
                  </Button>
                </>
              ) : (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => navigate('/pricing')}
                >
                  Upgrade to Pro - €{pricingPlans.pro.price}/month
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription Details</CardTitle>
              <CardDescription>
                {subscribed ? `${planInfo.name} Plan - ${planInfo.currency}${planInfo.price}/month` : 'No active subscription'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {subscribed 
                  ? "Manage your subscription and billing details on the Billing page" 
                  : "Upgrade to a paid plan to unlock all features"}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Account;