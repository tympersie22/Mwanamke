import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AccountDeletionPage() {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  const copy = language === "sw" ? {
    eyebrow: "Udhibiti wa akaunti",
    title: "Omba kufutwa kwa akaunti yako ya MWANAMKE",
    body: "Ingia kwenye tovuti salama, fungua Akaunti, kisha chagua Omba kufutwa kwa akaunti. Njia hii inathibitisha kwamba ombi linatoka kwenye akaunti yako.",
    process: "Baada ya kutuma ombi",
    processBody: "Ombi litaonekana kwenye historia ya akaunti yako. Timu ya faragha italithibitisha, itatumia masharti ya kuhifadhi taarifa yanayotakiwa kisheria, na itasasisha hali ya ombi. Kutuma ombi hakufuti taarifa papo hapo.",
    access: "Ukipoteza uwezo wa kuingia, tumia njia ya kurejesha akaunti kwenye ukurasa wa kuingia. Usitume nywila au misimbo ya kurejesha kwa mtu yeyote.",
    signIn: "Ingia na utume ombi",
    support: "Pata msaada",
    home: "Rudi mwanzo"
  } : {
    eyebrow: "Account control",
    title: "Request deletion of your MWANAMKE account",
    body: "Sign in to the secure portal, open Account, then choose Request account deletion. This verifies that the request comes from your account.",
    process: "After you submit",
    processBody: "The request appears in your account history. The privacy team verifies it, applies any legally required retention, and updates its status. Submission does not delete information immediately.",
    access: "If you have lost access, use account recovery on the sign-in page. Never send a password or recovery code to anyone.",
    signIn: "Sign in and submit",
    support: "Get support",
    home: "Go home"
  };
  return <main className="fatal-error" lang={language}><section className="fatal-error-card public-info-card">
    <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
    <Trash2 className="public-info-icon public-info-danger" aria-hidden="true" />
    <p className="live-overline">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.body}</p>
    <div className="public-info-section"><h2>{copy.process}</h2><p>{copy.processBody}</p></div>
    <p className="public-security-note"><KeyRound aria-hidden="true" />{copy.access}</p>
    <div className="fatal-actions"><Link href="/auth/login" className="live-button live-button-danger">{copy.signIn}</Link><Link href="/support" className="live-button live-button-secondary">{copy.support}</Link><Link href="/" className="live-button live-button-secondary">{copy.home}</Link></div>
  </section></main>;
}
