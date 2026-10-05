import { createFileRoute } from "@tanstack/react-router";

import { handleScanReceipt } from "@/lib/receipt-scan.server";

export const Route = createFileRoute("/api/scan-receipt")({
  server: { handlers: { POST: ({ request }) => handleScanReceipt(request) } },
});
