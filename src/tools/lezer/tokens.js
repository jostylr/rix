import { ExternalTokenizer } from "@lezer/lr";
import {
  BacktickString,
  Comment,
  Identifier,
  Number,
  Operator,
  OuterIdentifier,
  Placeholder,
  Regex,
  String as StringToken,
  SystemFunction,
  SystemIdentifier,
} from "./parser.terms.js";

const code = {
  at: 64,
  backslash: 92,
  backtick: 96,
  closeBrace: 125,
  doubleQuote: 34,
  hash: 35,
  slash: 47,
  star: 42,
  underscore: 95,
};

function characterAt(input, offset = 0) {
  const first = input.peek(offset);
  if (first < 0) return { value: "", width: 0 };
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = input.peek(offset + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return { value: String.fromCodePoint((first - 0xd800) * 0x400 + second - 0xdc00 + 0x10000), width: 2 };
    }
  }
  return { value: String.fromCharCode(first), width: 1 };
}

function isIdentifierStart(character) {
  return character === "_" || /^[\p{L}]$/u.test(character);
}

function isIdentifierPart(character) {
  return character === "_" || /^[\p{L}\p{N}]$/u.test(character);
}

function firstLetterIsUppercase(value) {
  for (const character of value) {
    if (/^\p{L}$/u.test(character)) return character === character.toUpperCase();
  }
  return false;
}

function scanIdentifier(input, offset = 0) {
  let length = offset;
  let value = "";
  let character = characterAt(input, length);
  if (!isIdentifierStart(character.value)) return null;
  while (character.width && isIdentifierPart(character.value)) {
    value += character.value;
    length += character.width;
    character = characterAt(input, length);
  }
  return { length, value };
}

function consumeQuote(input, delimiter) {
  const delimiterCode = delimiter.charCodeAt(0);
  let quoteCount = 0;
  while (input.peek(quoteCount) === delimiterCode) quoteCount++;
  if (quoteCount === 0) return false;

  let offset = quoteCount;
  while (input.peek(offset) >= 0) {
    let matched = 0;
    while (matched < quoteCount && input.peek(offset + matched) === delimiterCode) matched++;
    if (matched === quoteCount) {
      input.advance(offset + quoteCount);
      return true;
    }
    offset++;
  }
  input.advance(offset);
  return true;
}

function consumeBlockComment(input) {
  let starCount = 0;
  while (input.peek(1 + starCount) === code.star) starCount++;
  if (starCount === 0) return false;

  let offset = starCount + 1;
  while (input.peek(offset) >= 0) {
    let matched = 0;
    while (matched < starCount && input.peek(offset + matched) === code.star) matched++;
    if (matched === starCount && input.peek(offset + matched) === code.slash) {
      input.advance(offset + matched + 1);
      return true;
    }
    offset++;
  }
  input.advance(offset);
  return true;
}

function consumeTaggedComment(input) {
  let offset = 2;
  let tag = "";
  while (input.peek(offset) >= 0 && !(input.peek(offset) === code.hash && input.peek(offset + 1) === code.hash)) {
    const character = String.fromCharCode(input.peek(offset));
    if (/\s/.test(character)) return false;
    tag += character;
    offset++;
  }
  if (!tag || input.peek(offset) !== code.hash || input.peek(offset + 1) !== code.hash) return false;

  offset += 2;
  const normalizedTag = tag.toLowerCase();
  while (input.peek(offset) >= 0) {
    if (input.peek(offset) === code.hash && input.peek(offset + 1) === code.hash) {
      let end = offset + 2;
      let candidate = "";
      while (input.peek(end) >= 0 && !(input.peek(end) === code.hash && input.peek(end + 1) === code.hash)) {
        candidate += String.fromCharCode(input.peek(end));
        end++;
      }
      if (input.peek(end) === code.hash && input.peek(end + 1) === code.hash && candidate.toLowerCase() === normalizedTag) {
        input.advance(end + 2);
        return true;
      }
    }
    offset++;
  }
  input.advance(offset);
  return true;
}

function consumeRegex(input) {
  if (input.next !== 123) return false;
  let offset = 1;
  while (/\s/.test(String.fromCharCode(input.peek(offset)))) offset++;
  if (input.peek(offset) !== code.slash) return false;
  offset++;
  let escaped = false;
  while (input.peek(offset) >= 0) {
    const next = input.peek(offset);
    if (!escaped && next === code.slash) break;
    escaped = !escaped && next === code.backslash;
    if (next !== code.backslash) escaped = false;
    offset++;
  }
  if (input.peek(offset) !== code.slash) return false;
  offset++;
  while (input.peek(offset) >= 0 && input.peek(offset) !== code.closeBrace) offset++;
  if (input.peek(offset) !== code.closeBrace) return false;
  input.advance(offset + 1);
  return true;
}

function startsNumber(input) {
  const first = input.next;
  const second = input.peek(1);
  return (first >= 48 && first <= 57)
    || (first === 45 && ((second >= 48 && second <= 57) || second === 46))
    || (first === 46 && second >= 48 && second <= 57);
}

function consumeNumber(input) {
  if (!startsNumber(input)) return false;
  let offset = input.next === 45 ? 1 : 0;
  const allowed = /[0-9A-Za-z_#.:/\[\]~^]/;
  while (input.peek(offset) >= 0 && allowed.test(String.fromCharCode(input.peek(offset)))) offset++;
  input.advance(offset);
  return true;
}

function isOperatorCharacter(next) {
  return next >= 0 && "+-*/^%=<>!?|:&~\\@.#".includes(String.fromCharCode(next));
}

export const rixTokens = new ExternalTokenizer((input) => {
  if (input.next === code.hash && input.peek(1) === code.hash) {
    if (consumeTaggedComment(input)) return input.acceptToken(Comment);
    while (input.next >= 0 && input.next !== 10) input.advance();
    return input.acceptToken(Comment);
  }
  if (input.next === code.slash && input.peek(1) === code.star && consumeBlockComment(input)) return input.acceptToken(Comment);
  if (input.next === code.doubleQuote && consumeQuote(input, '"')) return input.acceptToken(StringToken);
  if (input.next === code.backtick && consumeQuote(input, "`")) return input.acceptToken(BacktickString);
  if (consumeRegex(input)) return input.acceptToken(Regex);

  if (input.next === code.at && input.peek(1) === code.underscore) {
    const identifier = scanIdentifier(input, 2);
    if (identifier) {
      input.advance(identifier.length);
      return input.acceptToken(SystemFunction);
    }
  }
  if (input.next === code.at) {
    const identifier = scanIdentifier(input, 1);
    if (identifier) {
      input.advance(identifier.length);
      return input.acceptToken(OuterIdentifier);
    }
  }
  if (input.next === code.underscore) {
    let offset = 1;
    while (input.peek(offset) === code.underscore) offset++;
    if (input.peek(offset) >= 48 && input.peek(offset) <= 57) {
      do offset++; while (input.peek(offset) >= 48 && input.peek(offset) <= 57);
      input.advance(offset);
      return input.acceptToken(Placeholder);
    }
  }
  if (consumeNumber(input)) return input.acceptToken(Number);

  const identifier = scanIdentifier(input);
  if (identifier && identifier.value !== "_") {
    input.advance(identifier.length);
    return input.acceptToken(firstLetterIsUppercase(identifier.value) ? SystemIdentifier : Identifier);
  }
  if (input.next === 124 && input.peek(1) === code.closeBrace) return;
  if (isOperatorCharacter(input.next)) {
    do input.advance(); while (isOperatorCharacter(input.next));
    input.acceptToken(Operator);
  }
});
