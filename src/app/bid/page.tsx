"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BidLotClient } from "@/components/BidLotClient";

function BidPageInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lotId = searchParams.get("lotId");
  const minBid = Number(searchParams.get("minBid") || "100");
  const returnPath =
    searchParams.toString() === "" ? pathname : `${pathname}?${searchParams.toString()}`;

  return (
    <BidLotClient
      resolvedLotId={lotId}
      initialMinBid={Number.isFinite(minBid) && minBid > 0 ? minBid : 100}
      returnPath={returnPath}
      backHref="/"
      backLabel="← 拍卖首页"
    />
  );
}

export default function BidPage() {
  return (
    <Suspense fallback={<main className="page-wrap">加载中…</main>}>
      <BidPageInner />
    </Suspense>
  );
}
