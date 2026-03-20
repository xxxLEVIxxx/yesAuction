import type { Metadata } from "next";
import { AuctionRoundsAdminClient } from "./AuctionRoundsAdminClient";

export const metadata: Metadata = {
  title: "轮次管理 — 管理后台",
  description: "管理拍卖轮次（Day 1 / Day 2 等）",
};

export default function AdminAuctionRoundsPage() {
  return <AuctionRoundsAdminClient />;
}
