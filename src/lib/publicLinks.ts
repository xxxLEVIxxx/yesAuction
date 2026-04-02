/**
 * Public link hub (`/links`) — no auth. Paste URLs here when ready.
 * Leave `href` empty to show “链接待更新” until configured.
 */
export type PublicLinkEntry = {
  id: string;
  label: string;
  /** Full URL including https:// — empty = not set yet */
  href: string;
};

export const PUBLIC_LINKS: PublicLinkEntry[] = [
  { id: "liveauctioneers", label: "LiveAuctioneers", href: "" },
  { id: "sale-room", label: "The Sale-room", href: "" },
  { id: "artron", label: "雅昌拍卖", href: "" },
  { id: "epail", label: "易拍全球", href: "" },
];
