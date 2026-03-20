"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { AuctionCatalogSection } from "./AuctionCatalogSection";

export function AuctionHome() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  /** 首页需登录：未登录用户去登记页（Firebase 在客户端恢复会话后再判断，避免误跳）。 */
  useEffect(() => {
    if (loading) return;
    if (user) return;
    router.replace(`/register?return=${encodeURIComponent("/")}`);
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    /** True once we know auth + card state (or gave up safely). Prevents infinite "加载中" on Safari. */
    let completed = false;

    const RTDB_TIMEOUT_MS = 20000;

    let authFailsafeTimer: ReturnType<typeof setTimeout> | null = null;

    function markComplete() {
      if (cancelled || completed) return;
      completed = true;
      if (authFailsafeTimer) {
        clearTimeout(authFailsafeTimer);
        authFailsafeTimer = null;
      }
      setLoading(false);
    }

    async function loadCardBound(uid: string) {
      try {
        const snap = await Promise.race([
          get(ref(db, `users/${uid}/cardBound`)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), RTDB_TIMEOUT_MS),
          ),
        ]);
        if (!cancelled) setHasCard(snap.val() === true);
      } catch {
        if (!cancelled) setHasCard(false);
      } finally {
        markComplete();
      }
    }

    // Backup: if anything above still hasn't called markComplete (rare mobile / LAN issues).
    authFailsafeTimer = setTimeout(async () => {
      if (cancelled || completed) return;
      try {
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>((r) => setTimeout(r, 4000)),
        ]);
      } catch {
        /* ignore */
      }
      if (cancelled || completed) return;

      const cu = auth.currentUser;
      setUser(cu);
      if (!cu) {
        setHasCard(null);
        markComplete();
        return;
      }
      await loadCardBound(cu.uid);
    }, 10000);

    (async () => {
      try {
        await Promise.race([
          auth.authStateReady(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("auth-ready-timeout")), 12000),
          ),
        ]);
      } catch (e) {
        if (!cancelled && e instanceof Error && e.message === "auth-ready-timeout") {
          // Don't block UI forever; onAuthStateChanged may still arrive (Safari IndexedDB).
          setAuthError(
            (prev) =>
              prev ??
              "网络较慢，认证仍在后台加载。若长时间无响应，请下拉刷新或检查网络。",
          );
          markComplete();
        } else if (!cancelled) {
          setAuthError(
            e instanceof Error ? e.message : "Firebase 初始化失败，请检查 API Key、Authorized domains 与网络。",
          );
          markComplete();
        }
        return;
      }
      if (cancelled) return;

      // Critical on mobile (Safari/Chrome on LAN): onAuthStateChanged can be delayed after
      // authStateReady. Sync from currentUser so we never stay on「加载中」waiting only for the observer.
      const cu = auth.currentUser;
      setUser(cu);
      if (!cu) {
        setHasCard(null);
        markComplete();
        return;
      }
      await loadCardBound(cu.uid);
    })();

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (authFailsafeTimer) {
        clearTimeout(authFailsafeTimer);
        authFailsafeTimer = null;
      }
      setAuthError(null);
      setUser(u);
      if (!u) {
        setHasCard(null);
        markComplete();
        return;
      }
      await loadCardBound(u.uid);
    });

    return () => {
      cancelled = true;
      if (authFailsafeTimer) clearTimeout(authFailsafeTimer);
      unsub();
    };
  }, []);

  if (loading) {
    return (
      <>
        <header className="header">
          <a href="https://theyesauction.com" className="back-link">
            ← YES AUCTION
          </a>
          <div className="logo">
            YES <em>AUCTION</em>
          </div>
          <div className="header-spacer" aria-hidden />
        </header>
        <main className="wrap auction-home">
          <p className="admin-muted" style={{ textAlign: "center", marginTop: 40 }}>
            加载中…
          </p>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <header className="header">
          <a href="https://theyesauction.com" className="back-link">
            ← YES AUCTION
          </a>
          <div className="logo">
            YES <em>AUCTION</em>
          </div>
          <div className="header-spacer" aria-hidden />
        </header>
        <main className="wrap auction-home">
          {authError ? <div className="error" style={{ marginBottom: 12 }}>{authError}</div> : null}
          <p className="admin-muted" style={{ textAlign: "center", marginTop: 40 }}>
            正在跳转至登录 / 登记…
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <a href="https://theyesauction.com" className="back-link">
          ← YES AUCTION
        </a>
        <div className="logo">
          YES <em>AUCTION</em>
        </div>
        <button type="button" className="logout-btn" onClick={() => signOut(auth)}>
          登出
        </button>
      </header>

      <main className="wrap auction-home">
        <div className="auction-hero">
          <p className="auction-hero-tag">LIVE AUCTION</p>
          <h1 className="auction-hero-title">YES AUCTION</h1>
          <p className="auction-hero-sub">现场拍卖 · 预出价 · 安全登记</p>
        </div>

        <AuctionCatalogSection user={user} authLoading={false} />

        <section className="auction-card">
          {authError ? <div className="error" style={{ marginBottom: 12 }}>{authError}</div> : null}
          {!hasCard ? (
            <>
              <p className="auction-card-text">
                您好，<strong>{user.displayName || user.email}</strong>
                <br />
                尚未完成信用卡登记，请继续完成登记后即可预出价。
              </p>
              <div className="auction-actions">
                <Link href={`/register?return=${encodeURIComponent("/")}&uid=${user.uid}`} className="btn">
                  完成登记
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="auction-card-text">
                欢迎回来，<strong>{user.displayName || user.email}</strong>
                <br />
                您已登记，可直接设置预出价或观看直播。
              </p>
              <div className="auction-actions">
                <button type="button" className="btn-outline" onClick={() => auth.signOut()}>
                  切换账户
                </button>
              </div>
            </>
          )}
        </section>

        <p className="auction-footnote">本站首页为拍卖入口；登记与预出价功能见上方按钮。</p>
      </main>
    </>
  );
}
