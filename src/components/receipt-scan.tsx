import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export type ScannedReceipt = {
  merchant: string;
  items: { name: string; qty: number; unitPriceCents: number }[];
  serviceChargeCents: number;
  gstCents: number;
  totalCents: number;
};

/** Shrink the photo in the browser so only a modest JPEG leaves the device. */
async function toJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ReceiptScan({
  hasExisting,
  onScanned,
}: {
  hasExisting: boolean;
  onScanned: (r: ScannedReceipt) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose a photo (JPG or PNG).");
      return;
    }
    if (hasExisting && !window.confirm("Replace the items already on this bill with the scanned ones?"))
      return;
    setBusy(true);
    try {
      const image = await toJpegDataUrl(file);
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ScannedReceipt & { error?: string })
        | null;
      if (!res.ok || !data || data.error) {
        setError(data?.error ?? "Receipt reading failed. Please type it in instead.");
      } else if (data.items.length === 0) {
        setError("Couldn't find any items on that photo. Try a clearer shot, or type it in.");
      } else {
        onScanned(data);
      }
    } catch {
      setError("Couldn't read that photo. Try another, or type it in.");
    } finally {
      setBusy(false);
      setConsent(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-sm border border-dashed border-paper-line p-3">
      <label className="flex items-start gap-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-[var(--color-rule)]"
        />
        <span>
          To read a receipt, the photo is sent off this device to Lovable AI. It isn&apos;t
          kept, and nothing else from your settlement is sent.
        </span>
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={!consent || busy}
        onClick={() => fileRef.current?.click()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-input px-3 py-2 text-sm transition-colors hover:border-rule disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the receipt…
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" /> Scan a receipt photo
          </>
        )}
      </button>
      {error ? <p className="mt-2 text-xs text-stamp">{error}</p> : null}
    </div>
  );
}
