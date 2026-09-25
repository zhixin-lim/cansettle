import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";

export const Route = createFileRoute("/settle/bills")({
  component: () => <Outlet />,
});

export function BillsBreadcrumb() {
  const matches = useMatches();
  return matches.length ? <Link to="/settle/bills">All bills</Link> : null;
}
