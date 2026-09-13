import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function findElementsMissingHandler(file: string, tag: string, handler: string) {
  const source = readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: Array<{ line: number; label: string }> = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(tree);
      const hasHandler = node.attributes.properties.some(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === handler
      );

      if (tagName === tag && !hasHandler && !(ts.isJsxElement(node.parent) && ts.isJsxElement(node.parent.parent) && node.parent.parent.openingElement.tagName.getText(tree) === "form")) {
        const position = tree.getLineAndCharacterOfPosition(node.getStart(tree));
        missing.push({ line: position.line + 1, label: node.getText(tree).slice(0, 100) });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(tree);
  return missing;
}

describe("interaction contract", () => {
  it("wires every portal button to an action", () => {
    const file = resolve(process.cwd(), "components/LivePortal.tsx");
    expect(findElementsMissingHandler(file, "button", "onClick")).toEqual([]);
  });

  it("wires every native pressable to an action", () => {
    for (const path of ["../mobile/app/index.tsx", "../mobile/components/PatientTracker.tsx"]) {
      expect(findElementsMissingHandler(resolve(process.cwd(), path), "Pressable", "onPress")).toEqual([]);
    }
  });
  it("keeps production screens free of review and fixture imports", () => {
    for (const path of ["app/page.tsx", "components/LivePortal.tsx", "../mobile/app/index.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).not.toMatch(/from ["'].*(?:fixtures|MwanamkeReview|@mwanamke\/domain)["']/);
      expect(source).not.toContain("ENABLE_REVIEW_SURFACE");
    }
  });
});
