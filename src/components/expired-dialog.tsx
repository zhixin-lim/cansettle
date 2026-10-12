import { useNavigate } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/session-store";

/**
 * Shown whenever the settlement on screen has expired (or no longer exists),
 * whether that's noticed on page load, from an old link, or in the middle of
 * a settlement. Deliberately has no way to dismiss it other than starting over.
 */
export function ExpiredDialog() {
  const { expired, actions } = useSession();
  const navigate = useNavigate();

  return (
    <AlertDialog open={expired}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            Alamak, this settlement has expired
          </AlertDialogTitle>
          <AlertDialogDescription>
            We only keep a settlement for 24 hours, so this one has been cleared.
            Start a new one?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              actions.startOver();
              navigate({ to: "/" });
            }}
          >
            Start a new settlement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
