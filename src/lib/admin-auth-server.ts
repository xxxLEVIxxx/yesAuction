import { cookies } from "next/headers";
import { COOKIE_NAME, verifyAdminToken } from "@/lib/admin-session";

export async function getAdminSession() {
  const hasPassword = Boolean(process.env.ADMIN_PASSWORD);
  if (!hasPassword) {
    return { ok: false as const, missingPassword: true as const };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const ok = token ? verifyAdminToken(token) : false;
  return { ok, missingPassword: false as const };
}
