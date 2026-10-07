import { createContext } from "react";

import type { Session } from "./settlement/types";
import type { SessionAction } from "./session-store";

export type SessionActions = {
  addParticipant: (name: string) => Promise<void>;
  /** Push the current local name to the backend (call on blur). */
  commitRename: (participantId: string) => Promise<void>;
  removeParticipant: (participantId: string) => Promise<void>;
  setPhone: (participantId: string, phone: string) => void;
  /** Creates a local draft bill and returns its temporary id. */
  newDraftBill: () => string;
  /** Saves a draft/edited bill to the backend; returns the backend bill id. */
  saveBill: (billId: string) => Promise<string>;
  removeBill: (billId: string) => Promise<void>;
  refresh: () => Promise<void>;
  startOver: () => void;
};

export type SessionContextValue = {
  session: Session;
  dispatch: (action: SessionAction) => void;
  hydrated: boolean;
  sessionId: string | null;
  /** Bills with changes not yet saved to the backend. */
  unsavedBillIds: string[];
  actions: SessionActions;
};

// Keep context identity independent of hot-updated provider/reducer code.
export const SessionContext = createContext<SessionContextValue | null>(null);
