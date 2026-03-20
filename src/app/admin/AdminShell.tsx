"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/admin", label: "工作台", icon: "◆" },
  { href: "/admin/auctions", label: "拍卖场次", icon: "◈" },
  { href: "/admin/attendance", label: "参拍审核", icon: "✧" },
  { href: "/admin/lots", label: "拍品与场次", icon: "◇" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  return (
    <div className="admin-erp">
      <aside className="admin-erp-sidebar">
        <div className="admin-erp-brand">
          <span className="admin-erp-brand-title">YES AUCTION</span>
          <span className="admin-erp-brand-sub">管理后台</span>
        </div>
        <nav className="admin-erp-nav">
          {nav.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`admin-erp-nav-item ${active ? "active" : ""}`}>
                <span className="admin-erp-nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="admin-erp-sidebar-foot">
          <button type="button" className="admin-erp-logout" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>
      <div className="admin-erp-main">
        <header className="admin-erp-topbar">
          <span className="admin-erp-breadcrumb">拍卖运营中心</span>
          <a href="https://theyesauction.com" className="admin-erp-site-link">
            打开官网 →
          </a>
        </header>
        <div className="admin-erp-content">{children}</div>
      </div>
    </div>
  );
}
