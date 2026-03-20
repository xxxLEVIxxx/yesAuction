import type { Metadata } from "next";
import { AuctionLotsCatalogClient } from "./AuctionLotsCatalogClient";

type Props = { params: Promise<{ auctionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { auctionId } = await params;
  return {
    title: `拍品目录 — YES AUCTION`,
    description: `拍卖场次 ${auctionId} 的拍品与轮次`,
  };
}

export default function AuctionLotsPage() {
  return <AuctionLotsCatalogClient />;
}
