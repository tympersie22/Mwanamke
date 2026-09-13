import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut, ShieldCheck } from "lucide-react";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  const language = (await cookies()).get("mwanamke-language")?.value === "en" ? "en" : "sw";
  const signedIn = Boolean(await readSession());
  const copy = language === "sw"
    ? {
        eyebrow: "Akaunti salama",
        title: signedIn ? "Unataka kuondoka?" : "Tayari umeondoka",
        body: signedIn ? "Kipindi chako kwenye kivinjari hiki kitaisha. Unaweza kuingia tena wakati wowote." : "Hakuna kipindi cha akaunti kinachotumika kwenye kivinjari hiki.",
        confirm: "Ndiyo, ondoka",
        cancel: "Rudi kwenye akaunti",
        home: "Rudi mwanzo",
        signin: "Ingia"
      }
    : {
        eyebrow: "Secure account",
        title: signedIn ? "Sign out now?" : "You are already signed out",
        body: signedIn ? "Your session in this browser will end. You can sign in again at any time." : "There is no active account session in this browser.",
        confirm: "Yes, sign out",
        cancel: "Return to account",
        home: "Go home",
        signin: "Sign in"
      };

  return (
    <main className="fatal-error" lang={language}>
      <section className="fatal-error-card logout-card">
        <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
        <span className="logout-icon" aria-hidden="true">{signedIn ? <LogOut /> : <ShieldCheck />}</span>
        <p className="live-overline">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="fatal-actions">
          {signedIn ? (
            <>
              <form method="post" action="/auth/logout"><button type="submit" className="live-button live-button-danger">{copy.confirm}</button></form>
              <Link href="/" className="live-button live-button-secondary">{copy.cancel}</Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="live-button live-button-primary">{copy.signin}</Link>
              <Link href="/" className="live-button live-button-secondary">{copy.home}</Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
