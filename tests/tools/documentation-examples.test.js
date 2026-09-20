import { describe, expect, test } from "bun:test";

import {
  documentPathsFromArgs,
  extractFences,
  runDocuments,
  runDocumentsAsync,
  runFence,
  runFenceAsync,
} from "../../documentation/scripts/check-examples.js";

describe("documentation RiX examples", () => {
  test("preserves every positional documentation path when --write is absent", () => {
    expect(documentPathsFromArgs(["first.md", "second.qmd"]))
      .toEqual(["first.md", "second.qmd"]);
    expect(documentPathsFromArgs(["first.md", "--write", "results.json", "second.qmd"]))
      .toEqual(["first.md", "second.qmd"]);
  });

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
      "{:2x2: 1, 2; 3, 4 } ##: shaped[2x2]",
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

  test("runs promise-aware examples when async=true", async () => {
    const source = [
      "```{.rix exec=true async=true id=async-stream-example}",
      "values := .Stream([1, 2, 3]).Collect();",
      "values.Join() ##@ == \"1,2,3\";",
      "```",
    ].join("\n");

    const [result] = await runDocumentsAsync([{ file: "async-guide.qmd", source }]);
    expect(result.status).toBe("pass");
    expect(result.assertions).toBe(1);
  });
});


test("parse-only examples allocate no session while hidden setup retains its semantics", async () => {
  const sessions = new Map();
  const fence = {file:"lazy.md",source:"1 / 0",attrs:{parse:"true",session:"shared"}};
  expect(runFence(fence,sessions).status).toBe("pass");
  expect(sessions.size).toBe(0);
  expect((await runFenceAsync({...fence,attrs:{...fence.attrs,async:"true"}},sessions)).status).toBe("pass");
  expect(sessions.size).toBe(0);
  const setup = {...fence,source:"##SETUP##\nx := 7\n##SETUP##\nx + 1"};
  expect(runFence(setup,sessions).status).toBe("pass");
  expect(sessions.size).toBe(1);
  const next = runFence({file:"lazy.md",source:"x + 1 ##@ == 8",attrs:{exec:"true",session:"shared"}},sessions);
  expect(next.status).toBe("pass");
  expect(next.assertions).toBe(1);
});
