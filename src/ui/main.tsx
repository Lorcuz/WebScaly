import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import { attachHelp } from "./help";
import { ConfirmProvider } from "./components";

function Shell({ children }: { children: ReactNode }) {
  useEffect(() => attachHelp(document), []);
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
export function mount(view: ReactNode) {
  createRoot(document.querySelector("#root")!).render(
    <StrictMode>
      <Shell>{view}</Shell>
    </StrictMode>,
  );
}
