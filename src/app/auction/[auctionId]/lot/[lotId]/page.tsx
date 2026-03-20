"use client";

import { useParams, usePathname } from "next/navigation";
import { BidLotClient } from "@/components/BidLotClient";

export default function AuctionLotBidPage() {
  const params = useParams();
  const pathname = usePathname();
  const auctionId = typeof params?.auctionId === "string" ? params.auctionId : "";
  const lotId = typeof params?.lotId === "string" ? params.lotId : "";

  if (!auctionId || !lotId) {
    return (
      <main className="page-wrap">
        <p className="error">无效的拍品链接</p>
      </main>
    );
  }

  return (
    <BidLotClient
      resolvedLotId={lotId}
      expectedAuctionId={auctionId}
      initialMinBid={100}
      returnPath={pathname}
      backHref={`/auction/${auctionId}`}
      backLabel="← 拍品目录"
    />
  );
}
