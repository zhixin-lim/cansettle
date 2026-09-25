import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/settle/")({
  beforeLoad: () => {
    throw redirect({ to: "/settle/participants" });
  },
});
