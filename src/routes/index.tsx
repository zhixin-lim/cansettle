import { createFileRoute, Link } from "@tanstack/react-router";

import { Paper, DashedRule, Row } from "@/components/receipt";
import { useSession } from "@/lib/session-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settle This Makan — split the bill, no drama" },
      {
        name: "description",
        content:
          "Add everyone, add the bills, say who had what. Exact shares, a clear breakdown and a message you can paste into the group chat.",
      },
      { property: "og:title", content: "Settle This Makan" },
      {
        property: "og:description",
        content:
          "Split a one-off group meal down to the cent. Nothing permanent, no accounts, no history.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, hydrated } = useSession();
  const inProgress =
    hydrated && (session.participants.length > 0 || session.bills.length > 0);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Paper className="rotate-[-0.6deg]">
          <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-soft">
            One outing · one settlement
          </p>
          <h1 className="mt-4 text-center font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
            Let&apos;s settle
            <br />
            this makan.
          </h1>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Add everyone, add the bills, say who had what. We do the cents.
          </p>

          <DashedRule className="mt-7" />
          <Row label="Split the bill exactly" amount="✓" muted />
          <Row label="GST + service charge, fairly" amount="✓" muted />
          <Row label="One message for the group chat" amount="✓" muted />
          <DashedRule />

          <Link
            to="/settle/participants"
            className="mt-2 flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-display text-lg text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {inProgress ? "Continue settlement" : "Start a settlement"}
          </Link>

          <p className="mt-6 text-center font-hand text-lg text-stamp">
            No receipt also can.
          </p>
        </Paper>

        <p className="mx-auto mt-6 max-w-xs text-center text-xs leading-relaxed text-foreground/70">
          Nothing permanent — your settlement is kept just long enough to get
          everyone paid back, then it&apos;s gone.
          <br />
          No accounts, no history.
        </p>
      </div>
    </main>
  );
}
