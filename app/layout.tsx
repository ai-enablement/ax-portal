import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://agent-governance-portal-roleflow.ax-gpt.chatgpt.site"),
  title: "Agent Governance Portal",
  description: "Agent 요청부터 평가, 배포, 운영과 AI활성화팀 요구 포트폴리오 관리까지 연결하는 사내 통합 Portal",
  openGraph: {
    title: "Agent Governance Portal",
    description: "신규 요구부터 진행·완료, 담당자·요청팀·일정까지 한눈에 관리하는 AI활성화팀 통합 대시보드",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Agent Governance Portal AI활성화팀 통합 대시보드" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Governance Portal",
    description: "AI활성화팀의 요구 포트폴리오와 일정을 한눈에 관리하세요.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
