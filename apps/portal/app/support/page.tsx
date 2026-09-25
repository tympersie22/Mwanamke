import Link from "next/link";
import { cookies } from "next/headers";
import { CircleAlert, LifeBuoy, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  const copy = language === "sw" ? {
    eyebrow: "Msaada wa MWANAMKE",
    title: "Tunakusaidia kutumia akaunti yako kwa usalama.",
    account: "Msaada wa akaunti",
    accountBody: "Ingia ili kuona miadi, kubadilisha lugha, au kutuma ombi la nakala na kufutwa kwa taarifa. Usishiriki nenosiri, msimbo wa kuingia au msimbo wa kurejesha akaunti.",
    privacy: "Faragha na kufuta akaunti",
    privacyBody: "Baada ya kuingia, fungua Akaunti kisha tuma ombi la nakala au kufutwa. Timu ya faragha itathibitisha ombi kabla ya kulitekeleza.",
    urgent: "MWANAMKE si huduma ya dharura. Tafuta huduma za dharura za eneo lako kwa msaada wa haraka.",
    signIn: "Ingia kwenye akaunti",
    deletion: "Jinsi ya kufuta akaunti",
    home: "Rudi mwanzo"
  } : {
    eyebrow: "MWANAMKE support",
    title: "Help with your account, privacy and safe access.",
    account: "Account help",
    accountBody: "Sign in to view appointments, change language, or request a data copy or deletion. Never share your password, sign-in code or recovery code.",
    privacy: "Privacy and account deletion",
    privacyBody: "After signing in, open Account and submit an export or deletion request. The privacy team verifies each request before fulfillment.",
    urgent: "MWANAMKE is not an emergency service. Use local emergency services when you need urgent help.",
    signIn: "Sign in to your account",
    deletion: "How to delete an account",
    home: "Go home"
  };
  return <main className="fatal-error" lang={language}><section className="fatal-error-card public-info-card">
    <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
    <LifeBuoy className="public-info-icon" aria-hidden="true" />
    <p className="live-overline">{copy.eyebrow}</p><h1>{copy.title}</h1>
    <div className="public-info-section"><h2>{copy.account}</h2><p>{copy.accountBody}</p></div>
    <div className="public-info-section"><h2><ShieldCheck aria-hidden="true" />{copy.privacy}</h2><p>{copy.privacyBody}</p></div>
    <p className="public-urgent"><CircleAlert aria-hidden="true" />{copy.urgent}</p>
    <div className="fatal-actions"><Link href="/auth/login" className="live-button live-button-primary">{copy.signIn}</Link><Link href="/account-deletion" className="live-button live-button-secondary">{copy.deletion}</Link><Link href="/" className="live-button live-button-secondary">{copy.home}</Link></div>
  </section></main>;
}
