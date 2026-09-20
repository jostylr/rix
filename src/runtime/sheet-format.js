/** Safe portable CSS for the bounded RiXCel cell-format vocabulary. */
export function sheetCellStyleCss(style = {}) {
    return [style.bold === undefined ? "" : `font-weight:${style.bold ? "bold" : "normal"}`, style.italic === undefined ? "" : `font-style:${style.italic ? "italic" : "normal"}`, /^#[0-9a-f]{6}$/iu.test(style.color ?? "") ? `color:${style.color}` : "", /^#[0-9a-f]{6}$/iu.test(style.background ?? "") ? `background-color:${style.background}` : "", ["left","center","right"].includes(style.align) ? `text-align:${style.align}` : ""].filter(Boolean).join(";");
}
