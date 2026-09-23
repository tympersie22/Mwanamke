export type PortalSection =
  | "personal"
  | "providers"
  | "appointments"
  | "navigator/assignments"
  | "admin/aggregate"
  | "privacy/requests";

const sectionsByRole: Record<string, readonly PortalSection[]> = {
  patient: ["personal", "providers", "appointments", "privacy/requests"],
  provider: ["appointments", "privacy/requests"],
  navigator: ["navigator/assignments", "providers", "privacy/requests"],
  "facility-admin": ["admin/aggregate", "privacy/requests"],
  "platform-admin": ["admin/aggregate", "privacy/requests"],
  "programme-admin": ["admin/aggregate", "privacy/requests"]
};

export function portalSections(role?: string | null): readonly PortalSection[] {
  return role ? sectionsByRole[role] ?? [] : [];
}

export function portalPathAllowed(role: string, path: string): boolean {
  if (role === "patient" && ["cycle", "pregnancy"].includes(path)) return true;
  return portalSections(role).some((section) => section === path || (section === "providers" && path.startsWith("providers/")));
}
