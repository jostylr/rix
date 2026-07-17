import {
  foldInside,
  foldNodeProp,
  HighlightStyle,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";
import { parser } from "../lezer/parser.js";

const parserWithMetadata = parser.configure({
  props: [
    styleTags({
      Number: t.number,
      String: t.string,
      BacktickString: t.special(t.string),
      Regex: t.regexp,
      Comment: t.comment,
      Identifier: t.variableName,
      SystemIdentifier: t.typeName,
      SystemFunction: t.function(t.special(t.variableName)),
      OuterIdentifier: t.special(t.variableName),
      Placeholder: t.special(t.variableName),
      SelfReference: t.self,
      Operator: t.operatorKeyword,
      BraceClose: t.brace,
      "MapContainer CaseContainer BlockContainer SetContainer TupleContainer LoopContainer MatchContainer RangeContainer GreaterContainer PowerContainer DollarContainer MutationContainer PlusContainer StarContainer AndContainer OrContainer BackslashContainer SlashContainer IncrementContainer ShiftLeftContainer ShiftRightContainer PlainContainer": t.brace,
      "( )": t.paren,
      "[ ]": t.squareBracket,
      Separator: t.separator,
    }),
    foldNodeProp.add({ Group: foldInside, Array: foldInside, Container: foldInside }),
    indentNodeProp.add({
      Group: (context) => context.column(context.node.from) + context.unit,
      Array: (context) => context.column(context.node.from) + context.unit,
      Container: (context) => context.column(context.node.from) + context.unit,
    }),
  ],
});

export const rixLanguage = LRLanguage.define({
  parser: parserWithMetadata,
  languageData: {
    commentTokens: { line: "##", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
});

// RiX's default palette stays scoped to RiX trees, so Markdown and any host
// editor can keep their own appearance around embedded RiX code.
export const rixHighlightStyle = HighlightStyle.define([
  { tag: t.number, color: "var(--rix-number, #b4235d)", fontWeight: "650" },
  { tag: t.string, color: "var(--rix-string, #08776d)" },
  { tag: t.special(t.string), color: "var(--rix-embedded-string, #006c9c)", fontWeight: "600" },
  { tag: t.regexp, color: "var(--rix-regex, #0b7285)" },
  { tag: t.comment, color: "var(--rix-comment, #64736d)", fontStyle: "italic" },
  { tag: t.variableName, color: "var(--rix-identifier, #145da0)" },
  { tag: t.special(t.variableName), color: "var(--rix-special-identifier, #6d28a8)", fontWeight: "650" },
  { tag: t.function(t.special(t.variableName)), color: "var(--rix-special-identifier, #6d28a8)", fontWeight: "700" },
  { tag: t.typeName, color: "var(--rix-system-identifier, #8a1c65)", fontWeight: "650" },
  { tag: t.self, color: "var(--rix-self, #b45309)", fontWeight: "700" },
  { tag: t.operatorKeyword, color: "var(--rix-operator, #b54708)", fontWeight: "700" },
  { tag: [t.brace, t.paren, t.squareBracket, t.separator], color: "var(--rix-punctuation, #7b4b16)", fontWeight: "600" },
], { scope: rixLanguage });

export const rixHighlighting = syntaxHighlighting(rixHighlightStyle);

export function rix() {
  return new LanguageSupport(rixLanguage, [rixHighlighting]);
}
