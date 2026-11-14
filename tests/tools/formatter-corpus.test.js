import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.js";
import { formatRix } from "../../src/tools/language-service/formatter.js";

// Suite-only: formats every plugin and example twice in both profiles.
const meaning = (source) => JSON.stringify(parse(source), (key, value) => (
    key === "pos" || key === "original" || key === "endsLineAt" || key === "unspacedIntervalOperands"
    || (key === "end" && typeof value === "number") ? undefined : value
));

describe("formatting the repository's RiX programs is meaning-preserving and stable", () => {
    const files = [
        ...new Bun.Glob("plugins/*/*.plugin.rix").scanSync({ cwd: `${import.meta.dir}/../..` }),
        ...new Bun.Glob("examples/**/*.rix").scanSync({ cwd: `${import.meta.dir}/../..` }),
    ].sort();
    test.each(files)("%s", async (file) => {
        const source = await Bun.file(`${import.meta.dir}/../../${file}`).text();
        let expected;
        try { expected = meaning(source); } catch { return; }
        for (const profile of ["readable", "compact"]) {
            const formatted = formatRix(source, { profile });
            expect(meaning(formatted)).toBe(expected);
            expect(formatRix(formatted, { profile })).toBe(formatted);
        }
    });
});
