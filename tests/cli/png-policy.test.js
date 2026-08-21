import { describe, expect, test } from "bun:test";
import { applyPngPolicy } from "../../bin/node-renderer-tools.js";

const onePixelPng = new Uint8Array(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XyO9WQAAAABJRU5ErkJggg==",
    "base64",
));

function chunks(content) {
    const result = [];
    let offset = 8;
    while (offset + 12 <= content.length) {
        const view = new DataView(content.buffer, content.byteOffset + offset, content.length - offset);
        const length = view.getUint32(0);
        const type = new TextDecoder("ascii").decode(content.subarray(offset + 4, offset + 8));
        result.push({ type, data: content.slice(offset + 8, offset + 8 + length) });
        offset += length + 12;
        if (type === "IEND") break;
    }
    return result;
}

describe("PNG Phase 2 byte policy", () => {
    test("writes deterministic DPI, sRGB, and UTF-8 metadata chunks", () => {
        const result = applyPngPolicy(onePixelPng, {
            dpi: 144,
            colorProfile: "srgb",
            metadata: { Title: "Exact diagram", Author: "RiX" },
        });
        const parsed = chunks(result);
        expect(parsed.map(({ type }) => type)).toEqual([
            "IHDR", "pHYs", "sRGB", "iTXt", "iTXt", "IDAT", "IEND",
        ]);
        const resolution = parsed.find(({ type }) => type === "pHYs").data;
        const view = new DataView(resolution.buffer, resolution.byteOffset, resolution.byteLength);
        expect(view.getUint32(0)).toBe(Math.round(144 / 0.0254));
        expect(view.getUint32(4)).toBe(Math.round(144 / 0.0254));
        expect(resolution[8]).toBe(1);
        const metadata = parsed.filter(({ type }) => type === "iTXt")
            .map(({ data }) => new TextDecoder().decode(data));
        expect(metadata[0]).toContain("Author\0");
        expect(metadata[0]).toEndWith("RiX");
        expect(metadata[1]).toContain("Title\0");
        expect(metadata[1]).toEndWith("Exact diagram");
    });

    test("none removes color-description chunks while replacing physical resolution", () => {
        const withSrgb = applyPngPolicy(onePixelPng, { dpi: 96, colorProfile: "srgb" });
        const withoutProfile = applyPngPolicy(withSrgb, { dpi: 300, colorProfile: "none" });
        const parsed = chunks(withoutProfile);
        expect(parsed.filter(({ type }) => type === "pHYs")).toHaveLength(1);
        expect(parsed.some(({ type }) => ["sRGB", "iCCP", "gAMA", "cHRM"].includes(type))).toBe(false);
        const resolution = parsed.find(({ type }) => type === "pHYs").data;
        expect(new DataView(resolution.buffer, resolution.byteOffset, resolution.byteLength).getUint32(0))
            .toBe(Math.round(300 / 0.0254));
    });
});
