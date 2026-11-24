/**
 * GET /api/certificates/<id>/qr — the QR code printed on a certificate
 * (ADR 0100): a PNG of the verify URL, `/certificates/<id>`.
 *
 * The Apps Script fetches it while generating each PDF and puts it in place
 * of the template's `{{qr}}` box. It is pure computation from the id — no
 * database read, nothing secret — so it is not rate-limited (one Google
 * server fetches a few hundred in a row) and is cached forever: the same id
 * always draws the same code.
 */
import QRCode from "qrcode";
import { NextRequest } from "next/server";
import {
  isCertificateId,
  normaliseCertificateId,
  verifyUrl,
} from "@/lib/certificates/rules";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = normaliseCertificateId((await params).id);
  if (!isCertificateId(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  const png = await QRCode.toBuffer(verifyUrl(id), {
    type: "png",
    width: 600,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1E1E1E", light: "#FFFFFF" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
