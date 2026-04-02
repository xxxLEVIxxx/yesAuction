import type { Metadata } from "next";
import { LinksPageContent } from "./LinksPageContent";

export const metadata: Metadata = {
  title: "YES AUCTION — 合作平台链接",
  description: "拍卖场次与 LiveAuctioneers、The Sale-room、雅昌拍卖、易拍全球等外部平台链接",
};

export default function LinksPage() {
  return <LinksPageContent />;
}
