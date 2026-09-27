import Link from "next/link";
import { cookies } from "next/headers";
import { LockKeyhole } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignInUnavailablePage() {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  const copy = language === "sw" ? {
    eyebrow: "Kabla ya uzinduzi",
    title: "Akaunti bado hazijafunguliwa.",
    body: "Unaangalia onyesho la MWANAMKE. Kuingia, kufungua akaunti na kuweka miadi kutapatikana baada ya maandalizi ya huduma kukamilika.",
    home: "Rudi mwanzo"
  } : {
    eyebrow: "Before launch",
    title: "Accounts are not open yet.",
    body: "You are viewing a preview of MWANAMKE. Sign-in, registration and appointment booking will be available once service setup is complete.",
    home: "Go home"
  };
  return <main className="fatal-error" lang={language}><section className="fatal-error-card">
    <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
    <LockKeyhole className="public-info-icon" aria-hidden="true" />
    <p className="live-overline">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.body}</p>
    <div className="fatal-actions"><Link href="/" className="live-button live-button-primary">{copy.home}</Link></div>
  </section></main>;
}
