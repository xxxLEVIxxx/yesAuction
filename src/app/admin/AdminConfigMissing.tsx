export function AdminConfigMissing() {
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
      <div className="wrap">
        <div className="error" style={{ marginTop: 24 }}>
          未配置 <code>ADMIN_PASSWORD</code>。请在 <code>.env.local</code> 中设置管理员密码后重启服务。
        </div>
      </div>
    </>
  );
}
