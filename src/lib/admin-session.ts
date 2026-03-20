import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "yesauction_admin";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  const s = (process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "").trim();
  return s;
}

export function createAdminToken(): string {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = JSON.stringify({ exp });
  const secret = getSecret();
  if (!secret) return "";
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

export function verifyAdminToken(token: string): boolean {
  const secret = getSecret();
  if (!secret || !token) return false;
  try {
    const raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      payload: string;
      sig: string;
    };
    const expectedHex = createHmac("sha256", secret).update(raw.payload).digest("hex");
    if (typeof raw.sig !== "string" || raw.sig.length !== expectedHex.length) return false;
    if (!timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(raw.sig, "hex"))) return false;
    const { exp } = JSON.parse(raw.payload) as { exp: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
