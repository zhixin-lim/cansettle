import { createContext } from "react";

import type { Session } from "./settlement/types";
import type { SessionAction } from "./session-store";

export type SessionContextValue = {
  session: Session;
  dispatch: (action: SessionAction) => void;
  hydrated: boolean;
};

// Keep context identity independent of hot-updated provider/reducer code.
export const SessionContext = createContext<SessionContextValue | null>(null);