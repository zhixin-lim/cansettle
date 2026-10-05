import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const RUN_ID = "X-Lovable-AIG-Run-ID";

const schema = z.object({
  merchant: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number(),
      unitPrice: z.number(),
    }),
  ),
  serviceCharge: z.number().nullable(),
  gst: z.number().nullable(),
  total: z.number().nullable(),
});

export type ScannedReceipt = {
  merchant: string;
  items: { name: string; qty: number; unitPriceCents: number }[];
  serviceChargeCents: number;
  gstCents: number;
  totalCents: number;
};

const toCents = (n: number | null) =>
  n === null || !Number.isFinite(n) || n < 0 ? 0 : Math.round(Number(n.toFixed(2)) * 100);

const PROMPT = `Read this restaurant receipt and extract exactly what is printed.
- merchant: the shop name, or null.
- items: one entry per printed line item. qty = whole quantity (1 if none shown). unitPrice = price for ONE unit in dollars (if only a line total is printed, divide by qty). Skip subtotal/tax/total/payment lines. Include discounts only if they are item lines.
- serviceCharge, gst, total: dollar amounts only if printed on the receipt, otherwise null. Never calculate or guess a charge that isn't printed.
If the image is not a receipt, return an empty items list and nulls.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleScanReceipt(request: Request): Promise<Response> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return json({ error: "Receipt reading isn't set up yet." }, 500);

  let image: string;
  try {
    const body = (await request.json()) as { image?: unknown };
    if (typeof body.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.image))
      return json({ error: "Please upload a JPG, PNG or WEBP photo." }, 400);
    if (body.image.length > 8_000_000) return json({ error: "That photo is too large." }, 400);
    image = body.image;
  } catch {
    return json({ error: "Couldn't read the upload." }, 400);
  }

  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID)?.trim() || undefined;
      return res;
    },
  });

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      maxRetries: 0,
      abortSignal: request.signal,
      output: Output.object({ schema }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image", image: new URL(image) },
          ],
        },
      ],
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const out = await result.output;
    const scanned: ScannedReceipt = {
      merchant: (out.merchant ?? "").trim().slice(0, 60),
      items: out.items
        .map((it) => ({
          name: it.name.trim().slice(0, 60),
          qty: Math.max(1, Math.min(99, Math.round(it.qty) || 1)),
          unitPriceCents: toCents(it.unitPrice),
        }))
        .filter((it) => it.name || it.unitPriceCents > 0)
        .slice(0, 80),
      serviceChargeCents: toCents(out.serviceCharge),
      gstCents: toCents(out.gst),
      totalCents: toCents(out.total),
    };
    return json(scanned);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (NoObjectGeneratedError.isInstance(error))
      return json({ error: "Couldn't make out the receipt. Try a clearer photo, or type it in." }, 422);
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return json({ error: "Too many scans right now — try again in a minute." }, 429);
    if (status === 402 || status === 403)
      return json({ error: "Receipt reading is unavailable right now (AI credits). Please type it in." }, status);
    return json({ error: "Receipt reading failed. Please type it in instead." }, 502);
  }
}
