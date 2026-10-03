import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";

import { DashedRule, Paper, PaperTitle } from "@/components/receipt";
import { useSession } from "@/lib/session-store";

export const Route = createFileRoute("/settle/participants")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Who's splitting this? — Settle This Makan" },
      {
        name: "description",
        content:
          "Add everyone who needs to be included in the final split, including yourself.",
      },
      { property: "og:title", content: "Who's splitting this?" },
      {
        property: "og:description",
        content: "Add everyone taking part in this outing before you add the bills.",
      },
    ],
  }),
  component: ParticipantsPage,
});

function ParticipantsPage() {
  const { session, dispatch, hydrated } = useSession();
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const duplicate = session.participants.some(
    (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );

  const add = () => {
    if (!trimmed || duplicate) return;
    dispatch({ type: "addParticipant", name: trimmed });
    setName("");
  };

  return (
    <Paper>
      <PaperTitle subtitle="Add everyone who needs to be included in the final split — including yourself.">
        Who&apos;s splitting this?
      </PaperTitle>

      <DashedRule className="mt-6" />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="One name at a time"
          aria-label="Participant name"
          className="min-w-0 flex-1 rounded-sm border border-input bg-transparent px-3 py-2 text-sm outline-hidden focus:border-rule focus:ring-1 focus:ring-rule"
        />
        <button
          type="submit"
          className="shrink-0 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          disabled={!trimmed || duplicate}
        >
          Add
        </button>
      </form>

      {duplicate ? (
        <p className="mt-2 text-xs text-stamp">
          That name is already in the list — add a short form or initial to tell
          them apart.
        </p>
      ) : null}

      <DashedRule />

      {!hydrated ? null : session.participants.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          Nobody added yet. Start with yourself, so you don&apos;t get left out of
          the split.
        </p>
      ) : (
        <>
        <p className="mb-2 text-xs text-ink-soft">
          Add a PayNow number for anyone who might be paid back — it goes into the
          message you copy at the end. Optional, and it stays on this device.
        </p>
        <ul className="divide-y divide-dashed divide-paper-line">
          {session.participants.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="tabular w-6 shrink-0 text-xs text-ink-soft">
                {String(i + 1).padStart(2, "0")}
              </span>
              <input
                value={p.name}
                onChange={(e) =>
                  dispatch({
                    type: "renameParticipant",
                    id: p.id,
                    name: e.target.value,
                  })
                }
                aria-label={`Name of participant ${i + 1}`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-hidden"
              />
              <input
                value={p.phone ?? ""}
                onChange={(e) =>
                  dispatch({ type: "setParticipantPhone", id: p.id, phone: e.target.value })
                }
                inputMode="tel"
                placeholder="PayNow no. (optional)"
                aria-label={`PayNow number for ${p.name} (optional)`}
                className="tabular w-40 shrink-0 rounded-sm border border-input bg-transparent px-2 py-1 text-xs outline-hidden focus:border-rule"
              />

              <button
                onClick={() => dispatch({ type: "removeParticipant", id: p.id })}
                aria-label={`Remove ${p.name}`}
                className="shrink-0 rounded-sm p-1 text-ink-soft transition-colors hover:text-stamp"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      <DashedRule />

      {session.participants.length === 1 ? (
        <p className="mb-3 text-center text-xs text-stamp">
          Only one person so far — add the rest of the table.
        </p>
      ) : null}

      <Link
        to="/settle/bills"
        disabled={session.participants.length < 2}
        className="flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-transform hover:-translate-y-0.5 aria-disabled:pointer-events-none aria-disabled:opacity-40"
      >
        Next — add a bill
      </Link>
    </Paper>
  );
}
