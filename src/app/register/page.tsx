"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { get, ref, runTransaction, set } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import { loadStripe } from "@stripe/stripe-js";
import type { StripeCardElement } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "pk_live_51T8ms5F2iZIFQNdGlpXXGalRT16MQFZf0Qv4XUlWJdVWpmSNZScEv9v26ycstKxNuoKAfPj6eBBXS83XWra6k1fM00oCH658Wc",
);

type PageMode = "login" | "register";

export default function RegisterPage() {
  const router = useRouter();
  const [uidParam, setUidParam] = useState<string | null>(null);
  const [safeReturnUrl, setSafeReturnUrl] = useState("/");

  const [mode, setMode] = useState<PageMode>("login");
  const [stripeCard, setStripeCard] = useState<StripeCardElement | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [err, setErr] = useState("");
  const [successBidderNumber, setSuccessBidderNumber] = useState<number | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regPw, setRegPw] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");
  const [agreed, setAgreed] = useState(false);
  const cardMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setUidParam(p.get("uid"));
    const raw = p.get("return");
    if (!raw) {
      setSafeReturnUrl("/");
      return;
    }
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin !== window.location.origin) {
        setSafeReturnUrl("/");
        return;
      }
      const path = parsed.pathname;
      const allowed = path === "/" || path === "/bid" || path.startsWith("/bid/");
      setSafeReturnUrl(allowed ? `${parsed.pathname}${parsed.search}` : "/");
    } catch {
      setSafeReturnUrl("/");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;
      if (!user) return;

      setCurrentUid(user.uid);
      const hasCardSnap = await get(ref(db, `users/${user.uid}/cardBound`));
      if (hasCardSnap.val() === true) {
        router.replace(safeReturnUrl);
        return;
      }

      setMode("register");
      setEmail(user.email || "");
      setFullName(user.displayName || "");
    });
    return () => {
      mounted = false;
    };
  }, [router, safeReturnUrl]);

  useEffect(() => {
    if (mode !== "register") return;
    if (!cardMountRef.current) return;

    let card: StripeCardElement | null = null;
    let cancelled = false;
    (async () => {
      const stripe = await stripePromise;
      if (!stripe || cancelled || !cardMountRef.current) return;
      const elements = stripe.elements({
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#C9A84C",
            colorBackground: "#FFFFFF",
            colorText: "#2F2516",
          },
        },
      });
      card = elements.create("card");
      card.mount(cardMountRef.current);
      setStripeCard(card);
    })();
    return () => {
      cancelled = true;
      card?.unmount();
      setStripeCard(null);
    };
  }, [mode]);

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setLoginErr("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPw);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "auth/unknown";
      const m: Record<string, string> = {
        "auth/invalid-credential": "邮箱或密码错误",
        "auth/user-not-found": "账户不存在",
        "auth/wrong-password": "密码错误",
      };
      setLoginErr(m[code] || "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!fullName || !email || !phone || !addr1 || !city || !zip) {
      setErr("请填写所有必填字段");
      return;
    }
    if (!currentUid && regPw.length < 6) {
      setErr("密码至少需要6位");
      return;
    }
    if (!agreed) {
      setErr("请阅读并同意条款与条件");
      return;
    }
    if (!stripeCard) {
      setErr("信用卡组件初始化中，请稍后重试");
      return;
    }

    setSubmitting(true);
    try {
      let saveUid = currentUid || uidParam;
      if (!saveUid) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), regPw);
        await updateProfile(cred.user, { displayName: fullName });
        saveUid = cred.user.uid;
        setCurrentUid(saveUid);
      }

      const setupRes = await fetch("/api/create-setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: saveUid, email: email.trim(), name: fullName }),
      });
      const setupData = await setupRes.json();
      if (!setupRes.ok) throw new Error(setupData.error || "无法创建支付意向");

      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe 未加载");
      const result = await stripe.confirmCardSetup(setupData.clientSecret, {
        payment_method: {
          card: stripeCard,
          billing_details: {
            name: fullName,
            email: email.trim(),
            phone,
            address: { line1: addr1, line2: addr2, city, state, postal_code: zip, country },
          },
        },
      });
      if (result.error) throw new Error(result.error.message || "绑卡失败");

      const bidderRef = ref(db, `users/${saveUid}/bidderNumber`);
      const existingBidder = await get(bidderRef);
      let bidderNumber = existingBidder.exists() ? Number(existingBidder.val()) : 0;
      if (!bidderNumber) {
        const tx = await runTransaction(ref(db, "config/nextBidderNumber"), (current) => {
          const assign = current == null ? 1 : Number(current);
          return assign + 1;
        });
        bidderNumber = Number(tx.snapshot.val()) - 1;
        await set(bidderRef, bidderNumber);
      }

      await set(ref(db, `users/${saveUid}/cardBound`), true);
      await set(ref(db, `users/${saveUid}/stripe`), {
        customerId: setupData.customerId,
        paymentMethodId: result.setupIntent?.payment_method || null,
        boundAt: Date.now(),
      });
      await set(ref(db, `users/${saveUid}/shipping`), {
        fullName,
        email: email.trim(),
        phone,
        addr1,
        addr2,
        city,
        state,
        zip,
        country,
        savedAt: Date.now(),
      });

      setSuccessBidderNumber(bidderNumber);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (successBidderNumber) {
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
        <main className="wrap">
          <section className="card" style={{ textAlign: "center", marginTop: 30 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div className="sec-title" style={{ marginTop: 0 }}>
              登记成功！
            </div>
            <p className="sec-sub">
              您的信用卡已成功绑定。<br />
              您的竞拍号：<strong className="gold">#{successBidderNumber}</strong>
            </p>
            <button className="btn" onClick={() => router.replace(safeReturnUrl)}>
              返回继续竞价
            </button>
          </section>
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
        <div className="header-spacer" aria-hidden />
      </header>

      <main className="wrap">
        {mode === "login" ? (
          <section className="card" style={{ marginTop: 24 }}>
            <div className="sec-title">登录账户</div>
            <div className="sec-sub">登录后即可参与竞拍</div>
            <form onSubmit={doLogin} className="stack">
              <input className="input" type="email" placeholder="电子邮件" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <input className="input" type="password" placeholder="密码" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} />
              {loginErr ? <div className="error">{loginErr}</div> : null}
              <button className="btn" disabled={submitting}>
                {submitting ? "登录中…" : "登录"}
              </button>
            </form>
            <button className="btn-link" onClick={() => setMode("register")}>
              没有账户？创建新账户
            </button>
          </section>
        ) : (
          <section className="card" style={{ marginTop: 24 }}>
            <div className="sec-title">竞价登记</div>
            <div className="sec-sub">
              绑定信用卡即可参与竞拍
              <br />
              登记后无需重复填写
            </div>
            <div className="notice">🔒 登记不会扣款。仅在您成功拍得后才会收取费用。</div>
            <form onSubmit={handleSubmit} className="stack">
              <input className="input" placeholder="姓名 Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <input className="input" placeholder="电子邮件 Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="input" placeholder="电话 Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="input" type="password" placeholder="密码 Password（至少6位）" value={regPw} onChange={(e) => setRegPw(e.target.value)} />
              <input className="input" placeholder="街道地址 Street Address" value={addr1} onChange={(e) => setAddr1(e.target.value)} />
              <input className="input" placeholder="单元/套房 Apt / Suite（可选）" value={addr2} onChange={(e) => setAddr2(e.target.value)} />
              <input className="input" placeholder="城市 City" value={city} onChange={(e) => setCity(e.target.value)} />
              <input className="input" placeholder="州 State" value={state} onChange={(e) => setState(e.target.value)} />
              <input className="input" placeholder="邮编 ZIP" value={zip} onChange={(e) => setZip(e.target.value)} />
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="US">United States</option>
                <option value="CN">China / 中国</option>
                <option value="HK">Hong Kong / 香港</option>
                <option value="TW">Taiwan / 台湾</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="SG">Singapore</option>
                <option value="JP">Japan</option>
                <option value="OTHER">Other</option>
              </select>
              <div ref={cardMountRef} className="input" />
              <div className="notice">
                <strong className="gold">付款方式 Payment Options</strong>
                <br />
                💳 刷卡：直接从登记的信用卡或借记卡扣款
                <br />
                📋 其他付款方式：ACH转账、电汇等，请联系 info@theyesauction.com
              </div>
              <label className="check">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                我已阅读并同意条款与条件，并确认我已年满18岁。
              </label>
              {err ? <div className="error">{err}</div> : null}
              <button className="btn" disabled={submitting}>
                {submitting ? "处理中…" : "确认登记并绑定信用卡"}
              </button>
              <div className="sec-sub" style={{ marginBottom: 0 }}>
                🔒 由 Stripe 安全加密处理 · PCI DSS 合规
              </div>
            </form>
            <button className="btn-link" onClick={() => setMode("login")}>
              已有账户？返回登录
            </button>
          </section>
        )}
      </main>
    </>
  );
}
