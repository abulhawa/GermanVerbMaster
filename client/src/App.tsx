import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { LocaleProvider } from "@/locales";
import { ThemeProvider } from "next-themes";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import AdminEnrichmentPage from "@/pages/admin-enrichment";

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          <AdminEnrichmentPage />
          <Toaster />
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;

