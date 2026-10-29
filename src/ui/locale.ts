import { createContext, useContext } from "react";
import { type Locale } from "../shared/i18n";
export const LocaleContext = createContext<Locale>("en");
export const useLocale = () => useContext(LocaleContext);
