import type { Metadata } from "next";
import { AuctionsAdminClient } from "./AuctionsAdminClient";

export const metadata: Metadata = {
  title: "拍卖场次 — 管理后台",
  description: "创建与管理拍卖场次",
};

export default function AdminAuctionsPage() {
  return <AuctionsAdminClient />;
}
