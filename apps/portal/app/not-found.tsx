import Link from "next/link";
import { cookies } from "next/headers";

export default async function NotFound() {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  const copy = language === "sw"
    ? { title: "Ukurasa haujapatikana", body: "Ukurasa huu haupo au kiungo kimebadilika.", action: "Rudi mwanzo" }
    : { title: "Page not found", body: "This page does not exist or the link has changed.", action: "Go home" };
  return (
    <main className="fatal-error">
      <section className="fatal-error-card">
        <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
        <p className="live-overline">404</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="fatal-actions"><Link href="/" className="live-primary"><span aria-hidden="true">←</span>{copy.action}</Link></div>
      </section>
    </main>
  );
}
