import type { Metadata } from "next";
import { AuctionHome } from "./AuctionHome";

export const metadata: Metadata = {
  title: "YES AUCTION — 拍卖首页",
  description: "YES AUCTION 现场拍卖 · 登录登记 · 预出价",
};

export default function Home() {
  return <AuctionHome />;
}
