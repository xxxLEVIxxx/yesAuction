import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_LINKS } from "@/lib/publicLinks";

export const metadata: Metadata = {
  title: "YES AUCTION — 合作平台链接",
  description: "LiveAuctioneers、The Sale-room、雅昌拍卖、易拍全球等外部平台链接",
};

function normalizeHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export default function LinksPage() {
  return (
    <>
      <header className="header">
        <Link href="/" className="back-link">
          ← 拍卖首页
        </Link>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <div className="header-spacer" aria-hidden />
      </header>

      <main className="wrap links-hub">
        <div className="links-hub-intro">
          <h1 className="links-hub-title">合作拍卖平台</h1>
          <p className="sec-sub links-hub-sub">
            以下为 YES AUCTION 在各合作平台的入口，点击即可在新窗口打开（无需登录本站）。
          </p>
        </div>

        <ul className="links-hub-list" role="list">
          {PUBLIC_LINKS.map((item) => {
            const href = normalizeHref(item.href);
            const ready = href.length > 0;
            return (
              <li key={item.id} className="links-hub-item">
                {ready ? (
                  <a
                    className="links-hub-btn"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="links-hub-btn-label">{item.label}</span>
                    <span className="links-hub-btn-arrow" aria-hidden>
                      ↗
                    </span>
                  </a>
                ) : (
                  <div className="links-hub-btn links-hub-btn--pending">
                    <span className="links-hub-btn-label">{item.label}</span>
                    <span className="links-hub-btn-pending">链接待更新</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="sec-sub links-hub-footnote">
          链接由本站维护；若某平台暂未配置，请稍后再试或联系 info@theyesauction.com。
        </p>
      </main>
    </>
  );
}
