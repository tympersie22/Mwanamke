import { describe, expect, it } from "vitest";
import { portalPathAllowed, portalSections } from "./portal-sections";

describe("role-specific portal sections", () => {
  it("keeps patient navigation focused on personal care and booking", () => {
    expect(portalSections("patient")).toEqual(["personal", "providers", "appointments", "privacy/requests"]);
    expect(portalPathAllowed("patient", "cycle")).toBe(true);
    expect(portalPathAllowed("patient", "payments")).toBe(false);
  });

  it("does not expose patient discovery or financial features to providers", () => {
    expect(portalSections("provider")).toEqual(["appointments", "privacy/requests"]);
    expect(portalPathAllowed("provider", "providers")).toBe(false);
    expect(portalPathAllowed("provider", "payments")).toBe(false);
  });

  it("gives navigators coordination tools and administrators aggregate operations only", () => {
    expect(portalSections("navigator")).toEqual(["navigator/assignments", "providers", "privacy/requests"]);
    expect(portalSections("platform-admin")).toEqual(["admin/aggregate", "privacy/requests"]);
    expect(portalPathAllowed("platform-admin", "appointments")).toBe(false);
  });
});
