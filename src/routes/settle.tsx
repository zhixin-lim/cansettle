import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/session-store";

export const Route = createFileRoute("/settle")({
  component: SettleLayout,
});

const steps = [
  { to: "/settle/participants", label: "People" },
  { to: "/settle/bills", label: "Bills" },
  { to: "/settle/result", label: "Settle" },
] as const;

function SettleLayout() {
  const { dispatch } = useSession();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/"
            className="min-w-0 truncate font-display text-lg tracking-tight text-foreground"
          >
            Settle this makan
          </Link>
          <AlertDialog>
            <AlertDialogTrigger className="shrink-0 rounded-sm border border-foreground/20 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-foreground/5">
              Start over
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  Start over?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear this settlement from this device. Everyone, every
                  bill, every assignment — gone for good.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    dispatch({ type: "reset" });
                    navigate({ to: "/" });
                  }}
                >
                  Clear it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <nav className="mt-5 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em]">
          {steps.map((step, i) => (
            <Link
              key={step.to}
              to={step.to}
              className="rounded-sm px-2 py-1 text-foreground/50 transition-colors hover:text-foreground"
              activeProps={{ className: "bg-foreground/10 text-foreground" }}
              activeOptions={{ exact: false }}
            >
              {i + 1}. {step.label}
            </Link>
          ))}
        </nav>

        <div className="mt-5">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
