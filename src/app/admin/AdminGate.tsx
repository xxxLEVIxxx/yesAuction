"use client";

import { FormEvent, useState } from "react";

export function AdminGate() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "登录失败");
        return;
      }
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, marginTop: 40 }}>
      <div className="sec-title">管理入口</div>
      <p className="sec-sub">此页面未在网站中链接，仅通过直接输入地址访问。</p>
      <section className="card">
        <form className="stack" onSubmit={onSubmit}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="管理员密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err ? <div className="error">{err}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "验证中…" : "进入"}
          </button>
        </form>
      </section>
    </div>
  );
}
