import type { Metadata } from "next";
import { getAdminSession } from "@/lib/admin-auth-server";
import { AdminConfigMissing } from "./AdminConfigMissing";
import { AdminLoginPage } from "./AdminLoginPage";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = {
  title: "管理后台 — YES AUCTION",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (session.missingPassword) {
    return <AdminConfigMissing />;
  }

  if (!session.ok) {
    return <AdminLoginPage />;
  }

  return <AdminShell>{children}</AdminShell>;
}
