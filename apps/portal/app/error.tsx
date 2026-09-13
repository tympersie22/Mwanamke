"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const currentLanguage = () => document.cookie.split("; ").includes("mwanamke-language=en") ? "en" as const : "sw" as const;

export default function ErrorBoundary({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const language = useSyncExternalStore(subscribe, currentLanguage, () => "sw" as const);
  const copy = language === "sw"
    ? { eyebrow: "Hitilafu", title: "Hatukuweza kufungua ukurasa", body: "Jaribu tena. Tatizo likiendelea, rudi mwanzo.", retry: "Jaribu tena", home: "Mwanzo" }
    : { eyebrow: "Error", title: "Something did not load", body: "Try again. If the problem continues, return home.", retry: "Try again", home: "Home" };
  return (
    <main className="fatal-error" lang={language}>
      <section className="fatal-error-card">
        <Link href="/" className="live-brand" aria-label="MWANAMKE"><span aria-hidden="true">M</span><strong>MWANAMKE</strong></Link>
        <p className="live-overline">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="fatal-actions">
          <button type="button" className="live-button live-button-primary" onClick={retry}>{copy.retry}</button>
          <Link href="/" className="live-button live-button-secondary">{copy.home}</Link>
        </div>
      </section>
    </main>
  );
}
