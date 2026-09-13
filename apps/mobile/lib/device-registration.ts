import { apiUrl, type Session } from "./auth";

export type HardwareAttestation = {
  algorithm: "ECDSA-P256-SHA256" | "Ed25519";
  publicKey: string;
  format: "apple-app-attest" | "android-key-attestation" | "webauthn";
  evidence: string;
};

/**
 * Register a native-generated public key. The key pair and attestation must come
 * from Apple App Attest, Android Key Attestation or WebAuthn; this helper never
 * uploads a private key. Expo managed development builds may use the development
 * fallback, but production rejects registrations without attestation evidence.
 */
export async function registerHardwareBackedDevice(session: Session, label: string, attestation: HardwareAttestation) {
  const response = await fetch(`${apiUrl()}/v1/devices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label, algorithm: attestation.algorithm, publicKey: attestation.publicKey, attestationFormat: attestation.format, attestationEvidence: attestation.evidence })
  });
  if (!response.ok) throw new Error("This device could not be trusted. Update the app or contact support.");
  return response.json() as Promise<{ data: { id: string; label: string; authorizedAt: string } }>;
}
