import type { Metadata } from "next";
import { AttendanceAuctionsClient } from "./AttendanceAuctionsClient";

export const metadata: Metadata = {
  title: "参拍审核 — 管理后台",
  description: "处理参拍申请与保证金状态",
};

export default function AdminAttendancePage() {
  return <AttendanceAuctionsClient />;
}
