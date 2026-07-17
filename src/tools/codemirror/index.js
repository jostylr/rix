import { foldInside, foldNodeProp, indentNodeProp, LRLanguage, LanguageSupport } from "@codemirror/language";
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
      BraceOpen: t.brace,
      BraceClose: t.brace,
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

export function rix() {
  return new LanguageSupport(rixLanguage);
}
