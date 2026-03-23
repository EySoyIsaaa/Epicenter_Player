import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./hooks/useLanguage";
import { SplashScreen } from "./components/SplashScreen";
import Home from "./pages/Home";
import { appLogoUrl } from "@/lib/assetUrls";

const NotFound = lazy(() => import("@/pages/NotFound"));
const HowToUse = lazy(() => import("@/pages/HowToUse"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/how-to-use"} component={HowToUse} />
        <Route path={"/privacy"} component={PrivacyPolicy} />
        <Route path={"/terms"} component={TermsOfService} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  useEffect(() => {
    const ensureLink = (rel: string) => {
      let link = document.head.querySelector<HTMLLinkElement>(
        `link[rel="${rel}"]`,
      );
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = appLogoUrl;
      link.type = "image/svg+xml";
    };

    ensureLink("icon");
    ensureLink("apple-touch-icon");
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            {showSplash && (
              <SplashScreen onFinish={handleSplashFinish} duration={2200} />
            )}
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
