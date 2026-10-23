import { getLocale, initializeLocale, subscribeLocale } from "../shared/i18n";
import { StrictMode, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import { attachHelp } from "./help";
import { ConfirmProvider } from "./components";
import { LocaleContext } from "./locale";

function Shell({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => attachHelp(document), [locale]);
  return <LocaleContext.Provider value={locale}><ConfirmProvider>{children}</ConfirmProvider></LocaleContext.Provider>;
}
export function mount(view: ReactNode) {
  void initializeLocale().then(() => createRoot(document.querySelector("#root")!).render(
    <StrictMode>
      <Shell>{view}</Shell>
    </StrictMode>,
  ));
}
