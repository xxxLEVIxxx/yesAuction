import type { Metadata } from "next";
import { AttendanceDetailClient } from "./AttendanceDetailClient";

export const metadata: Metadata = {
  title: "场次参拍审核 — 管理后台",
  description: "审核单场参拍申请",
};

export default function AdminAttendanceDetailPage() {
  return <AttendanceDetailClient />;
}
