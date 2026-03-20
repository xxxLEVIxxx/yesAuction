import { AdminGate } from "./AdminGate";

export function AdminLoginPage() {
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
      <AdminGate />
    </>
  );
}
