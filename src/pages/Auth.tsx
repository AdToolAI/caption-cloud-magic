import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

const Auth = () => {
  const { t } = useTranslation();
  const { user, signUp, signIn, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      // Check if there's a pending composer import
      const composerImport = localStorage.getItem('composer_import');
      
      if (composerImport) {
        console.log('[Auth] Found composer import, redirecting to /composer');
        navigate('/composer');
      } else {
        navigate('/generator');
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    if (isLogin) {
      await signIn(email, password);
    } else {
      const result = await signUp(email, password);
      
      // Track signup completion
      if (result) {
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
          plan: 'free',
          method: 'email'
        });
      }
    }

    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    const composerImport = localStorage.getItem('composer_import');
    const redirectTo = composerImport ? '/composer' : '/generator';
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-[var(--shadow-xl)] border-0">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto shadow-[var(--shadow-md)]">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                {isLogin ? t('auth_login_title') : t('auth_signup_title')}
              </CardTitle>
              <CardDescription className="text-base">
                {isLogin ? t('auth_welcome_back') : t('auth_welcome_new')}
              </CardDescription>
              <p className="text-sm text-muted-foreground">
                {isLogin ? t('auth_login_description') : t('auth_signup_description')}
              </p>
            </div>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {t('auth_email')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11 rounded-xl shadow-sm"
                />
              </div>

              {/* Password Field with Toggle */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t('auth_password')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={6}
                    className="h-11 rounded-xl shadow-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                    aria-label={showPassword ? t('auth_hide_password') : t('auth_show_password')}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password for Signup */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
                    {t('auth_password_confirm')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                      className="h-11 rounded-xl shadow-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={loading}
                      aria-label={showConfirmPassword ? t('auth_hide_password') : t('auth_show_password')}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Remember Me & Forgot Password (Login only) */}
              {isLogin && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      disabled={loading}
                    />
                    <Label
                      htmlFor="remember"
                      className="text-sm font-normal cursor-pointer select-none"
                    >
                      {t('auth_remember_me')}
                    </Label>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline font-medium"
                    disabled={loading}
                    onClick={() => toast.info(t('auth_forgot_password'), {
                      description: "Password reset functionality coming soon!"
                    })}
                  >
                    {t('auth_forgot_password')}
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full h-12 text-base shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]" 
                size="lg" 
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isLogin ? t('btn_login') : t('btn_signup')}
              </Button>

              {/* Toggle Login/Signup */}
              <div className="text-center pt-2">
                <p className="text-sm text-muted-foreground">
                  {isLogin ? t('auth_no_account') : t('auth_have_account')}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setShowPassword(false);
                      setShowConfirmPassword(false);
                    }}
                    className="text-primary hover:underline font-semibold"
                    disabled={loading}
                  >
                    {isLogin ? t('btn_signup') : t('btn_login')}
                  </button>
                </p>
              </div>
            </CardContent>
          </form>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default Auth;