import { lowerGraphicSvg } from "../../src/runtime/output.js";
import { escapeHtml, field, option, rixString, sequence } from "../renderers/common.js";
import { createFrameSerializer } from "../renderers/static-frames.js";

function stableId(source) {
    let hash = 14695981039346656037n;
    for (const code of new TextEncoder().encode(source)) hash = BigInt.asUintN(64, (hash ^ BigInt(code)) * 1099511628211n);
    return hash.toString(16).padStart(16, "0");
}

export function createFrameBundle(request, frames, delays, encoderPolicy) {
    const portableFrameValue = createFrameSerializer();
    const diagnostics = [];
    const rendered = frames.map(({ graphic }, index) => {
        const svg = lowerGraphicSvg(graphic, request.format);
        diagnostics.push(...svg.diagnostics.map((item) => ({ ...item, path: `frames[${index + 1}]${item.path ? `.${item.path}` : ""}` })));
        return svg;
    });
    let elapsed = 0;
    const manifest = {
        schema: "rix.animation-export@1",
        title: rixString(field(request.value, "title")) || "Animation frames",
        caption: rixString(field(request.value, "caption")),
        frameCount: frames.length,
        timingUnit: "centisecond",
        encoderPolicy,
        frames: frames.map((frame, index) => {
            const entry = {
                frame: index + 1,
                start: elapsed,
                delay: delays[index],
                requestedDuration: portableFrameValue(option(request.options, "delays") !== null
                    ? sequence(option(request.options, "delays"), "GIF delays")[index]
                    : frame.duration ?? option(request.options, "duration", 1)),
                ...portableFrameValue(frame.metadata),
                marker: frame.marker,
                tracks: portableFrameValue(frame.tracks),
                coordinateLowering: rendered[index].metadata,
                diagnostics: rendered[index].diagnostics,
                // The Graphics source remains inspectable with exact numeric strings.
                graphics: portableFrameValue(frame.graphic),
            };
            elapsed += delays[index];
            return entry;
        }),
    };
    manifest.duration = elapsed;
    const prefix = `animation-${stableId(JSON.stringify(manifest))}`;
    const width = Math.max(4, String(frames.length).length);
    manifest.frames.forEach((frame, index) => { frame.asset = `${prefix}/frame-${String(index + 1).padStart(width, "0")}.svg`; });
    const describe = (frame) => [frame.title, frame.caption, frame.description, frame.marker,
        ...frame.tracks.filter((track) => ["caption", "narration", "formula", "construction"].includes(track.kind) && track.value !== null)
            .map((track) => typeof track.value === "string" ? track.value : JSON.stringify(track.value))].filter(Boolean).join(" — ");
    const text = `${manifest.title}\n${manifest.caption ? `${manifest.caption}\n` : ""}\n${manifest.frames.map((frame) =>
        `Frame ${frame.frame} | start ${frame.start} cs | duration ${frame.delay} cs\n${describe(frame) || `Frame ${frame.frame}`}\nState: ${JSON.stringify(frame.state)}\nOrigin: ${JSON.stringify(frame.origin)}\nEvidence: ${JSON.stringify(frame.snapshot)}\n`).join("\n")}`;
    const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(manifest.title)}</title><style>body{font-family:system-ui,sans-serif;margin:2rem}ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem;padding:0;list-style:none}figure{margin:0;padding:1rem;border:1px solid #ccc}img{max-width:100%;height:auto}figcaption{margin-top:.5rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>${escapeHtml(manifest.title)}</h1>${manifest.caption ? `<p>${escapeHtml(manifest.caption)}</p>` : ""}<p>${frames.length} retained frames; ${elapsed} centiseconds. Each frame remains available without an animation encoder.</p><ol>${manifest.frames.map((frame) => `<li><figure><img src="${frame.asset}" alt="${escapeHtml(describe(frame) || `Frame ${frame.frame}`)}"><figcaption><strong>Frame ${frame.frame}</strong> — ${frame.delay} cs${describe(frame) ? `<p>${escapeHtml(describe(frame))}</p>` : ""}<details><summary>Exact state and evidence</summary><pre>${escapeHtml(JSON.stringify({ state: frame.state, origin: frame.origin, snapshot: frame.snapshot, tracks: frame.tracks }, null, 2))}</pre></details></figcaption></figure></li>`).join("")}</ol></body></html>\n`;
    const assets = [
        { path: `${prefix}/manifest.json`, mime: "application/json", content: `${JSON.stringify(manifest, null, 2)}\n` },
        { path: `${prefix}/captions.txt`, mime: "text/plain", content: text },
        ...rendered.map((svg, index) => ({ path: manifest.frames[index].asset, mime: "image/svg+xml", content: svg.content })),
    ];
    return { manifest, prefix, html, assets, diagnostics };
}
