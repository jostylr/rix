import { describe, expect, test } from "bun:test";

import { extractFences, runDocuments } from "../../documentation/scripts/check-examples.js";

describe("documentation RiX examples", () => {
  test("extracts Quarto attributes and checks an asserted/displayed result", () => {
    const source = [
      "```{.rix exec=true id=rational-example}",
      "1/3 + 1/6 ##@ == 1/2",
      "##",
      "```",
    ].join("\n");

    const [fence] = extractFences(source, "guide.qmd");
    expect(fence.attrs.exec).toBe("true");
    expect(fence.id).toBe("rational-example");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.assertions).toBe(1);
    expect(result.output).toBe("1/2");
  });

  test("applies assertions to the value and supports pipelines", () => {
    const source = [
      "```{.rix exec=true id=pipeline-example}",
      "3 ##@ |> (x -> x == 3)",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.assertions).toBe(1);
  });

  test("checks structural kind annotations and sizes", () => {
    const source = [
      "```{.rix exec=true id=kind-examples}",
      "[1, 2, 3] ##: array[3]",
      "{| 1, 2, 3 |} ##: set[3]",
      "{= name = \"Ada\", age = 37 } ##: map[2]",
      "{: 2, 3 } ##: tuple[2]",
      "{:2x2: 1, 2; 3, 4 } ##: tensor[2x2]",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
  });

  test("executes hidden setup without including it in the visible source", () => {
    const source = [
      "```{.rix exec=true id=setup-example}",
      "##SETUP##",
      "x := 7",
      "##SETUP##",
      "x + 1 ##@ == 8",
      "##",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.visibleSource).not.toContain("x := 7");
    expect(result.output).toBe("8");
  });

  test("keeps the legacy star-counted setup delimiter working", () => {
    const source = [
      "```{.rix exec=true id=legacy-setup-example}",
      "/*** x := 7 ***/",
      "x + 1 ##@ == 8",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.visibleSource).not.toContain("x := 7");
  });

  test("supports expected errors and leaves ordinary comments unchecked", () => {
    const source = [
      "```{.rix exec=true id=error-example expect-error=zero}",
      "10 / 0",
      "### this is an unchecked explanatory comment",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.error).toContain("zero");
  });

  test("records assertion mismatches as failures", () => {
    const source = [
      "```{.rix exec=true id=bad-example}",
      "1 + 1 ##@ == 3",
      "```",
    ].join("\n");

    const [result] = runDocuments([{ file: "guide.qmd", source }]);
    expect(result.status).toBe("fail");
    expect(result.error).toContain("##@ check failed");
  });
});
