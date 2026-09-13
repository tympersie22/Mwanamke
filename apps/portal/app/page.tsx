import { cookies } from "next/headers";
import { LivePortal } from "@/components/LivePortal";
import { localRolePreviewEnabled, readSession } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  return <LivePortal initialLanguage={(await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw"} signedIn={Boolean(await readSession())} authFailed={(await searchParams).auth === "failed"} localRolePreview={localRolePreviewEnabled()} />;
}
