export default function AdminDashboardPage() {
  return (
    <>
      <h1 className="admin-page-title">工作台</h1>
      <p className="admin-page-desc">欢迎使用拍卖运营管理后台。左侧菜单可进入各业务模块。</p>

      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-label">今日概览</div>
          <div className="admin-kpi-value">—</div>
          <div className="admin-kpi-hint">可在此接入实时统计</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-label">当前拍品</div>
          <div className="admin-kpi-value">—</div>
          <div className="admin-kpi-hint">与 Firebase auctions/current 同步</div>
        </div>
        <div className="admin-kpi-card">
          <div className="admin-kpi-label">待处理事项</div>
          <div className="admin-kpi-value">—</div>
          <div className="admin-kpi-hint">预出价审核、绑卡异常等</div>
        </div>
      </div>

      <section className="admin-card-block">
        <h2 className="admin-card-block-title">快捷入口</h2>
        <ul className="admin-quick-list">
          <li>
            <strong>拍卖场次</strong> — 创建场次；可在「管理轮次」中为同一场次添加 Day1/Day2 等（时间范围与说明），数据在 <code>auctions/rounds</code>。
          </li>
          <li>
            <strong>参拍审核</strong> — 用户在首页「申请参拍」后，在此审核保证金（免保证金 / 需缴纳），数据在 <code>auctionJoinRequests</code>。
          </li>
          <li>
            <strong>拍品与场次</strong> — 将拍品关联到场次（<code>auctions/lots</code>）；当前上拍仍由 <code>auctions/current</code> 控制。
          </li>
        </ul>
      </section>
    </>
  );
}
