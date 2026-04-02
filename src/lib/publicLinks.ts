/**
 * Public link hub (`/links`) — no auth. Paste URLs here when ready.
 * Leave `href` empty to show “链接待更新” until configured.
 */
export type PublicLinkEntry = {
  id: string;
  label: string;
  /** 副标题（如专场名称） */
  subLabel?: string;
  /** Full URL including https:// — empty = not set yet */
  href: string;
};

export const PUBLIC_LINKS: PublicLinkEntry[] = [
  {
    id: "liveauctioneers-day1",
    label: "LiveAuctioneers",
    subLabel: "瓷器专场",
    href: "https://www.liveauctioneers.com/catalog/410147_legacy-and-provenance-fine-chinese-antiques-1/",
  },
  {
    id: "liveauctioneers-day2",
    label: "LiveAuctioneers",
    subLabel: "书画玉器杂项专场",
    href: "https://www.liveauctioneers.com/catalog/411732_legacy-and-provenance-fine-chinese-antiques-1/",
  },
  {
    id: "sale-room",
    label: "The Sale-room",
    href: "https://www.the-saleroom.com/en-gb/auction-catalogues/meib/catalogue-id-meibao10000",
  },
  {
    id: "artron",
    label: "雅昌拍卖",
    href: "https://m-auction.artron.net/special/PZ2084985?platform=tulu&os=ios",
  },
  {
    id: "epail",
    label: "易拍全球",
    href: "https://www.epailive.com/auctionDetail/55727?sourceConfig=6",
  },
];
