/**
 * Public pre-bid page for a catalog lot: `/auction/{auctionId}/lot/{lotId}`.
 * `lotId` is the Firebase RTDB key under `auctions/lots/{lotId}`.
 */
export function lotBidPath(auctionId: string, lotId: string): string {
  const a = encodeURIComponent(auctionId);
  const l = encodeURIComponent(lotId);
  return `/auction/${a}/lot/${l}`;
}

export function lotBidUrl(baseUrl: string, auctionId: string, lotId: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${lotBidPath(auctionId, lotId)}`;
}
