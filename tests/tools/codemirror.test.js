import { describe, expect, test } from "bun:test";
import { parser } from "../../src/tools/lezer/parser.js";
import { rixLanguage } from "../../src/tools/codemirror/index.js";

function tree(source) {
  return parser.parse(source).toString();
}

describe("RiX Lezer grammar", () => {
  test("classifies ordinary RiX notebook code", () => {
    const result = tree("radius := 3; area := 22/7 * radius^2;");
    expect(result).toContain("Number");
    expect(result).toContain("Identifier");
    expect(result).toContain("Operator");
  });

  test("keeps comments, strings, and rich containers intact", () => {
    const result = tree('## note\nvalue := {= label="circle", bounds=1:5 };');
    expect(result).toContain("Comment");
    expect(result).toContain("String");
    expect(result).toContain("MapContainer");
  });

  test("recognizes RiX-specific identifier forms", () => {
    const result = tree("@_ADD(@outer, _1, Value)");
    expect(result).toContain("SystemFunction");
    expect(result).toContain("OuterIdentifier");
    expect(result).toContain("Placeholder");
    expect(result).toContain("SystemIdentifier");
    expect(result).not.toContain("⚠");
  });

  test("supports sigil containers with alternate closers", () => {
    const result = tree("values := {| 1, 2 |}");
    expect(result).toContain("SetContainer");
    expect(result).not.toContain("⚠");
  });

  test("exposes a CodeMirror language parser", () => {
    expect(rixLanguage.parser.parse("x := [1, 2, 3]").length).toBeGreaterThan(0);
  });
});
