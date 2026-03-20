import type { Metadata } from "next";
import { LotsAdminClient } from "./LotsAdminClient";

export const metadata: Metadata = {
  title: "拍品与场次 — 管理后台",
  description: "维护拍品目录并关联拍卖场次",
};

export default function AdminLotsPage() {
  return <LotsAdminClient />;
}
