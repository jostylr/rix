// src/parser/tokenizer.js
var identifierStart = /[\p{L}_]/u;
var identifierPart = /[\p{L}\p{N}_]/u;
var symbols = [
  ":=:",
  ":>=:",
  ":<=:",
  ":>:",
  ":<:",
  ":->",
  "\\/=",
  "/\\=",
  "\\/",
  "/\\",
  "?!-",
  "?-",
  "^=>",
  "?&",
  "!!",
  "!?",
  "++=",
  "++",
  "<<",
  ">>",
  "<>",
  "_>",
  "<_",
  "||>",
  "~~=",
  "::=",
  "//=",
  "**=",
  "/^=",
  "/~=",
  "|>&&",
  "|>||",
  "|>_",
  "|>!",
  "|>>",
  "|:>",
  "|>:",
  "|>?",
  "|><",
  "|<>",
  "|;",
  "|}",
  "|>/|",
  "|>#|",
  "|>//",
  "|>/",
  "|>",
  "/%",
  "//",
  "/^",
  "/~",
  "::+",
  ":~/",
  ":/:",
  ":~",
  ":/%",
  "::",
  ":+",
  ":%",
  "~!:",
  "~:",
  "~=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^^",
  "^=",
  "\\=",
  "===",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  ">:",
  "<",
  ">",
  "->",
  "=>",
  "**",
  "?=",
  "??",
  "?:",
  "?|",
  "@_",
  "|^:",
  "|+",
  "|*",
  "|:",
  "|;",
  "|^",
  "|?",
  "~{",
  "~[",
  ":=",
  "...",
  "..",
  "|.",
  ".|",
  ".=",
  "{!",
  "#",
  "%",
  ",",
  ";",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "+",
  "-",
  "*",
  "/",
  "^",
  "_",
  ".",
  "~",
  "@@",
  "@",
  "$$",
  "$",
  "=",
  "'",
  ":",
  "?",
  "!",
  "\\"
];
function posToLineCol(input, pos) {
  let line = 1;
  let col = 1;
  for (let i = 0;i < pos && i < input.length; i++) {
    if (input[i] === `
`) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
function tokenize(input) {
  const tokens = [];
  let position = 0;
  while (position < input.length) {
    const startPos = position;
    while (position < input.length && /\s/.test(input[position])) {
      position++;
    }
    if (position >= input.length) {
      tokens.push({
        type: "End",
        original: input.slice(startPos),
        value: null,
        pos: [startPos, startPos, input.length]
      });
      break;
    }
    let token = null;
    token = tryMatchPostfixCheck(input, position);
    if (!token) {
      token = tryMatchComment(input, position);
    }
    if (!token) {
      token = tryMatchNumber(input, position);
    }
    if (!token) {
      token = tryMatchExplicitCF(input, position);
    }
    if (!token) {
      token = tryMatchString(input, position);
    }
    if (!token) {
      token = tryMatchSystemFunctionRef(input, position);
    }
    if (!token) {
      token = tryMatchOuterIdentifier(input, position);
    }
    if (!token) {
      token = tryMatchIdentifier(input, position);
    }
    if (!token) {
      token = tryMatchCustomOperator(input, position);
    }
    if (!token) {
      token = tryMatchRegexLiteral(input, position);
    }
    if (!token) {
      token = tryMatchBrace(input, position);
    }
    if (!token) {
      token = tryMatchSemicolonSequence(input, position);
    }
    if (!token) {
      token = tryMatchSymbol(input, position);
    }
    if (token) {
      const whitespace = input.slice(startPos, position);
      token.original = whitespace + token.original;
      token.pos[0] = startPos;
      if (token.type !== "String") {
        token.pos[1] = position;
      }
      tokens.push(token);
      position += token.original.length - whitespace.length;
    } else {
      position++;
    }
  }
  if (tokens.length === 0 || tokens[tokens.length - 1].type !== "End") {
    tokens.push({
      type: "End",
      original: "",
      value: null,
      pos: [input.length, input.length, input.length]
    });
  }
  return tokens;
}
function tryMatchCustomOperator(input, position) {
  if (!input.startsWith(":<", position))
    return null;
  let end = -1;
  for (let cursor = position + 2;cursor < input.length; cursor += 1) {
    if (input.startsWith(">:", cursor)) {
      end = cursor;
      break;
    }
    if (input[cursor] === ":")
      return null;
    if (/\s/u.test(input[cursor]))
      break;
  }
  if (end < 0) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Unclosed custom operator delimiter at line ${line}:${col}`);
  }
  const value = input.slice(position + 2, end);
  if (!value || /[<>:\s]/u.test(value)) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Invalid custom operator delimiter at line ${line}:${col}`);
  }
  const original = input.slice(position, end + 2);
  return {
    type: "CustomOperator",
    original,
    value,
    pos: [position, position, end + 2]
  };
}
function tryMatchPostfixCheck(input, position) {
  const longMarker = input.slice(position, position + 4);
  if (longMarker === "##!>") {
    return {
      type: "Symbol",
      original: longMarker,
      value: longMarker,
      pos: [position, position, position + longMarker.length]
    };
  }
  const marker = input.slice(position, position + 3);
  if (marker !== "##@" && marker !== "##:" && marker !== "##!" && marker !== "##_")
    return null;
  return {
    type: "Symbol",
    original: marker,
    value: marker,
    pos: [position, position, position + marker.length]
  };
}
function tryMatchComment(input, position) {
  const remaining = input.slice(position);
  if (!remaining.startsWith("##"))
    return null;
  let tagEndIndex = -1;
  let hasSpaceInTag = false;
  for (let i = 2;i < remaining.length - 1; i++) {
    if (remaining[i] === "#" && remaining[i + 1] === "#") {
      tagEndIndex = i;
      break;
    }
    if (/\s/.test(remaining[i])) {
      hasSpaceInTag = true;
      break;
    }
  }
  if (tagEndIndex !== -1 && !hasSpaceInTag) {
    const tag = remaining.slice(2, tagEndIndex);
    const normalizedTag = tag.toLowerCase();
    const openDelimiter = `##${tag}##`;
    const closeDelimiter = `##${normalizedTag}##`;
    let searchPos = tagEndIndex + 2;
    while (searchPos < remaining.length - (normalizedTag.length + 4) + 1) {
      const potentialCloseStart = remaining.indexOf("##", searchPos);
      if (potentialCloseStart === -1)
        break;
      const potentialCloseTagEnd = remaining.indexOf("##", potentialCloseStart + 2);
      if (potentialCloseTagEnd === -1)
        break;
      const foundTag = remaining.slice(potentialCloseStart + 2, potentialCloseTagEnd).toLowerCase();
      if (foundTag === normalizedTag) {
        const totalLength = potentialCloseTagEnd + 2;
        const value = remaining.slice(tagEndIndex + 2, potentialCloseStart);
        return {
          type: "String",
          original: remaining.slice(0, totalLength),
          value,
          kind: "comment",
          pos: [position, position + tagEndIndex + 2, position + totalLength]
        };
      }
      searchPos = potentialCloseStart + 1;
    }
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Unclosed multi-line comment with tag "${tag}" at line ${line}:${col}`);
  }
  let lineEndIndex = remaining.indexOf(`
`);
  if (lineEndIndex === -1)
    lineEndIndex = remaining.length;
  return {
    type: "String",
    original: remaining.slice(0, lineEndIndex),
    value: remaining.slice(2, lineEndIndex),
    kind: "comment",
    pos: [position, position + 2, position + lineEndIndex]
  };
}
function tryMatchString(input, position) {
  const remaining = input.slice(position);
  const blockCommentMatch = remaining.match(/^\/(\*+)/);
  if (blockCommentMatch) {
    const starCount = blockCommentMatch[1].length;
    const fullPattern = new RegExp(`^\\/\\*{${starCount}}([\\s\\S]*?)\\*{${starCount}}\\/`);
    const match = remaining.match(fullPattern);
    if (match) {
      return {
        type: "String",
        original: match[0],
        value: match[1],
        kind: "comment",
        pos: [
          position,
          position + blockCommentMatch[0].length,
          position + match[0].length
        ]
      };
    }
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Delimiter unmatched at line ${line}:${col}. Need ${starCount} stars followed by slash.`);
  }
  const quoteMatch = remaining.match(/^("+)/);
  if (quoteMatch) {
    const quoteCount = quoteMatch[1].length;
    let searchPos = position + quoteCount;
    while (searchPos < input.length) {
      const foundQuotes = input.slice(searchPos).match(/^("+)/);
      if (foundQuotes && foundQuotes[1].length === quoteCount) {
        const content = input.slice(position + quoteCount, searchPos);
        const original = input.slice(position, searchPos + quoteCount);
        return {
          type: "String",
          original,
          value: content,
          kind: "quote",
          pos: [position, position + quoteCount, searchPos + quoteCount]
        };
      }
      searchPos++;
    }
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Delimiter unmatched at line ${line}:${col}. Need ${quoteCount} closing quotes.`);
  }
  const backtickMatch = remaining.match(/^(`+)/);
  if (backtickMatch) {
    const backtickCount = backtickMatch[1].length;
    let searchPos = position + backtickCount;
    while (searchPos < input.length) {
      const foundBackticks = input.slice(searchPos).match(/^(`+)/);
      if (foundBackticks && foundBackticks[1].length === backtickCount) {
        const content = input.slice(position + backtickCount, searchPos);
        const original = input.slice(position, searchPos + backtickCount);
        return {
          type: "String",
          original,
          value: content,
          kind: "backtick",
          pos: [position, position + backtickCount, searchPos + backtickCount]
        };
      }
      searchPos++;
    }
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Delimiter unmatched at line ${line}:${col}. Need ${backtickCount} closing backticks.`);
  }
  return null;
}
function tryMatchExplicitCF(input, position) {
  const remaining = input.slice(position);
  let match = remaining.match(/^~-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]+\.\~[0-9a-zA-Z]+(?:~[0-9a-zA-Z]+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^~-?\d+\.~\d+(?:~\d+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  return null;
}
function tryMatchNumber(input, position) {
  const remaining = input.slice(position);
  let match;
  if (!/^(\d|\.\d)/.test(remaining)) {
    return null;
  }
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]+\.~[0-9a-zA-Z]+(?:~[0-9a-zA-Z]+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?0[A-Z]"(?:[^"\\]|\\.)*"/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?0[A-Z][0-9A-Za-z@&./#~_^+-]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*\.\.(?:0z\[\d+\]|0[a-zA-Z])?[0-9a-zA-Z]*\/(?:0z\[\d+\]|0[a-zA-Z])?[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*\.[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^\d+\.~\d+(?:~\d+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d(?:_?\d)*\.\d(?:_?\d)*#\d(?:_?\d)*|\.\d(?:_?\d)*#\d(?:_?\d)*|\d(?:_?\d)*\.\.\d(?:_?\d)*\/\d(?:_?\d)*|\d(?:_?\d)*\.\d(?:_?\d)*|\.\d(?:_?\d)*|\d(?:_?\d)*)_\^[+-]?\d(?:_?\d)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?\d+\.\.\d+\/\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d+\.\d*#\d+|\.\d*#\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?\d+#\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)\[[^\]]+\]/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d+\.\d+|\.\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  return null;
}
function tryMatchSystemFunctionRef(input, position) {
  const remaining = input.slice(position);
  if (remaining.startsWith("@_") && remaining.length > 2 && identifierStart.test(remaining[2])) {
    let length = 3;
    while (length < remaining.length && identifierPart.test(remaining[length])) {
      length++;
    }
    const original = remaining.slice(0, length);
    const name = remaining.slice(2, length);
    const value = name[0].toUpperCase() + name.slice(1).toUpperCase();
    return {
      type: "Identifier",
      original,
      value,
      kind: "SystemFunction",
      pos: [position, position, position + length]
    };
  }
  return null;
}
function tryMatchIdentifier(input, position) {
  const remaining = input.slice(position);
  if (remaining[0] === "_") {
    const placeholderMatch = remaining.match(/^_+(\d+)/);
    if (placeholderMatch) {
      const original2 = placeholderMatch[0];
      const place = parseInt(placeholderMatch[1], 10);
      return {
        type: "PlaceHolder",
        original: original2,
        place,
        pos: [position, position, position + original2.length]
      };
    }
  }
  if (!identifierStart.test(remaining[0])) {
    return null;
  }
  let length = 1;
  while (length < remaining.length && identifierPart.test(remaining[length])) {
    length++;
  }
  const original = remaining.slice(0, length);
  if (original === "_") {
    return null;
  }
  let firstLetter = null;
  for (let i = 0;i < original.length; i++) {
    if (/[\p{L}]/u.test(original[i])) {
      firstLetter = original[i];
      break;
    }
  }
  const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
  const kind = isCapital ? "System" : "User";
  const value = isCapital ? original.toUpperCase() : original.toLowerCase();
  return {
    type: "Identifier",
    original,
    value,
    kind,
    pos: [position, position, position + length]
  };
}
function normalizeIdentifierValue(original) {
  let firstLetter = null;
  for (let i = 0;i < original.length; i++) {
    if (/[\p{L}]/u.test(original[i])) {
      firstLetter = original[i];
      break;
    }
  }
  const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
  return isCapital ? original.toUpperCase() : original.toLowerCase();
}
function tryMatchSemicolonSequence(input, position) {
  const remaining = input.slice(position);
  const match = remaining.match(/^;+/);
  if (match) {
    const sequence = match[0];
    const count = sequence.length;
    if (count > 1) {
      return {
        type: "SemicolonSequence",
        original: sequence,
        value: sequence,
        count,
        pos: [position, position, position + sequence.length]
      };
    }
  }
  return null;
}
function tryMatchBrace(input, position) {
  if (input[position] !== "{")
    return null;
  const isWhitespace = (c) => c === " " || c === "\t" || c === `
` || c === "\r" || c === undefined;
  const ch = input[position + 1];
  const makeAdvancedConstructorToken = (value, start, end, extras = {}) => ({
    type: "Symbol",
    original: input.slice(position, end),
    value,
    pos: [position, position, end],
    ...extras
  });
  if (ch === "$") {
    const start = position + 2;
    const first = input[start];
    const requireBoundary = (end2, label) => {
      const afterHeader = input[end2];
      if (!isWhitespace(afterHeader) && afterHeader !== "}") {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`${label} must be followed by a space or '}' at line ${line2}:${col2}`);
      }
    };
    if (first === "$") {
      const end2 = start + 1;
      requireBoundary(end2, "Detached block header '{$$'");
      return makeAdvancedConstructorToken("{$$", position, end2, { detached: true });
    }
    if (isWhitespace(first)) {
      return makeAdvancedConstructorToken("{$", position, start, { containerName: null });
    }
    let cursor = start;
    let containerName = null;
    if (/[a-zA-Z0-9_]/.test(input[cursor] || "")) {
      const nameStart = cursor;
      while (cursor < input.length && /[a-zA-Z0-9_]/.test(input[cursor]))
        cursor++;
      containerName = input.slice(nameStart, cursor).toLowerCase();
      if (input[cursor] === "$") {
        const end2 = cursor + 1;
        requireBoundary(end2, `Named async scope '{$${containerName}$'`);
        return makeAdvancedConstructorToken("{$", position, end2, { containerName });
      }
    }
    if (input[cursor] !== ":") {
      const { line: line2, col: col2 } = posToLineCol(input, position);
      throw new Error(`Async scope '{$' must be followed by a space, '$', 'name$', or a ':' option header ending in '$' at line ${line2}:${col2}`);
    }
    cursor++;
    const optionsStart = cursor;
    while (cursor < input.length && input[cursor] !== "$")
      cursor++;
    if (input[cursor] !== "$") {
      const { line: line2, col: col2 } = posToLineCol(input, position);
      throw new Error(`Async scope option header must end in '$' at line ${line2}:${col2}`);
    }
    const rawOptions = input.slice(optionsStart, cursor);
    const parsePositive = (raw, label) => {
      if (!/^\d+$/.test(raw)) {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Async ${label} must be a positive integer at line ${line2}:${col2}`);
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 1) {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Invalid async ${label} '${raw}' at line ${line2}:${col2}`);
      }
      return value;
    };
    let asyncLimit;
    let asyncTimeout;
    const pieces = rawOptions.split(",").map((piece) => piece.trim());
    const keyed = pieces.some((piece) => piece.includes("="));
    if (keyed) {
      if (pieces.some((piece) => !piece.includes("="))) {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Async scope options cannot mix keyed and positional fields at line ${line2}:${col2}`);
      }
      const seen = new Set;
      for (const piece of pieces) {
        const match = piece.match(/^(limit|timeout)\s*=\s*(\d+)$/i);
        if (!match) {
          const { line: line2, col: col2 } = posToLineCol(input, position);
          throw new Error(`Malformed async scope option '${piece}' at line ${line2}:${col2}`);
        }
        const key = match[1].toLowerCase();
        if (seen.has(key)) {
          const { line: line2, col: col2 } = posToLineCol(input, position);
          throw new Error(`Duplicate async scope option '${key}' at line ${line2}:${col2}`);
        }
        seen.add(key);
        if (key === "limit")
          asyncLimit = parsePositive(match[2], "concurrency limit");
        else
          asyncTimeout = parsePositive(match[2], "timeout");
      }
    } else {
      if (pieces.length > 2 || pieces.length === 0 || pieces.length === 1 && pieces[0] === "") {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Async positional header expects limit and optional timeout at line ${line2}:${col2}`);
      }
      if (pieces[0] !== "")
        asyncLimit = parsePositive(pieces[0], "concurrency limit");
      if (pieces.length > 1) {
        if (pieces[1] === "") {
          const { line: line2, col: col2 } = posToLineCol(input, position);
          throw new Error(`Async timeout cannot be omitted after ',' at line ${line2}:${col2}`);
        }
        asyncTimeout = parsePositive(pieces[1], "timeout");
      }
      if (asyncLimit === undefined && asyncTimeout === undefined) {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Async scope header must specify a limit or timeout at line ${line2}:${col2}`);
      }
    }
    if (asyncLimit === undefined && asyncTimeout === undefined) {
      const { line: line2, col: col2 } = posToLineCol(input, position);
      throw new Error(`Async scope header must specify a limit or timeout at line ${line2}:${col2}`);
    }
    const end = cursor + 1;
    requireBoundary(end, "Async scope header");
    return makeAdvancedConstructorToken("{$", position, end, {
      containerName,
      ...asyncLimit !== undefined ? { asyncLimit } : {},
      ...asyncTimeout !== undefined ? { asyncTimeout } : {}
    });
  }
  if (input.slice(position + 1).startsWith("=..")) {
    const after = input[position + 4];
    if (!isWhitespace(after) && after !== "}") {
      const { line: line2, col: col2 } = posToLineCol(input, position);
      throw new Error(`Brace array alias '{=..' must be followed by a space or '}' at line ${line2}:${col2}`);
    }
    return makeAdvancedConstructorToken("{..", position, position + 4, {
      destructureAlias: true
    });
  }
  if (input.slice(position + 1).startsWith("=:")) {
    let cursor = position + 3;
    let name = "";
    while (cursor < input.length && /[0-9x]/i.test(input[cursor])) {
      name += input[cursor];
      cursor++;
    }
    if (name.length > 0 && input[cursor] === ":") {
      const after = input[cursor + 1];
      if (!isWhitespace(after) && after !== "/" && after !== "}") {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Brace tensor alias '{=:${name}:' must be followed by a space, header, or '}' at line ${line2}:${col2}`);
      }
      return makeAdvancedConstructorToken("{:", position, cursor + 1, {
        containerName: name.toLowerCase(),
        destructureAlias: true
      });
    }
  }
  if (input.slice(position + 1).startsWith("..")) {
    const after = input[position + 3];
    if (!isWhitespace(after) && after !== "}") {
      const { line: line2, col: col2 } = posToLineCol(input, position);
      throw new Error(`Brace array '{..' must be followed by a space or '}' at line ${line2}:${col2}`);
    }
    return makeAdvancedConstructorToken("{..", position, position + 3);
  }
  const operatorSequences = ["&&", "||", "\\/", "/\\", "++", "<<", ">>", "+", "*"];
  for (const seq of operatorSequences) {
    if (input.slice(position + 1).startsWith(seq)) {
      const after = input[position + 1 + seq.length];
      if (!isWhitespace(after)) {
        const { line: line2, col: col2 } = posToLineCol(input, position);
        throw new Error(`Operator brace '{${seq}' must be followed by a space at line ${line2}:${col2}`);
      }
      return {
        type: "Symbol",
        original: "{" + seq,
        value: "{" + seq,
        pos: [position, position, position + 1 + seq.length]
      };
    }
  }
  const sigilChars = new Set(["@", ";", "|", ":", "=", "?", "$", "#", "^", ">"]);
  if (sigilChars.has(ch)) {
    const sigil = ch;
    const after = input[position + 2];
    if (sigil === "#") {
      const specHeader = tryMatchSystemSpecHeader(input, position);
      if (specHeader) {
        return specHeader;
      }
    }
    if (isWhitespace(after) || after === "/") {
      return {
        type: "Symbol",
        original: "{" + sigil,
        value: "{" + sigil,
        containerName: null,
        pos: [position, position, position + 2]
      };
    }
    if (sigil === "@") {
      const loopHeader = tryMatchLoopHeader(input, position);
      if (loopHeader) {
        return loopHeader;
      }
    }
    if (after !== undefined && /[a-zA-Z0-9_]/.test(after)) {
      let nameLen = 0;
      while (position + 2 + nameLen < input.length && /[a-zA-Z0-9_]/.test(input[position + 2 + nameLen])) {
        nameLen++;
      }
      const name = input.slice(position + 2, position + 2 + nameLen);
      const closingSigilPos = position + 2 + nameLen;
      if (input[closingSigilPos] === sigil) {
        const afterName = input[closingSigilPos + 1];
        if (!isWhitespace(afterName) && afterName !== "}") {
          const { line: line4, col: col4 } = posToLineCol(input, position);
          throw new Error(`Named container '{${sigil}${name}${sigil}' must be followed by a space or '}' at line ${line4}:${col4}`);
        }
        const tokenLen = 1 + 1 + nameLen + 1;
        return {
          type: "Symbol",
          original: "{" + sigil + name + sigil,
          value: "{" + sigil,
          containerName: name.toLowerCase(),
          pos: [position, position, position + tokenLen]
        };
      }
      const { line: line3, col: col3 } = posToLineCol(input, position);
      throw new Error(`Brace sigil '{${sigil}' must be followed by a space or 'name${sigil}' (e.g. '{${sigil}myname${sigil} ...') at line ${line3}:${col3}`);
    }
    const { line: line2, col: col2 } = posToLineCol(input, position);
    throw new Error(`Brace sigil '{${sigil}' must be followed by a space or a name (e.g. '{${sigil} ...' or '{${sigil}myname${sigil} ...') at line ${line2}:${col2}`);
  }
  if (isWhitespace(ch)) {
    return {
      type: "Symbol",
      original: "{",
      value: "{",
      pos: [position, position, position + 1]
    };
  }
  if (ch === "!" || ch === "}" || ch === undefined || ch >= "0" && ch <= "9") {
    return null;
  }
  const { line, col } = posToLineCol(input, position);
  throw new Error(`'{' must be followed by a space, a sigil (@;|:=?$#^>), or an operator (+, *, &&, ||, \\/, /\\, ++, <<, >>) at line ${line}:${col}`);
}
function tryMatchSystemSpecHeader(input, position) {
  const start = position + 2;
  const first = input[start];
  if (first === "}" || first === undefined || first === " " || first === "\t" || first === `
` || first === "\r") {
    return {
      type: "Symbol",
      original: "{#",
      value: "{#",
      specHeaderPresent: false,
      specInputs: [],
      specOutputs: [],
      specOutputsDeclared: false,
      pos: [position, position, position + 2]
    };
  }
  const identityMatch = input.slice(start).match(/^([\p{L}_][\p{L}\p{N}_]*)\}/u);
  if (identityMatch) {
    const name = normalizeIdentifierValue(identityMatch[1]);
    return {
      type: "Symbol",
      original: input.slice(position, start + identityMatch[1].length),
      value: "{#",
      specHeaderPresent: true,
      specIdentity: true,
      specInputs: [name],
      specOutputs: [],
      specOutputsDeclared: false,
      pos: [position, position, start + identityMatch[1].length]
    };
  }
  const closing = input.indexOf("#", start);
  if (closing === -1) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`System spec header must end with '#' at line ${line}:${col}`);
  }
  const after = input[closing + 1];
  if (!(after === "}" || after === undefined || after === " " || after === "\t" || after === `
` || after === "\r")) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`System spec header must be followed by a space or '}' at line ${line}:${col}`);
  }
  const rawHeader = input.slice(start, closing);
  const colonCount = (rawHeader.match(/:/g) || []).length;
  if (colonCount > 1) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Malformed system spec header '${rawHeader}' at line ${line}:${col}`);
  }
  const parseHeaderList = (text, label) => {
    const trimmed = text.trim();
    if (!trimmed)
      return [];
    return trimmed.split(",").map((piece) => {
      const name = piece.trim();
      if (!name) {
        const { line, col } = posToLineCol(input, position);
        throw new Error(`Malformed ${label} list in system spec header at line ${line}:${col}`);
      }
      if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) {
        const { line, col } = posToLineCol(input, position);
        throw new Error(`System spec ${label} must be bare identifiers; got '${name}' at line ${line}:${col}`);
      }
      return normalizeIdentifierValue(name);
    });
  };
  const pieces = rawHeader.split(":");
  const inputs = parseHeaderList(pieces[0] ?? "", "inputs");
  const outputs = parseHeaderList(pieces[1] ?? "", "outputs");
  return {
    type: "Symbol",
    original: input.slice(position, closing + 1),
    value: "{#",
    specHeaderPresent: true,
    specHeaderRaw: rawHeader,
    specInputs: inputs,
    specOutputs: outputs,
    specOutputsDeclared: pieces.length === 2,
    pos: [position, position, closing + 1]
  };
}
function tryMatchLoopHeader(input, position) {
  const start = position + 2;
  let cursor = start;
  let containerName = null;
  let loopMax;
  let unlimited = false;
  if (input[cursor] === ":") {
    cursor++;
  } else if (/[a-zA-Z0-9_]/.test(input[cursor] || "")) {
    const nameStart = cursor;
    while (cursor < input.length && /[a-zA-Z0-9_]/.test(input[cursor])) {
      cursor++;
    }
    containerName = input.slice(nameStart, cursor).toLowerCase();
    if (input[cursor] === "@") {
      return finalizeLoopHeader(input, position, cursor + 1, {
        containerName,
        loopMax: undefined,
        unlimited: false
      });
    }
    if (input[cursor] !== ":") {
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Brace sigil '{@' must be followed by a space or a valid loop header ('{@name@', '{@:max@', '{@name:max@', '{@::@', '{@name::@') at line ${line}:${col}`);
    }
    cursor++;
  } else {
    return null;
  }
  if (input[cursor] === ":") {
    unlimited = true;
    cursor++;
    if (input[cursor] !== "@") {
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Unlimited loop header must end with '{@::@' or '{@name::@' at line ${line}:${col}`);
    }
    return finalizeLoopHeader(input, position, cursor + 1, {
      containerName,
      loopMax: undefined,
      unlimited
    });
  }
  const digitsStart = cursor;
  while (cursor < input.length && /[0-9]/.test(input[cursor])) {
    cursor++;
  }
  if (digitsStart === cursor) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Loop max must be a nonnegative integer literal at line ${line}:${col}`);
  }
  if (input[cursor] !== "@") {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Loop header max must end with '@' at line ${line}:${col}`);
  }
  const rawMax = input.slice(digitsStart, cursor);
  const parsedMax = Number(rawMax);
  if (!Number.isSafeInteger(parsedMax) || parsedMax < 0) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Invalid loop max '${rawMax}' at line ${line}:${col}`);
  }
  return finalizeLoopHeader(input, position, cursor + 1, {
    containerName,
    loopMax: parsedMax,
    unlimited: false
  });
}
function finalizeLoopHeader(input, position, end, options) {
  const after = input[end];
  if (!(after === "}" || after === undefined || after === " " || after === "\t" || after === `
` || after === "\r")) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Loop header must be followed by a space or '}' at line ${line}:${col}`);
  }
  return {
    type: "Symbol",
    original: input.slice(position, end),
    value: "{@",
    containerName: options.containerName ?? null,
    ...options.loopMax !== undefined ? { loopMax: options.loopMax } : {},
    ...options.unlimited ? { loopUnlimited: true } : {},
    pos: [position, position, end]
  };
}
function tryMatchSymbol(input, position) {
  const remaining = input.slice(position);
  if (/^\/(?:==|:=|~=|::=|~~=)\s*\/(?=[\s}])/.test(remaining)) {
    return {
      type: "Symbol",
      original: "/",
      value: "/",
      pos: [position, position, position + 1]
    };
  }
  for (const symbol of symbols) {
    if (remaining.startsWith(symbol)) {
      return {
        type: "Symbol",
        original: symbol,
        value: symbol,
        pos: [position, position, position + symbol.length]
      };
    }
  }
  if (remaining.length > 0) {
    const char = remaining[0];
    if (!/[\w\s\p{L}\p{N}]/u.test(char)) {
      return {
        type: "Symbol",
        original: char,
        value: char,
        pos: [position, position, position + 1]
      };
    }
  }
  return null;
}
function tryMatchOuterIdentifier(input, position) {
  const remaining = input.slice(position);
  if (remaining.startsWith("@_"))
    return null;
  if (remaining.startsWith("@") && remaining.length > 1 && identifierStart.test(remaining[1])) {
    let length = 2;
    while (length < remaining.length && identifierPart.test(remaining[length])) {
      length++;
    }
    const original = remaining.slice(0, length);
    const name = remaining.slice(1, length);
    let firstLetter = null;
    for (let i = 0;i < name.length; i++) {
      if (/[\p{L}]/u.test(name[i])) {
        firstLetter = name[i];
        break;
      }
    }
    const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
    const kind = isCapital ? "System" : "User";
    const value = isCapital ? name.toUpperCase() : name.toLowerCase();
    return {
      type: "OuterIdentifier",
      original,
      value,
      kind,
      pos: [position, position, position + length]
    };
  }
  return null;
}
function tryMatchRegexLiteral(input, position) {
  const remaining = input.slice(position);
  if (remaining.startsWith("{/\\")) {
    let i = 3;
    let inEscape2 = false;
    let foundUnescapedSlash = false;
    while (i < remaining.length && remaining[i] !== "}") {
      const ch = remaining[i];
      if (inEscape2) {
        inEscape2 = false;
      } else if (ch === "\\") {
        inEscape2 = true;
      } else if (ch === "/") {
        foundUnescapedSlash = true;
        break;
      }
      i++;
    }
    if (!foundUnescapedSlash)
      return null;
  }
  const startMatch = remaining.match(/^\{\s*\//);
  if (!startMatch)
    return null;
  const contentStart = startMatch[0].length;
  let searchPos = contentStart;
  let inEscape = false;
  let patternEnd = -1;
  while (searchPos < remaining.length) {
    const char = remaining[searchPos];
    if (inEscape) {
      inEscape = false;
    } else if (char === "\\") {
      inEscape = true;
    } else if (char === "/") {
      patternEnd = searchPos;
      break;
    }
    searchPos++;
  }
  if (patternEnd === -1) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Unterminated regex literal at line ${line}:${col}. Expected closing '/'.`);
  }
  const pattern = remaining.slice(contentStart, patternEnd);
  searchPos = patternEnd + 1;
  let flagsStart = searchPos;
  while (searchPos < remaining.length) {
    const char = remaining[searchPos];
    if (char === "}") {
      break;
    }
    searchPos++;
  }
  if (searchPos >= remaining.length || remaining[searchPos] !== "}") {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Unterminated regex literal at line ${line}:${col}. Expected closing '}'.`);
  }
  const flagsAndModeStr = remaining.slice(flagsStart, searchPos).trim();
  let flags = "";
  let mode = "ONE";
  if (flagsAndModeStr.length > 0) {
    const lastChar = flagsAndModeStr[flagsAndModeStr.length - 1];
    let flagsStr = flagsAndModeStr;
    if (lastChar === "?") {
      mode = "TEST";
      flagsStr = flagsAndModeStr.slice(0, -1);
    } else if (lastChar === "*") {
      mode = "ALL";
      flagsStr = flagsAndModeStr.slice(0, -1);
    } else if (lastChar === ":") {
      mode = "ITER";
      flagsStr = flagsAndModeStr.slice(0, -1);
    }
    flags = flagsStr.trim();
    if (flags.length > 0 && !/^[a-zA-Z]*$/.test(flags)) {
      if (remaining.startsWith("{/\\"))
        return null;
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Invalid modifier or flag in regex literal at line ${line}:${col}.`);
    }
  }
  const endPosition = searchPos + 1;
  const original = remaining.slice(0, endPosition);
  return {
    type: "RegexLiteral",
    original,
    pattern,
    flags,
    mode,
    pos: [position, position, position + original.length]
  };
}

// src/parser/custom-operators.js
var BUILTIN_PRECEDENCE_BANDS = Object.freeze({
  assignment: 10,
  pipe: 20,
  arrow: 25,
  logical_or: 30,
  logical_and: 40,
  condition: 45,
  equality: 50,
  comparison: 60,
  interval: 70,
  conversion: 75,
  additive: 80,
  multiplicative: 90,
  power: 100,
  calculus: 115,
  postfix: 120,
  property: 130
});
var BAND_ALIASES = Object.freeze({
  addition: "additive",
  multiplication: "multiplicative",
  exponentiation: "power",
  exponential: "power",
  logicalor: "logical_or",
  logicaland: "logical_and"
});
var FIXITIES = new Set(["infix", "prefix", "postfix"]);
var ASSOCIATIVITIES = new Set(["left", "right", "none"]);
var RELATIONS = new Set(["above", "below"]);
var OPERATOR_TOKEN = /^:<([^<>:\s]+)>:$/u;
var WORD_TOKEN = /^:([\p{L}_][\p{L}\p{N}_-]*)$/u;
var TARGET_TOKEN = /^(?:[\p{L}_][\p{L}\p{N}_]*|\.[\p{L}_][\p{L}\p{N}_]*\.[\p{L}_][\p{L}\p{N}_]*)$/u;
function normalizedBand(name) {
  const normalized = String(name).toLowerCase().replace(/-/g, "_");
  return BAND_ALIASES[normalized] || normalized;
}
function relativePrecedence(band, relation) {
  const value = BUILTIN_PRECEDENCE_BANDS[band];
  if (value === undefined)
    throw new Error(`Unknown precedence band ':${band}'`);
  const boundaries = Array.from(new Set([
    ...Object.values(BUILTIN_PRECEDENCE_BANDS),
    95,
    97,
    99
  ])).sort((left, right) => left - right);
  const index = boundaries.indexOf(value);
  if (relation === "above") {
    const next = boundaries[index + 1];
    if (next === undefined)
      throw new Error(`Cannot place an operator above ':${band}'`);
    return (value + next) / 2;
  }
  const previous = boundaries[index - 1];
  if (previous === undefined)
    throw new Error(`Cannot place an operator below ':${band}'`);
  return (previous + value) / 2;
}
function declarationError(label, line, message) {
  throw new Error(`${label}:${line}: ${message}`);
}
function normalizedIdentifier(name) {
  const firstLetter = Array.from(String(name)).find((character) => /\p{L}/u.test(character));
  if (!firstLetter)
    return name;
  return firstLetter === firstLetter.toUpperCase() ? String(name).toUpperCase() : String(name).toLowerCase();
}
function parseTarget(rawTarget, owner, label, line) {
  if (!TARGET_TOKEN.test(rawTarget)) {
    declarationError(label, line, `Invalid operator target '${rawTarget}'`);
  }
  if (rawTarget.startsWith(".")) {
    const [, mount, method] = rawTarget.split(".");
    return {
      kind: "system-method",
      mount: normalizedIdentifier(mount),
      method: normalizedIdentifier(method)
    };
  }
  if (owner?.pluginId) {
    return {
      kind: "plugin-method",
      pluginId: owner.pluginId,
      mount: owner.mount || null,
      method: normalizedIdentifier(rawTarget)
    };
  }
  return { kind: "function", name: normalizedIdentifier(rawTarget) };
}
function parseOperatorDeclarationLine(source, options = {}) {
  const label = options.label || "OPS";
  const line = options.line || 1;
  const fields = String(source).trim().split(/\s+/).filter(Boolean);
  let symbol = null;
  let target = null;
  let fixity = null;
  let associativity = null;
  let relation = null;
  let band = null;
  for (const field of fields) {
    const operatorMatch = field.match(OPERATOR_TOKEN);
    if (operatorMatch) {
      if (symbol !== null)
        declarationError(label, line, "Operator declaration has more than one :<...>: symbol");
      symbol = operatorMatch[1];
      continue;
    }
    const wordMatch = field.match(WORD_TOKEN);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      if (FIXITIES.has(word)) {
        if (fixity !== null)
          declarationError(label, line, "Operator declaration has more than one fixity");
        fixity = word;
      } else if (ASSOCIATIVITIES.has(word)) {
        if (associativity !== null)
          declarationError(label, line, "Operator declaration has more than one associativity");
        associativity = word;
      } else if (RELATIONS.has(word)) {
        if (relation !== null)
          declarationError(label, line, "Operator declaration has more than one precedence relation");
        relation = word;
      } else {
        const candidate = normalizedBand(word);
        if (!Object.hasOwn(BUILTIN_PRECEDENCE_BANDS, candidate)) {
          declarationError(label, line, `Unknown operator modifier '${field}'`);
        }
        if (band !== null)
          declarationError(label, line, "Operator declaration has more than one precedence band");
        band = candidate;
      }
      continue;
    }
    if (target !== null)
      declarationError(label, line, `Unexpected operator declaration field '${field}'`);
    target = field;
  }
  if (symbol === null)
    declarationError(label, line, "Operator declaration requires one :<...>: symbol");
  if (target === null)
    declarationError(label, line, "Operator declaration requires one function or method target");
  if (fixity === null)
    declarationError(label, line, "Operator declaration requires a fixity such as :infix");
  if (fixity !== "infix")
    declarationError(label, line, `Custom ${fixity} operators are not implemented yet`);
  if (band === null)
    declarationError(label, line, "Operator declaration requires a named precedence band");
  if (associativity === null)
    declarationError(label, line, "Operator declaration requires :left, :right, or :none");
  const precedence = relation ? relativePrecedence(band, relation) : BUILTIN_PRECEDENCE_BANDS[band];
  return Object.freeze({
    symbol,
    spelling: `:<${symbol}>:`,
    target: Object.freeze(parseTarget(target, options.owner, label, line)),
    fixity,
    associativity,
    precedence,
    precedenceBand: band,
    precedenceRelation: relation,
    source: label,
    line
  });
}
function isOpsComment(token) {
  return token?.type === "String" && token.kind === "comment" && /^\s*##ops##/i.test(token.original || "");
}
function extractOperatorDeclarations(tokens, options = {}) {
  const definitions = new Map;
  let reachedCode = false;
  for (const token of tokens || []) {
    if (token.type === "End")
      break;
    if (token.type !== "String" || token.kind !== "comment") {
      reachedCode = true;
      continue;
    }
    if (!isOpsComment(token))
      continue;
    if (reachedCode) {
      throw new Error(`${options.label || "source"}: ##OPS## blocks must appear before executable code`);
    }
    const bodyStart = token.pos?.[1] || 0;
    const firstLine = options.source ? options.source.slice(0, bodyStart).split(`
`).length : 1;
    const lines = String(token.value || "").replace(/\r/g, "").split(`
`);
    for (let index = 0;index < lines.length; index += 1) {
      const text = lines[index].trim();
      if (!text)
        continue;
      const definition = parseOperatorDeclarationLine(text, {
        owner: options.owner,
        label: options.label || "OPS",
        line: firstLine + index
      });
      if (definitions.has(definition.symbol)) {
        declarationError(options.label || "OPS", firstLine + index, `Duplicate operator '${definition.spelling}'`);
      }
      definitions.set(definition.symbol, definition);
    }
  }
  return definitions;
}
function mergeOperatorDefinitions(...collections) {
  const merged = new Map;
  for (const collection of collections) {
    if (!collection)
      continue;
    const entries = collection instanceof Map ? collection : collection.map ? collection.map((definition) => [definition.symbol, definition]) : Object.entries(collection);
    for (const [symbol, definition] of entries) {
      if (merged.has(symbol)) {
        const previous = merged.get(symbol);
        if (JSON.stringify(previous) !== JSON.stringify(definition)) {
          throw new Error(`Conflicting definitions for custom operator ':<${symbol}>:'`);
        }
        continue;
      }
      merged.set(symbol, definition);
    }
  }
  return merged;
}

// src/parser/parser.js
var PRECEDENCE = {
  STATEMENT: 0,
  ASSIGNMENT: 10,
  PIPE: 20,
  ARROW: 25,
  LOGICAL_OR: 30,
  LOGICAL_AND: 40,
  CONDITION: 45,
  EQUALITY: 50,
  COMPARISON: 60,
  INTERVAL: 70,
  CONVERSION: 75,
  ADDITION: 80,
  MULTIPLICATION: 90,
  EXPONENTIATION: 100,
  UNARY: 99,
  CALCULUS: 115,
  CHECK: 9,
  POSTFIX: 120,
  PROPERTY: 130
};
var JUXTAPOSITION_PRECEDENCE = 95;
var IMPLICIT_APPLICATION_PRECEDENCE = 97;
var SYMBOL_TABLE = {
  ":=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":<:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":>:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":<=:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":>=:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "|>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "||>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|:>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>&&": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>||": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>_": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>!": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|><": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>/|": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>#|": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>//": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>/": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|<>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|+": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|*": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|;": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|^": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "+=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "-=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "*=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "++=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "/=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "//=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "/\\=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "/^=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "/~=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "%=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "^=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "**=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "\\/=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "\\=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "~=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "::=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "~~=": { precedence: PRECEDENCE.ASSIGNMENT, associativity: "right", type: "infix" },
  "=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "!=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix"
  },
  "==": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix"
  },
  "===": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix"
  },
  "?=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "right",
    type: "infix"
  },
  "<": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  ">": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "<=": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  ">=": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "?&": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "!?": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "&&": {
    precedence: PRECEDENCE.LOGICAL_AND,
    associativity: "left",
    type: "infix"
  },
  "||": {
    precedence: PRECEDENCE.LOGICAL_OR,
    associativity: "left",
    type: "infix"
  },
  "?|": {
    precedence: PRECEDENCE.LOGICAL_OR,
    associativity: "left",
    type: "infix"
  },
  ":": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":+": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  "::": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":/:": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":~": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":~/": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":%": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  ":/%": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  "::+": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix"
  },
  "+": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
    prefix: true
  },
  "@@": {
    precedence: PRECEDENCE.UNARY,
    associativity: "right",
    type: "prefix"
  },
  "-": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
    prefix: true
  },
  "\\": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix"
  },
  "\\/": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix"
  },
  "++": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix"
  },
  "<>": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix"
  },
  "_>": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix"
  },
  "<_": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix"
  },
  "~:": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix"
  },
  "~!:": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix"
  },
  "*": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "/": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "//": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "%": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "/\\": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "**": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "/^": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "/~": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "/%": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix"
  },
  "!": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix"
  },
  "!!": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix"
  },
  "^": {
    precedence: PRECEDENCE.EXPONENTIATION,
    associativity: "right",
    type: "infix"
  },
  "->": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },
  "=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "^=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":->": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "?-": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },
  "?!-": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },
  "?": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "left",
    type: "infix"
  },
  "??": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "right",
    type: "infix"
  },
  "?:": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "right",
    type: "infix"
  },
  ".": {
    precedence: PRECEDENCE.PROPERTY,
    associativity: "left",
    type: "infix"
  },
  ".=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "@": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix"
  },
  "~[": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix"
  },
  "~{": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix"
  },
  "'": {
    precedence: PRECEDENCE.CALCULUS,
    associativity: "left",
    type: "calculus"
  },
  "(": { precedence: 0, type: "grouping" },
  ")": { precedence: 0, type: "grouping" },
  "[": { precedence: PRECEDENCE.POSTFIX, type: "postfix" },
  "^^": { precedence: PRECEDENCE.POSTFIX, type: "postfix" },
  "]": { precedence: 0, type: "grouping" },
  "{": { precedence: 0, type: "grouping" },
  "}": { precedence: 0, type: "grouping" },
  "{=": { precedence: 0, type: "brace_sigil" },
  "{?": { precedence: 0, type: "brace_sigil" },
  "{;": { precedence: 0, type: "brace_sigil" },
  "{|": { precedence: 0, type: "brace_sigil" },
  "{:": { precedence: 0, type: "brace_sigil" },
  "{..": { precedence: 0, type: "brace_sigil" },
  "{@": { precedence: 0, type: "brace_sigil" },
  "{#": { precedence: 0, type: "brace_sigil" },
  "{$": { precedence: 0, type: "brace_sigil" },
  "{^": { precedence: 0, type: "brace_sigil" },
  "{>": { precedence: 0, type: "brace_sigil" },
  "{!": { precedence: 0, type: "brace_sigil" },
  "..": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "infix" },
  ".|": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "postfix" },
  "|.": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "postfix" },
  ",": { precedence: 5, associativity: "left", type: "infix" },
  ";": {
    precedence: PRECEDENCE.STATEMENT,
    associativity: "left"
  },
  "|": { precedence: 0, type: "separator" },
  "|}": { precedence: 0, type: "separator" }
};

class Parser {
  constructor(tokens, systemLookup, source = "", customOperators = new Map) {
    this.tokens = tokens;
    this.systemLookup = systemLookup || (() => ({ type: "identifier" }));
    this.source = source;
    this.customOperators = customOperators;
    this.position = 0;
    this.current = null;
    this.skippedComments = [];
    this.stopExpressionAtOffset = null;
    this.disablePostfixCheckParsing = false;
    this.advance();
  }
  advance() {
    do {
      if (this.position < this.tokens.length) {
        this.current = this.tokens[this.position];
        this.position++;
      } else {
        this.current = {
          type: "End",
          value: null,
          pos: [this.tokens.length, this.tokens.length, this.tokens.length]
        };
        break;
      }
      if (this.current.type === "String" && this.current.kind === "comment") {
        this.skippedComments.push(this.current);
      }
    } while (this.current.type === "String" && this.current.kind === "comment");
    return this.current;
  }
  peek() {
    let tempPos = this.position;
    while (tempPos < this.tokens.length) {
      const token = this.tokens[tempPos];
      if (token.type === "String" && token.kind === "comment") {
        tempPos++;
        continue;
      }
      return token;
    }
    return { type: "End", value: null };
  }
  createNode(type, properties = {}) {
    const node = {
      type,
      pos: properties.pos || this.current.pos,
      original: properties.original || this.current.original,
      ...properties
    };
    return node;
  }
  error(message) {
    const pos = this.current ? this.current.pos : [0, 0, 0];
    if (this.source) {
      const { line, col } = posToLineCol(this.source, pos[0]);
      throw new Error(`Parse error at line ${line}, column ${col} (position ${pos[0]}): ${message}`);
    }
    throw new Error(`Parse error at position ${pos[0]}: ${message}`);
  }
  getSymbolInfo(token) {
    if (token.type === "CustomOperator") {
      const definition = this.customOperators.get(token.value);
      if (!definition) {
        this.error(`Custom operator ':<${token.value}>:' is not declared in an ##OPS## header`);
      }
      return {
        precedence: definition.precedence,
        associativity: definition.associativity,
        type: definition.fixity,
        custom: definition
      };
    } else if (token.type === "Symbol") {
      if (token.value === "|^:") {
        this.error("The legacy '|^:' generator operator was removed; use '|^' for lazy generation");
      }
      if (token.value === ":=:") {
        this.error("The ':=:' solve operator was removed; express symbolic constraints with {# ... } and solve them with a plugin");
      }
      return SYMBOL_TABLE[token.value] || { precedence: 0, type: "unknown" };
    } else if (token.type === "SemicolonSequence") {
      return { precedence: 0, type: "separator" };
    } else if (token.type === "Identifier" && token.kind === "System") {
      const systemInfo = this.systemLookup(token.value);
      if (systemInfo.type === "operator") {
        return {
          precedence: systemInfo.precedence || PRECEDENCE.MULTIPLICATION,
          associativity: systemInfo.associativity || "left",
          type: systemInfo.operatorType || "infix"
        };
      }
    }
    return null;
  }
  isCallableNode(node) {
    if (node.type === "SystemIdentifier") {
      const info = node.systemInfo;
      if (!info)
        return true;
      if (info.type === "operator" || info.type === "constant")
        return false;
      return true;
    }
    if (node.type === "SystemFunctionRef")
      return true;
    if (node.type === "FunctionLambda")
      return true;
    if (node.type === "MethodLift")
      return true;
    if (node.type === "ImplicitApplication")
      return true;
    if (node.type === "FunctionCall")
      return true;
    if (node.type === "SystemAccess") {
      return !node.systemPathInfo || node.systemPathInfo.kind === "function";
    }
    if (node.type === "DotAccess") {
      return node.systemPathInfo?.kind === "function";
    }
    if (node.type === "SystemCall")
      return true;
    if (node.type === "Call")
      return true;
    if (node.type === "MethodCall")
      return true;
    if (node.type === "Grouping" && node.expression)
      return this.isCallableNode(node.expression);
    return false;
  }
  parseMethodName() {
    if (this.current.type !== "Identifier") {
      this.error("Expected property name after '.'");
    }
    const baseName = this.current.value;
    const baseOriginal = this.current.original;
    this.advance();
    if (this.current.value === "!") {
      const bangOriginal = this.current.original;
      this.advance();
      return { name: baseName + "!", original: baseOriginal + bangOriginal };
    }
    return { name: baseName, original: baseOriginal };
  }
  resolveSystemRoot(name) {
    return this.systemLookup?.resolveSystemRoot?.(name) || null;
  }
  resolveSystemMember(parent, name) {
    return this.systemLookup?.resolveSystemMember?.(parent, name) || null;
  }
  validateKnownSystemCallable(target) {
    if (target?.systemPathInfo && target.systemPathInfo.kind !== "function") {
      this.error(`System ${target.systemPathInfo.kind} '${target.systemPathInfo.displayName}' is not callable`);
    }
  }
  canStartImplicitOperand() {
    const t = this.current;
    if (t.type === "End")
      return false;
    if (t.type === "Number")
      return true;
    if (t.type === "Identifier") {
      if (t.kind === "System") {
        const info = this.systemLookup(t.value);
        if (info && info.type === "operator")
          return false;
      }
      return true;
    }
    if (t.type === "PlaceHolder")
      return true;
    if (t.type === "OuterIdentifier")
      return true;
    if (t.type === "String" && t.kind !== "comment")
      return true;
    if (t.type === "Symbol" && t.value === "(")
      return true;
    return false;
  }
  parseExpression(minPrec = 0) {
    const left = this.parsePrefix();
    return this.parseExpressionRec(left, minPrec, false);
  }
  parseCommaSequenceExpression(minPrec = 0) {
    const expressions = [this.parseExpression(minPrec)];
    while (this.current.value === ",") {
      this.advance();
      if (this.current.value === ";" || this.current.value === "}" || this.current.type === "SemicolonSequence" || this.current.type === "End") {
        break;
      }
      expressions.push(this.parseExpression(minPrec));
    }
    if (expressions.length === 1) {
      return expressions[0];
    }
    const first = expressions[0];
    const last = expressions[expressions.length - 1];
    return this.createNode("SequenceExpression", {
      expressions,
      pos: first.pos,
      original: expressions.map((expr) => expr.original || "").join(","),
      end: last.pos?.[2]
    });
  }
  parsePrefix() {
    const token = this.current;
    switch (token.type) {
      case "Number":
        this.advance();
        return this.createNode("Number", {
          value: token.value,
          original: token.original
        });
      case "String":
        this.advance();
        if (token.kind === "backtick") {
          return this.parseEmbeddedLanguage(token);
        } else {
          return this.createNode("String", {
            value: token.value,
            kind: token.kind,
            original: token.original
          });
        }
      case "RegexLiteral":
        this.advance();
        return this.createNode("RegexLiteral", {
          pattern: token.pattern,
          flags: token.flags,
          mode: token.mode,
          original: token.original
        });
      case "Identifier":
        this.advance();
        if (token.kind === "SystemFunction") {
          return this.createNode("SystemFunctionRef", {
            name: token.value,
            original: token.original
          });
        } else if (token.kind === "System") {
          const systemInfo = this.systemLookup(token.value);
          return this.createNode("SystemIdentifier", {
            name: token.value,
            systemInfo,
            original: token.original
          });
        } else {
          return this.createNode("UserIdentifier", {
            name: token.value,
            original: token.original
          });
        }
      case "OuterIdentifier":
        this.advance();
        return this.createNode("OuterIdentifier", {
          name: token.value,
          original: token.original
        });
      case "PlaceHolder":
        this.advance();
        return this.createNode("PlaceHolder", {
          place: token.place,
          original: token.original
        });
      case "Symbol":
        if (token.value === "...") {
          this.advance();
          const expr = this.parseExpression(PRECEDENCE.POSTFIX);
          return this.createNode("Spread", {
            expression: expr,
            pos: token.pos,
            original: token.original + (expr.original || "")
          });
        } else if (token.value === "(") {
          return this.parseGrouping();
        } else if (token.value === "|") {
          return this.parseAbsoluteValue();
        } else if (token.value === "[") {
          return this.parseArray();
        } else if (token.value === "<") {
          return this.parseAngleForm();
        } else if (token.value === "{") {
          return this.parseBraceContainer();
        } else if (token.value === "{=" || token.value === "{?" || token.value === "{;" || token.value === "{|" || token.value === "{:" || token.value === "{@" || token.value === "{#" || token.value === "{.." || token.value === "{>" || token.value === "{^" || token.value === "{$" || token.value === "{$$") {
          if (token.value === "{#") {
            return this.parseSystemSpecLiteral();
          }
          if (token.value === "{^") {
            return this.parseValueOutfit();
          }
          return this.parseBraceSigil(token.value, token.containerName ?? null, {
            loopMax: token.loopMax,
            loopUnlimited: token.loopUnlimited === true,
            asyncLimit: token.asyncLimit,
            asyncTimeout: token.asyncTimeout,
            destructureAlias: token.destructureAlias === true
          });
        } else if (token.value === "{+" || token.value === "{*" || token.value === "{&&" || token.value === "{||" || token.value === "{\\/" || token.value === "{/\\" || token.value === "{++" || token.value === "{<<" || token.value === "{>>") {
          return this.parseOperatorBrace(token.value);
        } else if (token.value === "{!") {
          return this.parseBreakBlock();
        } else if (token.value === "@@") {
          this.advance();
          const expr = this.parseExpression(PRECEDENCE.UNARY);
          return this.createNode("SystemCapabilityCall", {
            property: "EVAL",
            arguments: { positional: [expr], keyword: {}, metadata: {} },
            pos: token.pos,
            original: token.original + (expr.original || "")
          });
        } else if (token.value === "@") {
          this.advance();
          if (this.current.type === "String" && this.current.kind === "quote") {
            const template = this.current;
            this.advance();
            const delimiter = (template.original.match(/^"+/) || [""])[0].length;
            return this.createNode(delimiter >= 3 ? "DocumentTemplate" : "InterpolatedString", {
              body: template.value,
              delimiter,
              original: token.original + template.original
            });
          }
          const nextVal = this.current.value;
          if (nextVal === "{" || nextVal === "{;" || nextVal === "{?" || nextVal === "{=" || nextVal === "{|" || nextVal === "{:" || nextVal === "{@" || nextVal === "{#" || nextVal === "{$" || nextVal === "{$$" || nextVal === "{.." || nextVal === "{^" || nextVal === "{>") {
            let inner;
            if (nextVal === "{") {
              inner = this.parseBraceContainer();
            } else if (nextVal === "{#") {
              inner = this.parseSystemSpecLiteral();
            } else if (nextVal === "{^") {
              inner = this.parseValueOutfit();
            } else {
              inner = this.parseBraceSigil(nextVal, this.current.containerName ?? null, {
                loopMax: this.current.loopMax,
                loopUnlimited: this.current.loopUnlimited === true,
                asyncLimit: this.current.asyncLimit,
                asyncTimeout: this.current.asyncTimeout,
                destructureAlias: this.current.destructureAlias === true
              });
            }
            return this.createNode("DeferredBlock", {
              body: inner,
              pos: token.pos,
              original: token.original
            });
          }
          const operatorToSystem = {
            "+": "ADD",
            "-": "SUB",
            "*": "MUL",
            "/": "DIV",
            "//": "INTDIV",
            "%": "MOD",
            "^": "POW",
            "**": "POWPROD",
            "=": "EQ",
            "!=": "NEQ",
            "<": "LT",
            ">": "GT",
            "<=": "LTE",
            ">=": "GTE",
            "&&": "AND",
            "||": "OR",
            "!": "NOT"
          };
          if (operatorToSystem[nextVal]) {
            const opToken = this.current;
            this.advance();
            const sysName = operatorToSystem[nextVal];
            return this.createNode("SystemAccess", {
              property: sysName,
              original: token.original + opToken.original
            });
          }
          return this.createNode("UserIdentifier", {
            name: "@",
            original: token.original
          });
        } else if (token.value === "!!") {
          this.advance();
          const operand = this.parseExpression(PRECEDENCE.UNARY);
          const inner = this.createNode("UnaryOperation", {
            operator: "!",
            operand,
            pos: token.pos,
            original: "!" + (operand.original || "")
          });
          return this.createNode("UnaryOperation", {
            operator: "!",
            operand: inner,
            pos: token.pos,
            original: token.original + (operand.original || "")
          });
        } else if (token.value === "+" || token.value === "-" || token.value === "!") {
          return this.parseUnaryOperator();
        } else if (token.value === "'") {
          return this.parseIntegral();
        } else if (token.value === "..") {
          this.advance();
          if (this.current.type !== "Identifier") {
            this.error("Expected a method name after prefix '..'");
          }
          const method = this.parseMethodName();
          let arguments_ = { positional: [], keyword: {} };
          let end = this.current.pos?.[0] ?? token.pos?.[2];
          if (this.current.value === "(") {
            this.advance();
            arguments_ = this.parseFunctionCallArgs();
            if (this.current.value !== ")")
              this.error("Expected closing parenthesis in method lift");
            end = this.current.pos[2];
            this.advance();
          }
          return this.createNode("MethodLift", {
            method: method.name,
            arguments: arguments_,
            pos: [token.pos[0], token.pos[1], end],
            original: this.source.slice(token.pos[0], end)
          });
        } else if (token.value === ".") {
          this.advance();
          if (this.current.type === "Identifier") {
            const property = this.parseMethodName();
            const systemPathInfo = this.resolveSystemRoot(property.name);
            return this.createNode("SystemAccess", {
              property: property.name,
              ...systemPathInfo ? { systemPathInfo } : {},
              original: token.original + property.original
            });
          }
          return this.createNode("SystemObject", {
            original: token.original
          });
        } else if (token.value === "_") {
          this.advance();
          return this.createNode("NULL", {
            original: token.original
          });
        } else if (token.value === "$$") {
          this.advance();
          if (this.current.type === "Identifier" && token.pos?.[2] === this.current.pos?.[1]) {
            const identifier = this.current;
            this.advance();
            return this.createNode("ReactiveCellRef", {
              name: identifier.value,
              original: token.original + identifier.original
            });
          }
          return this.createNode("ParentSelfRef", {
            original: token.original
          });
        } else if (token.value === "$") {
          this.advance();
          if (this.current.value === "{" && token.pos?.[2] === this.current.pos?.[1]) {
            const body = this.parseBraceContainer();
            return this.createNode("ReactiveTransaction", {
              body,
              original: token.original + (body.original || "")
            });
          }
          if (this.current.type === "Identifier" && token.pos?.[2] === this.current.pos?.[1]) {
            const identifier = this.current;
            this.advance();
            return this.createNode("ReactiveRef", {
              name: identifier.value,
              original: token.original + identifier.original
            });
          }
          return this.createNode("SelfRef", {
            original: token.original
          });
        } else if (token.value === ":") {
          this.advance();
          if (this.current.type === "Identifier" || this.current.type === "Number") {
            const valToken = this.current;
            const rawText = valToken.original.trim();
            this.advance();
            return this.createNode("String", {
              value: rawText,
              kind: "colon",
              original: token.original + valToken.original
            });
          }
          this.error(`Expected identifier or number after ':' in colon-string`);
        } else {
          this.error(`Unexpected token in prefix position: ${token.value}`);
        }
        break;
      case "CustomOperator":
        this.error(`Custom infix operator ':<${token.value}>:' cannot appear in prefix position`);
        break;
      default:
        this.error(`Unexpected token: ${token.type}`);
    }
  }
  parseInfix(left, symbolInfo) {
    const operator = this.current;
    if (symbolInfo.type === "postfix" && (operator.value === "!" || operator.value === "!!")) {
      this.advance();
      return this.createNode(operator.value === "!" ? "Factorial" : "DoubleFactorial", {
        expression: left,
        pos: left.pos,
        original: (left.original || "") + operator.original
      });
    }
    if (operator.value === "(" && (left.type === "UserIdentifier" || left.type === "SystemIdentifier" || left.type === "SystemFunctionRef")) {
      if (left.type === "UserIdentifier" && /^[\p{L}]/u.test(left.name)) {
        const grouping = this.parseGrouping();
        return this.createNode("ImplicitMultiplication", {
          left,
          right: grouping,
          pos: left.pos,
          original: left.original + operator.original
        });
      }
      this.advance();
      const args = this.parseFunctionCallArgs();
      if (this.current.value !== ")") {
        this.error("Expected closing parenthesis in function call");
      }
      this.advance();
      if (left.type === "SystemFunctionRef") {
        return this.createNode("SystemCall", {
          name: left.name,
          arguments: args,
          pos: left.pos,
          original: left.original + operator.original
        });
      }
      return this.createNode("FunctionCall", {
        function: left,
        arguments: args,
        pos: left.pos,
        original: left.original + operator.original
      });
    }
    if (operator.value === "?-" || operator.value === "?!-") {
      this.advance();
      const strict = operator.value === "?!-";
      const first = this.current.value === "[" ? this.parseArray() : this.parseExpression(PRECEDENCE.INTERVAL + 1);
      if (this.current.value === ":") {
        this.advance();
        if (this.current.value !== "[") {
          this.error("Prepared trial checks must be written as an array literal: ?- pattern: [ ... ]");
        }
        const prep2 = this.parseArray();
        const pattern = this.convertExpressionToDestructureTarget(first);
        const gate = { pattern, prep: prep2, strict };
        if (left.type === "PreparedTrial") {
          return this.createNode("PreparedTrial", {
            candidate: left.candidate,
            gates: [...left.gates, gate],
            pos: left.pos,
            original: left.original + operator.original + (first.original || "") + (prep2.original || "")
          });
        }
        return this.createNode("PreparedTrial", {
          candidate: left,
          gates: [gate],
          pos: left.pos,
          original: left.original + operator.original + (first.original || "") + (prep2.original || "")
        });
      }
      const prep = first;
      if (!prep || prep.type !== "Array") {
        this.error("Function prep phase must be written as an array literal: ?- [ ... ]");
      }
      let variantName = null;
      if (this.current.value === "/") {
        variantName = this.parseFunctionVariantHeader();
      }
      if (!["->", "=>", "^=>"].includes(this.current.value)) {
        this.error("Expected '->', '=>', or '^=>' after function prep phase");
      }
      const arrow = this.current.value;
      this.advance();
      const body = this.parseExpression(PRECEDENCE.ARROW);
      const prepStrict = strict;
      const fnNode = this.buildFunctionArrowNode(left, arrow, body, {
        prep,
        prepStrict,
        variantName
      });
      if (fnNode) {
        return fnNode;
      }
      this.error("Prep phase can only be attached to a function definition or lambda");
    }
    if (operator.value === "/" && this.looksLikeFunctionVariantHeader() && this.canHaveFunctionVariantHeader(left)) {
      const variantName = this.parseFunctionVariantHeader();
      if (!["->", "=>", "^=>"].includes(this.current.value)) {
        this.error("Expected '->', '=>', or '^=>' after function variant name");
      }
      const arrow = this.current.value;
      this.advance();
      const body = this.parseExpression(PRECEDENCE.ARROW);
      const fnNode = this.buildFunctionArrowNode(left, arrow, body, { variantName });
      if (fnNode) {
        return fnNode;
      }
      this.error("Variant names can only be attached to a function definition or lambda");
    }
    this.advance();
    let rightPrec = symbolInfo.precedence;
    if (symbolInfo.associativity === "left" || symbolInfo.associativity === "none") {
      rightPrec += 1;
    }
    let right;
    if (operator.type === "CustomOperator") {
      right = this.parseExpression(rightPrec);
      return this.createNode("CustomOperator", {
        operator: operator.value,
        spelling: `:<${operator.value}>:`,
        definition: symbolInfo.custom,
        precedence: symbolInfo.precedence,
        associativity: symbolInfo.associativity,
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "[" && symbolInfo.type === "postfix") {
      if (this.current.value === ":" && ["Identifier", "Number", "String"].includes(this.peek().type)) {
        this.advance();
        const keyName = this.current.value;
        const keyOriginal = this.current.original;
        this.advance();
        if (this.current.value !== "]") {
          this.error("Expected ] after key literal");
        }
        this.advance();
        return this.createNode("PropertyAccess", {
          object: left,
          property: { type: "KeyLiteral", name: keyName, original: ":" + keyOriginal },
          pos: left.pos,
          original: left.original + operator.original
        });
      }
      return this.parseBracketIndex(left, operator);
    } else if (operator.value === "^^" && symbolInfo.type === "postfix") {
      return this.createNode("Transpose", {
        expression: left,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":->" || operator.value === "->" || operator.value === "=>" || operator.value === "^=>") {
      right = this.parseExpression(rightPrec);
      const fnNode = this.buildFunctionArrowNode(left, operator.value, right);
      if (fnNode) {
        return fnNode;
      }
      if (operator.value === "=>" || operator.value === "^=>") {
        this.error("Append/prepend syntax requires a named function signature like F(x) => body");
      }
    } else if (operator.value === "->") {
      right = this.parseExpression(rightPrec);
      if (left.type === "Grouping" && left.expression && left.expression.type === "ParameterList") {
        return this.createNode("FunctionLambda", {
          parameters: left.expression.parameters,
          prep: null,
          prepStrict: false,
          body: right,
          pos: left.pos,
          original: left.original + operator.original
        });
      }
      const lambdaParameters = this.extractLambdaParameters(left);
      if (lambdaParameters) {
        return this.createNode("FunctionLambda", {
          parameters: lambdaParameters,
          prep: null,
          prepStrict: false,
          body: right,
          pos: left.pos,
          original: left.original + operator.original
        });
      }
      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>_") {
      right = this.parseExpression(rightPrec);
      return this.createNode("ForEachPipe", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>!") {
      right = this.parseExpression(rightPrec);
      return this.createNode("ExpectedErrorPipe", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Pipe", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>/") {
      right = this.parseExpression(rightPrec);
      return this.createNode("SliceStrict", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>/|") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Split", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>#|") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Chunk", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>//") {
      right = this.parseExpression(rightPrec);
      return this.createNode("SliceClamp", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "||>") {
      right = this.parseExpression(rightPrec);
      return this.createNode("ExplicitPipe", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>>") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Map", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>?") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Filter", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>&&") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Every", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|>||") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Some", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|:>") {
      const startValue = this.parseExpression(rightPrec);
      const nextOp = this.current;
      if (nextOp.type !== "Symbol" || nextOp.value !== ">:") {
        this.error("Expected '>:' after start value in '|:>' reduce expression, found " + nextOp.value);
      } else {
        this.advance();
      }
      const fnExpr = this.parseExpression(rightPrec);
      return this.createNode("Reduce", {
        left,
        init: startValue,
        right: fnExpr,
        pos: left.pos,
        original: left.original + operator.original + startValue.original + (nextOp.value === ">:" ? nextOp.original : "") + fnExpr.original
      });
    } else if (operator.value === "|>:") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Reduce", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|><") {
      return this.createNode("Reverse", {
        target: left,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|<>") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Sort", {
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":+") {
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalStepping", {
        interval: left,
        step: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "::") {
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalDivision", {
        interval: left,
        count: right,
        divisionKind: "equally_spaced",
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":/:") {
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalPartition", {
        interval: left,
        count: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":~") {
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        this.error("':~' is the interval mediants operator. For semantic conversion, use '~:' as in 'x ~: :Type'.");
      }
      return this.createNode("IntervalMediants", {
        interval: left,
        levels: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":~/") {
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        this.error("':~/' is the interval mediant partition operator. For semantic conversion, use '~:' as in 'x ~: :Type'.");
      }
      return this.createNode("IntervalMediantPartition", {
        interval: left,
        levels: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":%") {
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalRandom", {
        interval: left,
        parameters: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":/%") {
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalRandomPartition", {
        interval: left,
        count: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "::+") {
      right = this.parseExpression(rightPrec);
      return this.createNode("InfiniteSequence", {
        start: left,
        step: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "??") {
      const trueExpr = this.parseExpression(PRECEDENCE.CONDITION + 5);
      if (this.current.value !== "?:") {
        this.error('Expected "?:" in ternary operator after true expression');
      }
      this.advance();
      const falseExpr = this.parseExpression(rightPrec);
      return this.createNode("TernaryOperation", {
        condition: left,
        trueExpression: trueExpr,
        falseExpression: falseExpr,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ".") {
      const property = this.parseMethodName();
      let systemPathInfo = null;
      if (left.systemPathInfo) {
        const resolution = this.resolveSystemMember(left.systemPathInfo, property.name);
        if (resolution?.state === "not-object") {
          this.error(`System ${left.systemPathInfo.kind} '${left.systemPathInfo.displayName}' has no members`);
        }
        if (resolution?.state === "unknown-member") {
          this.error(`Unknown system member '${left.systemPathInfo.displayName}.${property.name}'`);
        }
        if (resolution?.state === "resolved") {
          systemPathInfo = resolution.member;
        }
      }
      return this.createNode("DotAccess", {
        object: left,
        property: property.name,
        ...systemPathInfo ? { systemPathInfo } : {},
        pos: left.pos,
        original: left.original + operator.original + property.original
      });
    } else if (operator.value === "..") {
      if (this.current.type === "Identifier") {
        this.error("a..name is no longer supported; use a.name for meta property access");
      }
      return this.createNode("ExternalAccess", {
        object: left,
        property: null,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ".|") {
      return this.createNode("KeySet", {
        object: left,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "|.") {
      return this.createNode("ValueSet", {
        object: left,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "?") {
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        return this.createNode("SemanticHas", {
          expression: left,
          name: right.value,
          pos: left.pos,
          original: left.original + operator.original + right.original
        });
      }
      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "~:" || operator.value === "~!:") {
      right = this.parseExpression(rightPrec);
      if (!(right?.type === "String" && right.kind === "colon")) {
        this.error(`Semantic conversion target must be a colon-string like :rational after '${operator.value}'`);
      }
      return this.createNode(operator.value === "~:" ? "SemanticConvertSoft" : "SemanticConvertStrict", {
        expression: left,
        typeName: right.value,
        pos: left.pos,
        original: left.original + operator.original + right.original
      });
    } else {
      right = this.parseExpression(rightPrec);
      let assignmentLeft = left;
      if (this.isDirectAssignmentOperator(operator.value)) {
        const simpleLValueTypes = new Set([
          "UserIdentifier",
          "SystemIdentifier",
          "OuterIdentifier",
          "SystemAccess",
          "DotAccess",
          "PropertyAccess",
          "BracketIndex",
          "SelfRef",
          "ReactiveRef",
          "ReactiveCellRef",
          "Number"
        ]);
        if (!simpleLValueTypes.has(left?.type)) {
          try {
            assignmentLeft = this.convertExpressionToDestructureTarget(left);
          } catch (_error) {
            assignmentLeft = left;
          }
        }
      }
      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left: assignmentLeft,
        right,
        pos: left.pos,
        original: left.original + operator.original
      });
    }
  }
  parseGrouping() {
    const startToken = this.current;
    this.advance();
    if (this.current.value === ")") {
      this.advance();
      return this.createNode("Tuple", {
        elements: [],
        pos: startToken.pos,
        original: startToken.original
      });
    }
    let hasSemicolon = false;
    let hasComma = false;
    let tempPos = this.position - 1;
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    while (tempPos < this.tokens.length) {
      const token = this.tokens[tempPos];
      if (token.value === "(")
        parenDepth++;
      else if (token.value === ")") {
        if (parenDepth === 0)
          break;
        parenDepth--;
      } else if (typeof token.value === "string" && token.value.startsWith("{"))
        braceDepth++;
      else if (token.value === "}")
        braceDepth--;
      else if (token.value === "[")
        bracketDepth++;
      else if (token.value === "]")
        bracketDepth--;
      else if (parenDepth === 0 && braceDepth <= 0 && bracketDepth <= 0) {
        if (token.value === ";") {
          hasSemicolon = true;
          break;
        } else if (token.value === ",") {
          hasComma = true;
        }
      }
      tempPos++;
    }
    let result;
    if (hasSemicolon) {
      const params = this.parseFunctionParameters();
      result = this.createNode("Grouping", {
        expression: this.createNode("ParameterList", {
          parameters: params,
          pos: startToken.pos,
          original: startToken.original
        }),
        pos: startToken.pos,
        original: startToken.original
      });
    } else if (hasComma) {
      const elements = this.parseTupleElements();
      result = this.createNode("Tuple", {
        elements,
        pos: startToken.pos,
        original: startToken.original
      });
    } else {
      const expr = this.parseExpression(0);
      result = this.createNode("Grouping", {
        expression: expr,
        pos: startToken.pos,
        original: startToken.original
      });
    }
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis");
    }
    this.advance();
    return result;
  }
  parseTupleElements() {
    const elements = [];
    let firstElement = this.parseTupleElement();
    elements.push(firstElement);
    while (this.current.value === ",") {
      this.advance();
      if (this.current.value === "," || this.current.value === ")") {
        if (this.current.value === ",") {
          this.error("Consecutive commas not allowed in tuples");
        }
        break;
      }
      const element = this.parseTupleElement();
      elements.push(element);
    }
    return elements;
  }
  parseTupleElement() {
    return this.parseCapturedConstructorElement();
  }
  parseArray() {
    const startToken = this.current;
    this.advance();
    const result = this.parseMatrixOrArray(startToken);
    if (this.current.value !== "]") {
      this.error("Expected closing bracket");
    }
    this.advance();
    return result;
  }
  parseGeneratorChain() {
    let start = null;
    const operators = [];
    if (!this.isGeneratorOperator(this.current.value)) {
      const savedPos = this.pos;
      try {
        start = this.parseExpressionUntilGenerator();
      } catch (e) {
        this.pos = savedPos;
        start = null;
      }
    }
    while (this.isGeneratorOperator(this.current.value)) {
      const operator = this.current;
      this.advance();
      const operand = this.parseExpression(PRECEDENCE.PIPE + 1);
      const operatorNode = this.createGeneratorOperatorNode(operator.value, operand, operator);
      operators.push(operatorNode);
    }
    if (operators.length === 0) {
      return start;
    }
    return this.createNode("GeneratorChain", {
      start,
      operators,
      pos: start ? start.pos : operators[0].pos,
      original: start ? start.original : operators[0].original
    });
  }
  parseExpressionUntilGenerator() {
    return this.parsePrefix();
  }
  parseExpressionRec(left, minPrec, stopAtGenerators = false) {
    while (this.current.type !== "End") {
      if (this.stopExpressionAtOffset !== null && this.current.pos?.[0] >= this.stopExpressionAtOffset) {
        break;
      }
      if (this.current.value === ";" || this.current.value === "," || this.current.value === ")" || this.current.value === "]" || this.current.value === "}" || this.current.type === "SemicolonSequence") {
        break;
      }
      if (!this.disablePostfixCheckParsing && (this.current.value === "##@" || this.current.value === "##:" || this.current.value === "##!" || this.current.value === "##_" || this.current.value === "##!>")) {
        if (PRECEDENCE.CHECK < minPrec)
          break;
        if (this.current.value === "##@") {
          left = this.parsePostfixPredicateCheck(left);
        } else if (this.current.value === "##:") {
          left = this.parsePostfixTypeCheck(left);
        } else if (this.current.value === "##!") {
          left = this.parsePostfixDiagnosticTap(left);
        } else if (this.current.value === "##_") {
          left = this.parsePostfixHandler(left, "PostfixFinalizer", "cleanup callable");
        } else {
          left = this.parsePostfixHandler(left, "PostfixFaultRecovery", "fault handler");
        }
        if (left.endsLineAt !== null && this.current.pos?.[0] >= left.endsLineAt)
          break;
        continue;
      }
      if (this.current.value === "(") {
        this.validateKnownSystemCallable(left);
        if (!this.isCallableNode(left)) {
          if (JUXTAPOSITION_PRECEDENCE < minPrec) {
            break;
          }
          left = this.parseCall(left);
          continue;
        }
        left = this.parseCall(left);
        continue;
      }
      if (this.canStartImplicitOperand()) {
        const nextSymbolInfo = this.getSymbolInfo(this.current);
        if (nextSymbolInfo && nextSymbolInfo.type === "infix") {} else {
          if (left.type === "SystemIdentifier" && left.systemInfo && left.systemInfo.type === "operator" && left.systemInfo.operatorType === "prefix") {
            const operand = this.parseExpression(PRECEDENCE.UNARY);
            left = this.createNode("UnaryOperation", {
              operator: left.name,
              operand,
              pos: left.pos,
              original: left.original + (operand.original || "")
            });
            continue;
          }
          if (this.isCallableNode(left)) {
            if (IMPLICIT_APPLICATION_PRECEDENCE < minPrec) {
              break;
            }
            const arg = this.parseExpression(PRECEDENCE.ADDITION + 1);
            left = this.createNode("ImplicitApplication", {
              callable: left,
              argument: arg,
              pos: [left.pos[0], left.pos[0], arg.pos[2]],
              original: left.original + (arg.original || "")
            });
            continue;
          }
          if (JUXTAPOSITION_PRECEDENCE < minPrec) {
            break;
          }
          const right = this.parseExpression(JUXTAPOSITION_PRECEDENCE + 1);
          left = this.createNode("ImplicitMultiplication", {
            left,
            right,
            pos: [left.pos[0], left.pos[0], right.pos[2]],
            original: left.original + (right.original || "")
          });
          continue;
        }
      }
      if (this.current.value === "@" && this.peek().value === "(") {
        left = this.parseAt(left);
        continue;
      }
      if (this.current.value === "?" && this.peek().value === "(") {
        left = this.parseAsk(left);
        continue;
      }
      if (this.current.value === "'" && (left.type === "UserIdentifier" || left.type === "SystemIdentifier" || left.type === "SystemFunctionRef" || left.type === "FunctionCall" || left.type === "ImplicitApplication" || left.type === "PropertyAccess" || left.type === "Derivative" || left.type === "Integral")) {
        left = this.parseDerivative(left);
        continue;
      }
      if (this.current.value === "~[") {
        left = this.parseScientificUnit(left);
        continue;
      }
      if (this.current.value === "~{") {
        left = this.parseMathematicalUnit(left);
        continue;
      }
      if (this.current.value === "{=" || this.current.value === "{!") {
        left = this.parseMutation(left);
        continue;
      }
      let symbolInfo = this.getSymbolInfo(this.current);
      if (symbolInfo && this.current.value === "->") {
        if (left.type === "FunctionCall" || left.type === "ImplicitMultiplication") {
          symbolInfo = { ...symbolInfo, precedence: PRECEDENCE.ASSIGNMENT };
        }
      }
      if (!symbolInfo || symbolInfo.precedence < minPrec) {
        break;
      }
      if (symbolInfo.custom && left?.type === "CustomOperator" && left.precedence === symbolInfo.precedence && (left.associativity === "none" || symbolInfo.associativity === "none")) {
        this.error(`Non-associative custom operator chain requires parentheses around ':<${left.operator}>:' or ':<${this.current.value}>:'`);
      }
      if (symbolInfo.type === "statement" || symbolInfo.type === "separator") {
        break;
      }
      if (stopAtGenerators && this.isGeneratorOperator(this.current.value)) {
        break;
      }
      left = this.parseInfix(left, symbolInfo);
    }
    return left;
  }
  parsePostfixPredicateCheck(expression) {
    const marker = this.current;
    const lineEndAt = this.source.indexOf(`
`, marker.pos[2]);
    const previousStop = this.stopExpressionAtOffset;
    const previousDisable = this.disablePostfixCheckParsing;
    this.stopExpressionAtOffset = lineEndAt === -1 ? previousStop : lineEndAt;
    this.disablePostfixCheckParsing = true;
    this.advance();
    const operator = this.current;
    const symbolInfo = this.getSymbolInfo(operator);
    if (!symbolInfo || symbolInfo.type !== "infix" || symbolInfo.precedence <= PRECEDENCE.ASSIGNMENT) {
      this.stopExpressionAtOffset = previousStop;
      this.disablePostfixCheckParsing = previousDisable;
      this.error("Expected an infix predicate operator after ##@ (for example ==, >, or |>)");
    }
    const checkValue = this.createNode("PostfixCheckValue", {
      pos: marker.pos,
      original: "<checked value>"
    });
    try {
      const predicate = this.parseInfix(checkValue, symbolInfo);
      return this.createNode("PostfixPredicateCheck", {
        expression,
        predicate,
        endsLineAt: lineEndAt === -1 ? null : lineEndAt,
        pos: [expression.pos[0], expression.pos[1], predicate.pos[2]],
        original: expression.original + marker.original + operator.original + (predicate.right?.original || "")
      });
    } finally {
      this.stopExpressionAtOffset = previousStop;
      this.disablePostfixCheckParsing = previousDisable;
    }
  }
  parsePostfixTypeCheck(expression) {
    const marker = this.current;
    const lineEndAt = this.source.indexOf(`
`, marker.pos[2]);
    this.advance();
    let name = null;
    let semantic = false;
    if (this.current.value === ":") {
      semantic = true;
      this.advance();
    }
    if (this.current.type !== "Identifier") {
      this.error("Expected a kind or semantic name after ##:");
    }
    name = this.current.value;
    const nameOriginal = this.current.original;
    this.advance();
    let shape = null;
    if (this.current.value === "[") {
      this.advance();
      let source = "";
      while (this.current.value !== "]" && this.current.type !== "End") {
        source += this.current.original;
        this.advance();
      }
      if (this.current.value !== "]")
        this.error("Expected closing ] in ##: shape check");
      this.advance();
      if (!/^\d+(?:x\d+)*$/i.test(source)) {
        this.error("Shape checks use positive dimensions such as [3] or [2x2]");
      }
      shape = source.toLowerCase().split("x").map((part) => Number(part));
    }
    return this.createNode("PostfixTypeCheck", {
      expression,
      spec: { name, semantic, shape },
      endsLineAt: lineEndAt === -1 ? null : lineEndAt,
      pos: [expression.pos[0], expression.pos[1], this.current.pos[0]],
      original: expression.original + marker.original + (semantic ? ":" : "") + nameOriginal
    });
  }
  parsePostfixDiagnosticTap(expression) {
    const marker = this.current;
    const lineEndAt = this.source.indexOf(`
`, marker.pos[2]);
    this.advance();
    if (this.current.type !== "Identifier") {
      this.error("Expected Debug, Trace, Info, Dump, or Log after ##!");
    }
    const action = this.current.value;
    const actionOriginal = this.current.original;
    if (!new Set(["debug", "trace", "info", "dump", "log"]).has(action.toLowerCase())) {
      this.error("##! supports Debug, Trace, Info, Dump, or Log");
    }
    this.advance();
    if (this.current.value !== "(")
      this.error("Expected ( after ##! diagnostic action");
    this.advance();
    const arguments_ = this.parseFunctionCallArgs();
    if (this.current.value !== ")")
      this.error("Expected closing ) in ##! diagnostic tap");
    const end = this.current.pos[2];
    this.advance();
    return this.createNode("PostfixDiagnosticTap", {
      expression,
      action,
      arguments: arguments_,
      endsLineAt: lineEndAt === -1 ? null : lineEndAt,
      pos: [expression.pos[0], expression.pos[1], end],
      original: expression.original + marker.original + actionOriginal + "(...)"
    });
  }
  parsePostfixHandler(expression, nodeType, label) {
    const marker = this.current;
    const lineEndAt = this.source.indexOf(`
`, marker.pos[2]);
    const previousStop = this.stopExpressionAtOffset;
    const previousDisable = this.disablePostfixCheckParsing;
    this.stopExpressionAtOffset = lineEndAt === -1 ? previousStop : lineEndAt;
    this.disablePostfixCheckParsing = true;
    this.advance();
    try {
      if (this.current.type === "End" || this.current.value === ";" || this.current.value === "}") {
        this.error(`Expected ${label} after ${marker.value}`);
      }
      const handler = this.parseExpression(PRECEDENCE.CHECK + 1);
      return this.createNode(nodeType, {
        expression,
        handler,
        endsLineAt: lineEndAt === -1 ? null : lineEndAt,
        pos: [expression.pos[0], expression.pos[1], handler.pos[2]],
        original: expression.original + marker.original + handler.original
      });
    } finally {
      this.stopExpressionAtOffset = previousStop;
      this.disablePostfixCheckParsing = previousDisable;
    }
  }
  isGeneratorOperator(value) {
    return ["|+", "|*", "|:", "|?", "|^", "|;", "|>"].includes(value);
  }
  createGeneratorOperatorNode(operator, operand, token) {
    const typeMap = {
      "|+": "GeneratorAdd",
      "|*": "GeneratorMultiply",
      "|:": "GeneratorFunction",
      "|?": "GeneratorFilter",
      "|^": "GeneratorLimit",
      "|;": "GeneratorEagerLimit",
      "|>": "GeneratorPipe"
    };
    return this.createNode(typeMap[operator], {
      operator,
      operand,
      pos: token.pos,
      original: token.original
    });
  }
  convertBinaryChainToGeneratorChain(binaryOp) {
    const operators = [];
    let current = binaryOp;
    let start = null;
    while (current && current.type === "BinaryOperation" && this.isGeneratorOperator(current.operator)) {
      const operatorNode = this.createGeneratorOperatorNode(current.operator, current.right, current);
      operators.unshift(operatorNode);
      current = current.left;
    }
    if (current && current.type === "BinaryOperation" && this.isGeneratorOperator(current.operator)) {
      const nestedChain = this.convertBinaryChainToGeneratorChain(current);
      start = nestedChain.start;
      operators.unshift(...nestedChain.operators);
    } else if (current && current.type === "Pipe") {
      const prefix = this.convertGeneratorPipePrefix(current);
      start = prefix.start;
      operators.unshift(...prefix.operators);
    } else {
      start = current;
    }
    return this.createNode("GeneratorChain", {
      start,
      operators,
      pos: binaryOp.pos,
      original: binaryOp.original
    });
  }
  convertGeneratorPipePrefix(node) {
    if (node.type === "Pipe") {
      const prefix = this.convertGeneratorPipePrefix(node.left);
      prefix.operators.push(this.createGeneratorOperatorNode("|>", node.right, node));
      return prefix;
    }
    if (node.type === "BinaryOperation" && this.isGeneratorOperator(node.operator)) {
      const prefix = this.convertGeneratorPipePrefix(node.left);
      prefix.operators.push(this.createGeneratorOperatorNode(node.operator, node.right, node));
      return prefix;
    }
    return { start: node, operators: [] };
  }
  parseMatrixOrArray(startToken) {
    const elements = [];
    let hasMetadata = false;
    let primaryElement = null;
    const metadataMap = {};
    let nonMetadataCount = 0;
    let hasSemicolons = false;
    let matrixStructure = [];
    let currentRow = [];
    if (this.current.value !== "]") {
      do {
        if (this.current.value === ";" || this.current.type === "SemicolonSequence") {
          hasSemicolons = true;
          const semicolonCount = this.consumeSemicolonSequence();
          matrixStructure.push({
            row: [],
            separatorLevel: semicolonCount
          });
          continue;
        }
        let element;
        if (this.current.value === "," || this.current.value === "]") {
          element = this.createNode("Hole", { original: "" });
        } else if (this.isGeneratorOperator(this.current.value)) {
          element = this.parseGeneratorChain();
        } else {
          element = this.parseCapturedConstructorElement();
          if (element.type === "BinaryOperation" && this.isGeneratorOperator(element.operator)) {
            element = this.convertBinaryChainToGeneratorChain(element);
          }
        }
        if (element.type === "BinaryOperation" && element.operator === ":=") {
          if (hasSemicolons) {
            this.error("Cannot mix matrix/tensor syntax with metadata - use nested array syntax");
          }
          hasMetadata = true;
          let key;
          if (element.left.type === "UserIdentifier") {
            key = element.left.name;
          } else if (element.left.type === "SystemIdentifier") {
            key = element.left.name;
          } else if (element.left.type === "String") {
            key = element.left.value;
          } else {
            this.error("Metadata key must be an identifier or string");
          }
          metadataMap[key] = element.right;
        } else {
          nonMetadataCount++;
          if (hasMetadata) {
            this.error("Cannot mix array elements with metadata - use nested array syntax like [[1,2,3], key := value]");
          }
          if (nonMetadataCount === 1) {
            primaryElement = element;
          }
          elements.push(element);
          currentRow.push(element);
        }
        if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "]") {
            const trailingHole = this.createNode("Hole", { original: "" });
            elements.push(trailingHole);
            currentRow.push(trailingHole);
            nonMetadataCount++;
          }
        } else if (this.current.value === ";" || this.current.type === "SemicolonSequence") {
          if (hasMetadata) {
            this.error("Cannot mix matrix/tensor syntax with metadata");
          }
          hasSemicolons = true;
          const semicolonCount = this.consumeSemicolonSequence();
          matrixStructure.push({
            row: [...currentRow],
            separatorLevel: semicolonCount
          });
          currentRow = [];
        } else {
          break;
        }
      } while (this.current.value !== "]" && this.current.type !== "End");
    }
    if (currentRow.length > 0 || hasSemicolons) {
      matrixStructure.push({
        row: currentRow,
        separatorLevel: 0
      });
    }
    if (hasMetadata && nonMetadataCount > 1) {
      this.error("Cannot mix array elements with metadata - use nested array syntax like [[1,2,3], key := value]");
    }
    if (hasMetadata) {
      return this.createNode("WithMetadata", {
        primary: primaryElement || this.createNode("Array", {
          elements: [],
          pos: startToken.pos,
          original: startToken.original
        }),
        metadata: metadataMap,
        pos: startToken.pos,
        original: startToken.original
      });
    }
    if (hasSemicolons) {
      return this.buildMatrixTensor(matrixStructure, startToken);
    }
    return this.createNode("Array", {
      elements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  buildMatrixTensor(matrixStructure, startToken) {
    const maxSeparatorLevel = Math.max(...matrixStructure.map((item) => item.separatorLevel));
    if (maxSeparatorLevel === 1) {
      const rows = [];
      for (const item of matrixStructure) {
        rows.push(item.row);
      }
      return this.createNode("Matrix", {
        rows,
        pos: startToken.pos,
        original: startToken.original
      });
    } else {
      return this.createNode("Tensor", {
        structure: matrixStructure,
        maxDimension: maxSeparatorLevel + 1,
        pos: startToken.pos,
        original: startToken.original
      });
    }
  }
  isDirectAssignmentOperator(value) {
    return value === "=" || value === ":=" || value === "~=" || value === "::=" || value === "~~=";
  }
  createDestructureTargetNode(type, props, sourceNode = null) {
    return this.createNode(type, {
      ...props,
      ...sourceNode?.pos ? { pos: sourceNode.pos } : {},
      ...sourceNode?.original ? { original: sourceNode.original } : {}
    });
  }
  wrapDestructureTarget(target, wrappers) {
    let wrapped = target;
    for (const wrapper of wrappers) {
      if (wrapper.type === "capture") {
        wrapped = this.createDestructureTargetNode("DestructureBindingModeTarget", {
          bindingMode: wrapper.bindingMode,
          target: wrapped
        }, wrapped);
      } else if (wrapper.type === "semantic") {
        wrapped = this.createDestructureTargetNode("DestructureSemanticTarget", {
          header: wrapper.header,
          target: wrapped
        }, wrapped);
      }
    }
    return wrapped;
  }
  explicitMapKeyExpression(node) {
    if (node?.type === "Array" && Array.isArray(node.elements) && node.elements.length === 1) {
      return node.elements[0];
    }
    return null;
  }
  normalizeStandaloneIndexSpec(node) {
    if (node?.type === "BinaryOperation" && node.operator === ":") {
      return this.createNode("SliceSpec", {
        start: node.left,
        end: node.right,
        pos: node.pos,
        original: node.original
      });
    }
    if (node?.type === "Number" && typeof node.value === "string" && node.value.includes(":")) {
      const parts = node.value.split(":");
      if (parts.length === 2) {
        return this.createNode("SliceSpec", {
          start: this.createNode("Number", { value: parts[0], original: parts[0] }),
          end: this.createNode("Number", { value: parts[1], original: parts[1] }),
          pos: node.pos,
          original: node.original
        });
      }
    }
    return node;
  }
  buildIndexedDestructureTarget(selectorNode, nestedTarget = null, options = {}) {
    if (selectorNode?.type === "Grouping" && selectorNode.expression) {
      return this.buildIndexedDestructureTarget(selectorNode.expression, nestedTarget, options);
    }
    if (selectorNode?.type === "PropertyAccess") {
      const property = selectorNode.property?.type === "KeyLiteral" ? this.createNode("String", {
        value: selectorNode.property.name,
        kind: "colon",
        original: selectorNode.property.original || `:${selectorNode.property.name}`
      }) : this.normalizeStandaloneIndexSpec(selectorNode.property);
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: this.convertExpressionToDestructureTarget(selectorNode.object),
        specs: [property],
        nestedTarget
      }, selectorNode);
    }
    if (selectorNode?.type === "BracketIndex") {
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: this.convertExpressionToDestructureTarget(selectorNode.object),
        specs: selectorNode.specs,
        nestedTarget
      }, selectorNode);
    }
    const explicitKeyExpr = options.allowBareArraySelector ? this.explicitMapKeyExpression(selectorNode) : null;
    if (explicitKeyExpr) {
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: null,
        specs: [this.normalizeStandaloneIndexSpec(explicitKeyExpr)],
        nestedTarget
      }, selectorNode);
    }
    return null;
  }
  convertExpressionToDestructureTarget(node) {
    const wrappers = [];
    let current = node;
    while (current?.type === "CapturedEntry" || current?.type === "ValueOutfit" || current?.type === "Grouping") {
      if (current.type === "CapturedEntry") {
        wrappers.push({ type: "capture", bindingMode: current.captureMode });
        current = current.expression;
      } else if (current.type === "Grouping") {
        current = current.expression;
      } else {
        wrappers.push({ type: "semantic", header: current.header || null });
        current = current.expression;
      }
    }
    let target;
    if (current?.type === "BinaryOperation" && current.operator === "=") {
      const indexed = this.buildIndexedDestructureTarget(current.left, this.convertExpressionToDestructureTarget(current.right), { allowBareArraySelector: true });
      if (indexed) {
        target = indexed;
      } else {
        this.error("Invalid destructuring target");
      }
    } else if (current?.type === "UserIdentifier" || current?.type === "SystemIdentifier") {
      target = this.createDestructureTargetNode("DestructureVariableTarget", {
        name: current.name
      }, current);
    } else if (current?.type === "Spread") {
      target = this.createDestructureTargetNode("DestructureRestTarget", {
        target: this.convertExpressionToDestructureTarget(current.expression)
      }, current);
    } else {
      const indexed = this.buildIndexedDestructureTarget(current, null);
      if (indexed) {
        target = indexed;
      }
    }
    if (target) {
      return this.wrapDestructureTarget(target, wrappers);
    }
    if (current?.type === "Array" || current?.type === "ArrayContainer") {
      const elements = current.elements || [];
      const entries = [];
      let rest = null;
      for (let i = 0;i < elements.length; i++) {
        const entry = this.convertExpressionToDestructureTarget(elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest)
            this.error("Destructuring patterns allow at most one rest capture");
          if (i !== elements.length - 1)
            this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureArrayPattern", {
        entries,
        rest
      }, current);
    } else if (current?.type === "Tuple" || current?.type === "TupleContainer") {
      const elements = current.elements || [];
      const entries = [];
      let rest = null;
      for (let i = 0;i < elements.length; i++) {
        const entry = this.convertExpressionToDestructureTarget(elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest)
            this.error("Destructuring patterns allow at most one rest capture");
          if (i !== elements.length - 1)
            this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureTuplePattern", {
        entries,
        rest
      }, current);
    } else if (current?.type === "MapContainer") {
      const entries = [];
      let rest = null;
      for (let i = 0;i < current.elements.length; i++) {
        const entry = this.convertMapDestructureEntry(current.elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest)
            this.error("Destructuring patterns allow at most one rest capture");
          if (i !== current.elements.length - 1)
            this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureMapPattern", {
        entries,
        rest
      }, current);
    } else if (current?.type === "TensorLiteral") {
      if (current.shape.length !== 2) {
        this.error("Tensor destructuring currently supports rank-2 patterns only");
      }
      const [rows, cols] = current.shape;
      if (current.elements.length !== rows * cols) {
        this.error("Malformed tensor destructure");
      }
      const rowTargets = [];
      for (let row = 0;row < rows; row++) {
        const rowEntries = [];
        for (let col = 0;col < cols; col++) {
          rowEntries.push(this.convertExpressionToDestructureTarget(current.elements[row * cols + col]));
        }
        rowTargets.push(rowEntries);
      }
      target = this.createDestructureTargetNode("DestructureTensorPattern", {
        shape: [...current.shape],
        rows: rowTargets
      }, current);
    } else {
      this.error("Invalid destructuring target");
    }
    return this.wrapDestructureTarget(target, wrappers);
  }
  convertMapDestructureEntry(node) {
    const wrappers = [];
    let current = node;
    while (current?.type === "CapturedEntry" || current?.type === "ValueOutfit") {
      if (current.type === "CapturedEntry") {
        wrappers.push({ type: "capture", bindingMode: current.captureMode });
        current = current.expression;
      } else {
        wrappers.push({ type: "semantic", header: current.header || null });
        current = current.expression;
      }
    }
    if (current?.type === "Spread") {
      const rest = this.createDestructureTargetNode("DestructureRestTarget", {
        target: this.convertExpressionToDestructureTarget(current.expression)
      }, current);
      return this.wrapDestructureTarget(rest, wrappers);
    }
    const makeEntry = (sourceKey, wholeTarget, nestedTarget, sourceNode = current) => this.createDestructureTargetNode("DestructureMapEntry", {
      sourceKey,
      wholeTarget,
      nestedTarget
    }, sourceNode);
    if (current?.type === "UserIdentifier" || current?.type === "SystemIdentifier") {
      return this.wrapDestructureTarget(makeEntry(current, this.createDestructureTargetNode("DestructureVariableTarget", { name: current.name }, current), null, current), wrappers);
    }
    if (current?.type === "PropertyAccess" && (current.object?.type === "UserIdentifier" || current.object?.type === "SystemIdentifier") && current.property?.type === "KeyLiteral") {
      return this.wrapDestructureTarget(makeEntry(this.createNode("String", {
        value: current.property.name,
        kind: "colon",
        original: current.property.original || `:${current.property.name}`
      }), this.createDestructureTargetNode("DestructureVariableTarget", { name: current.object.name }, current.object), null, current), wrappers);
    }
    if (current?.type === "MapEntry") {
      const explicitKeyExpr = this.explicitMapKeyExpression(current.key);
      if (explicitKeyExpr) {
        return this.wrapDestructureTarget(makeEntry(explicitKeyExpr, null, this.convertExpressionToDestructureTarget(current.value), current), wrappers);
      }
      if (current.key?.type === "UserIdentifier" || current.key?.type === "SystemIdentifier") {
        return this.wrapDestructureTarget(makeEntry(current.key, this.createDestructureTargetNode("DestructureVariableTarget", { name: current.key.name }, current.key), this.convertExpressionToDestructureTarget(current.value), current), wrappers);
      }
      if (current.key?.type === "PropertyAccess" && (current.key.object?.type === "UserIdentifier" || current.key.object?.type === "SystemIdentifier") && current.key.property?.type === "KeyLiteral") {
        return this.wrapDestructureTarget(makeEntry(this.createNode("String", {
          value: current.key.property.name,
          kind: "colon",
          original: current.key.property.original || `:${current.key.property.name}`
        }), this.createDestructureTargetNode("DestructureVariableTarget", { name: current.key.object.name }, current.key.object), this.convertExpressionToDestructureTarget(current.value), current), wrappers);
      }
    }
    this.error("Malformed map rename/nested syntax");
  }
  consumeSemicolonSequence() {
    if (this.current.type === "SemicolonSequence") {
      const count = this.current.count;
      this.advance();
      return count;
    } else if (this.current.value === ";") {
      this.advance();
      return 1;
    }
    return 0;
  }
  parseBraceContainer() {
    const startToken = this.current;
    this.advance();
    const imports = this.startsImportHeader() ? this.parseImportHeader() : [];
    const elements = [];
    if (this.current.value !== "}") {
      do {
        if (this.current.value === ";") {
          this.advance();
          continue;
        }
        const element = this.parseExpression(0);
        elements.push(element);
        if (this.current.value === ";" || this.current.value === ",") {
          this.advance();
        } else if (this.current.value !== "}") {
          break;
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }
    if (this.current.value !== "}") {
      this.error("Expected closing brace for block");
    }
    this.advance();
    return this.createNode("BlockContainer", {
      ...imports.length > 0 ? { imports } : {},
      elements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseOperatorBrace(sigil) {
    const startToken = this.current;
    this.advance();
    const elements = [];
    if (this.current.value !== "}") {
      do {
        if (this.current.value === ",") {
          this.advance();
          continue;
        }
        elements.push(this.parseExpression(0));
        if (this.current.value === ",") {
          this.advance();
        } else if (this.current.value !== "}") {
          this.error("Expected ',' or '}' in brace sequence");
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }
    if (this.current.value !== "}") {
      this.error("Expected '}'");
    }
    this.advance();
    let sysName;
    if (sigil === "{+")
      sysName = "ADD";
    else if (sigil === "{*")
      sysName = "MUL";
    else if (sigil === "{&&")
      sysName = "AND";
    else if (sigil === "{||")
      sysName = "OR";
    else if (sigil === "{\\/")
      sysName = "NARY_UNION";
    else if (sigil === "{/\\")
      sysName = "NARY_INTERSECT";
    else if (sigil === "{++")
      sysName = "NARY_CONCAT";
    else if (sigil === "{<<")
      sysName = "MIN";
    else if (sigil === "{>>")
      sysName = "MAX";
    return this.createNode("FunctionCall", {
      function: this.createNode("SystemIdentifier", {
        name: sysName,
        systemInfo: this.systemLookup(sysName),
        original: sigil
      }),
      arguments: {
        positional: elements,
        keyword: {}
      },
      fromBrace: true,
      pos: startToken.pos,
      original: sigil
    });
  }
  parseAbsoluteValue() {
    const startToken = this.current;
    this.advance();
    const expression = this.parseExpression(0);
    if (this.current.value !== "|") {
      this.error("Expected '|' to close absolute-value expression");
    }
    const endToken = this.current;
    this.advance();
    return this.createNode("FunctionCall", {
      function: this.createNode("SystemIdentifier", {
        name: "ABS",
        systemInfo: this.systemLookup("ABS"),
        original: "|"
      }),
      arguments: {
        positional: [expression],
        keyword: {}
      },
      fromBrace: true,
      pos: [startToken.pos[0], startToken.pos[1], endToken.pos[2]],
      original: `|${expression.original || ""}|`
    });
  }
  isConstructorCaptureOperator(value) {
    return value === "==" || value === ":=" || value === "~=" || value === "::=" || value === "~~=";
  }
  captureModeFromOperator(value) {
    if (value === "==")
      return "alias";
    if (value === ":=")
      return "copy";
    if (value === "~=")
      return "refresh";
    if (value === "::=")
      return "deep_copy";
    if (value === "~~=")
      return "deep_refresh";
    return null;
  }
  parseCapturedConstructorElement() {
    let captureMode = null;
    if (this.isConstructorCaptureOperator(this.current.value)) {
      captureMode = this.captureModeFromOperator(this.current.value);
      this.advance();
    }
    const expression = this.parseExpression(0);
    if (!captureMode)
      return expression;
    return this.createNode("CapturedEntry", {
      captureMode,
      expression,
      pos: expression.pos,
      original: expression.original
    });
  }
  parseMapConstructorEntry() {
    let prefixCaptureMode = null;
    if (this.isConstructorCaptureOperator(this.current.value)) {
      prefixCaptureMode = this.captureModeFromOperator(this.current.value);
      this.advance();
    }
    let key;
    if (this.current.type === "Identifier" && (this.peek().value === "=" || this.isConstructorCaptureOperator(this.peek().value))) {
      const token = this.current;
      this.advance();
      key = this.createNode(token.kind === "System" ? "SystemIdentifier" : "UserIdentifier", {
        name: token.value,
        ...token.kind === "System" ? { systemInfo: this.systemLookup(token.value) } : {},
        original: token.original
      });
    } else if (this.current.value === "(") {
      key = this.parseGrouping();
    } else {
      key = this.parseExpression(PRECEDENCE.ASSIGNMENT + 1);
    }
    const operator = this.current.value;
    if (operator !== "=" && !this.isConstructorCaptureOperator(operator)) {
      if (!prefixCaptureMode) {
        return key;
      }
      return this.createNode("CapturedEntry", {
        captureMode: prefixCaptureMode,
        expression: key,
        pos: key.pos,
        original: key.original
      });
    }
    const captureMode = operator === "=" ? null : this.captureModeFromOperator(operator);
    this.advance();
    const value = this.parseExpression(0);
    const entry = this.createNode("MapEntry", {
      key,
      value,
      captureMode,
      pos: key.pos,
      original: key.original
    });
    if (!prefixCaptureMode) {
      return entry;
    }
    return this.createNode("CapturedEntry", {
      captureMode: prefixCaptureMode,
      expression: entry,
      pos: entry.pos,
      original: entry.original
    });
  }
  parseHeaderDirectiveName() {
    const token = this.current;
    if (token.type !== "Identifier") {
      this.error("Expected identifier in header");
    }
    const name = token.original.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      this.error("Header names must start with a letter and contain only letters, digits, or underscores");
    }
    this.advance();
    return name;
  }
  parseSemanticHeader() {
    if (this.current.value !== "/") {
      return null;
    }
    const startToken = this.current;
    this.advance();
    let captureMode = null;
    let name = null;
    let typeName = null;
    const traits = [];
    let order = 0;
    while (this.current.value !== "/" && this.current.type !== "End") {
      if (this.isConstructorCaptureOperator(this.current.value)) {
        if (captureMode !== null) {
          this.error("Header may only specify one capture mode");
        }
        captureMode = this.captureModeFromOperator(this.current.value);
        this.advance();
        continue;
      }
      if (this.current.value === "#") {
        this.advance();
        if (name !== null) {
          this.error("Header may only specify one name");
        }
        name = this.parseHeaderDirectiveName();
        continue;
      }
      if (this.current.value === "::") {
        this.advance();
        if (typeName !== null) {
          this.error("Header may only specify one semantic type");
        }
        typeName = this.parseHeaderDirectiveName();
        continue;
      }
      if (this.current.value === ":") {
        this.advance();
        const traitName = this.parseHeaderDirectiveName();
        traits.push({
          type: "HeaderTrait",
          name: traitName,
          checkMode: null,
          order
        });
        order += 1;
        continue;
      }
      this.error("Invalid directive in /.../ header");
    }
    if (this.current.value !== "/") {
      this.error("Unterminated /.../ header");
    }
    this.advance();
    return this.createNode("SemanticHeader", {
      captureMode,
      name,
      typeName,
      traits,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseValueOutfit() {
    const startToken = this.current;
    this.advance();
    const header = this.parseSemanticHeader();
    const expression = this.parseExpression(0);
    if (this.current.value !== "}") {
      this.error("Expected closing brace for value outfit");
    }
    this.advance();
    return this.createNode("ValueOutfit", {
      header,
      expression,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseBraceSigil(sigil, containerName = null, options = {}) {
    const startToken = this.current;
    this.advance();
    const isTensorShapeSigil = sigil === "{:" && containerName && /^\d+(?:x\d+)*$/.test(containerName);
    if (isTensorShapeSigil && !options.destructureAlias) {
      return this.parseTensorLiteral(startToken, containerName);
    }
    const effectiveSigil = isTensorShapeSigil && options.destructureAlias ? "{.." : sigil;
    const sigilTypeMap = {
      "{..": "ArrayContainer",
      "{=": "MapContainer",
      "{?": "CaseContainer",
      "{;": "BlockContainer",
      "{|": "SetContainer",
      "{:": "TupleContainer",
      "{@": "LoopContainer",
      "{$": "AsyncContainer",
      "{$$": "DetachedBlock",
      "{^": "ValueOutfit",
      "{>": "MultifunctionContainer"
    };
    const nodeType = sigilTypeMap[effectiveSigil];
    const temporalSigils = new Set(["{?", "{;", "{@", "{$", "{$$"]);
    const isTemporal = temporalSigils.has(effectiveSigil);
    const closerMap = {
      "{|": ["|}", "}"]
    };
    const closers = closerMap[effectiveSigil] || ["}"];
    const primaryCloser = closers[0];
    const isCloser = (val) => closers.includes(val);
    const separator = isTemporal ? ";" : ",";
    const isSeparatorToken = () => isTemporal ? this.current.value === ";" || this.current.type === "SemicolonSequence" : this.current.value === separator;
    const consumeSeparatorToken = () => {
      if (isTemporal && this.current.type === "SemicolonSequence") {
        const count = this.current.count;
        this.advance();
        return count;
      }
      if (this.current.value === separator) {
        this.advance();
        return 1;
      }
      return 0;
    };
    const pushHoleSlot = () => {
      elements.push(this.createNode("Hole", { original: "" }));
    };
    const header = effectiveSigil === "{=" || effectiveSigil === "{|" || effectiveSigil === "{:" || effectiveSigil === "{.." ? this.parseSemanticHeader() : null;
    const imports = (effectiveSigil === "{;" || effectiveSigil === "{@" || effectiveSigil === "{$" || effectiveSigil === "{$$") && this.startsImportHeader() ? this.parseImportHeader() : [];
    const elements = [];
    const parseElement = effectiveSigil === "{=" ? () => this.parseMapConstructorEntry() : effectiveSigil === "{|" || effectiveSigil === "{:" || effectiveSigil === "{.." ? () => this.parseCapturedConstructorElement() : isTemporal ? () => this.parseCommaSequenceExpression(0) : () => this.parseExpression(0);
    if (!isCloser(this.current.value)) {
      do {
        if (isSeparatorToken()) {
          const count = consumeSeparatorToken();
          if (effectiveSigil === "{@") {
            for (let i = 0;i < count; i++)
              pushHoleSlot();
          }
          continue;
        }
        const element = parseElement();
        if (effectiveSigil === "{=" && element && (element.type === "BinaryOperation" || element.type === "MapEntry") && (element.type === "MapEntry" || element.operator === "=" || element.operator === ":=")) {
          const lhs = element.type === "MapEntry" ? element.key : element.left;
          const lhsType = lhs?.type;
          const isIdentifierSugar = lhsType === "UserIdentifier" || lhsType === "SystemIdentifier";
          const isParenthesizedExpr = lhsType === "Grouping";
          const isDestructureRename = lhsType === "PropertyAccess" || lhsType === "Array" && Array.isArray(lhs?.elements) && lhs.elements.length === 1;
          if (!isIdentifierSugar && !isParenthesizedExpr && !isDestructureRename) {
            this.error("Map key expressions must be parenthesized in literals: use {= (expr)=value }");
          }
        }
        elements.push(element);
        if (isSeparatorToken()) {
          const count = consumeSeparatorToken();
          if (effectiveSigil === "{@") {
            if (isCloser(this.current.value)) {
              for (let i = 0;i < count; i++)
                pushHoleSlot();
            } else {
              for (let i = 1;i < count; i++)
                pushHoleSlot();
            }
          }
          if (isCloser(this.current.value)) {
            break;
          }
        } else if (isCloser(this.current.value)) {
          break;
        } else if (this.current.type === "End") {
          this.error(`Expected closing ${primaryCloser} for ${nodeType}`);
        } else {
          const altSep = isTemporal ? "," : ";";
          if (this.current.value === altSep) {
            this.advance();
            if (isCloser(this.current.value))
              break;
          } else {
            break;
          }
        }
      } while (!isCloser(this.current.value) && this.current.type !== "End");
    }
    if (!isCloser(this.current.value)) {
      this.error(`Expected closing ${primaryCloser} for ${nodeType}`);
    }
    this.advance();
    return this.createNode(nodeType, {
      sigil,
      ...containerName && !options.destructureAlias ? { name: containerName } : {},
      ...isTensorShapeSigil && options.destructureAlias ? { tensorShape: containerName.split("x").map((part) => Number(part)) } : {},
      ...effectiveSigil === "{@" && options.loopMax !== undefined ? { maxIterations: options.loopMax } : {},
      ...effectiveSigil === "{@" && options.loopUnlimited ? { unlimited: true } : {},
      ...effectiveSigil === "{$" && options.asyncLimit !== undefined ? { concurrencyLimit: options.asyncLimit } : {},
      ...effectiveSigil === "{$" && options.asyncTimeout !== undefined ? { timeoutSeconds: options.asyncTimeout } : {},
      ...header ? { header } : {},
      ...imports.length > 0 ? { imports } : {},
      elements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseSystemSpecLiteral() {
    const startToken = this.current;
    const header = {
      inputs: [...startToken.specInputs || []],
      outputs: [...startToken.specOutputs || []],
      outputsDeclared: startToken.specOutputsDeclared === true
    };
    this.validateSystemSpecHeader(header);
    this.advance();
    if (startToken.specIdentity === true) {
      if (this.current.value !== "}") {
        this.error("Expected closing } for symbolic identity");
      }
      this.advance();
      const name = header.inputs[0];
      return this.createNode("SystemSpecLiteral", {
        sigil: "{#",
        inputs: [name],
        outputs: [],
        outputsDeclared: false,
        outputMode: "identity",
        expression: this.createNode("UserIdentifier", {
          name,
          pos: startToken.pos,
          original: name
        }),
        statements: [],
        pos: startToken.pos,
        original: startToken.original + "}"
      });
    }
    const imports = this.startsImportHeader() ? this.parseImportHeader() : [];
    const bodyItems = [];
    if (this.current.value !== "}") {
      do {
        if (this.current.value === ";") {
          this.advance();
          continue;
        }
        const expression = this.parseExpression(0);
        bodyItems.push(expression?.type === "BinaryOperation" && expression.operator === "=" ? this.parseSystemSpecDefinition(expression) : expression);
        if (this.current.value === ";") {
          this.advance();
          if (this.current.value === "}")
            break;
        } else if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "}")
            break;
        } else if (this.current.value === "}") {
          break;
        } else if (this.current.type === "End") {
          this.error("Expected closing } for system spec literal");
        } else {
          break;
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }
    if (this.current.value !== "}") {
      this.error("Expected closing } for system spec literal");
    }
    this.advance();
    const soleItem = bodyItems.length === 1 ? bodyItems[0] : null;
    const expressionBody = soleItem && soleItem.type !== "SpecDefinition" && !this.isSystemConstraintExpression(soleItem) ? soleItem : null;
    const statements = expressionBody ? [] : bodyItems.map((item) => item.type === "SpecDefinition" ? item : this.createNode("SpecConstraint", {
      expr: item,
      pos: item.pos,
      original: item.original
    }));
    if (expressionBody && header.outputsDeclared) {
      this.error("An anonymous symbolic expression cannot declare named outputs");
    }
    const finalized = expressionBody ? { outputs: [], statements: [] } : this.finalizeSystemSpecStatements(header, statements);
    return this.createNode("SystemSpecLiteral", {
      sigil: "{#",
      ...imports.length > 0 ? { imports } : {},
      inputs: header.inputs,
      outputs: finalized.outputs,
      outputsDeclared: header.outputsDeclared,
      outputMode: expressionBody ? "expression" : finalized.statements.some((statement) => statement.type === "SpecConstraint") ? "system" : "named",
      ...expressionBody ? { expression: expressionBody } : {},
      statements: finalized.statements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  validateSystemSpecHeader(header) {
    const checkDuplicates = (names, label) => {
      const seen = new Set;
      for (const name of names) {
        if (seen.has(name)) {
          this.error(`Duplicate ${label} '${name}' in system spec header`);
        }
        seen.add(name);
      }
    };
    checkDuplicates(header.inputs, "input");
    checkDuplicates(header.outputs, "output");
    const inputs = new Set(header.inputs);
    for (const name of header.outputs) {
      if (inputs.has(name)) {
        this.error(`System spec header name '${name}' cannot be both an input and an output`);
      }
    }
  }
  isSystemConstraintExpression(expression) {
    const unwrapped = expression?.type === "Grouping" && expression.expression ? expression.expression : expression;
    if (unwrapped?.type === "BinaryOperation") {
      return new Set(["==", "!=", "<", ">", "<=", ">=", "===", "?", "!?", "?&", "AND", "&&", "OR", "||"]).has(unwrapped.operator);
    }
    return unwrapped?.type === "UnaryOperation" && ["NOT", "!"].includes(unwrapped.operator);
  }
  parseSystemSpecDefinition(expression) {
    if (!expression || expression.type !== "BinaryOperation" || expression.operator !== "=") {
      this.error("System spec definitions must have the form name = expr");
    }
    const target = expression.left;
    if (target.type !== "UserIdentifier" && target.type !== "SystemIdentifier") {
      this.error("System spec definition targets must be bare identifiers");
    }
    return this.createNode("SpecDefinition", {
      target: target.name,
      expr: expression.right,
      pos: expression.pos ?? target.pos,
      original: expression.original
    });
  }
  finalizeSystemSpecStatements(header, statements) {
    const defined = new Set;
    const inferredOutputs = [];
    for (const statement of statements) {
      if (statement.type !== "SpecDefinition")
        continue;
      const target = statement.target;
      if (defined.has(target)) {
        this.error(`System spec symbol '${target}' is defined more than once`);
      }
      defined.add(target);
      if (!header.outputsDeclared) {
        inferredOutputs.push(target);
      }
    }
    return {
      outputs: header.outputsDeclared ? header.outputs : inferredOutputs,
      statements
    };
  }
  parseBreakBlock() {
    const startToken = this.current;
    this.advance();
    let targetType = null;
    if (this.current.value === ";") {
      targetType = "block";
      this.advance();
    } else if (this.current.value === "@") {
      targetType = "loop";
      this.advance();
    } else if (this.current.value === "?") {
      targetType = "case";
      this.advance();
    } else if (this.current.value === "$") {
      targetType = "async";
      this.advance();
    } else if (this.current.type === "OuterIdentifier" && this.peek().value === "!") {
      targetType = "loop";
      const targetName2 = this.current.value.toLowerCase();
      this.advance();
      this.advance();
      const value2 = this.parseExpression(0);
      if (this.current.value !== "}") {
        this.error("Expected closing } for break block");
      }
      this.advance();
      return this.createNode("BreakBlock", {
        targetType,
        targetName: targetName2,
        value: value2,
        pos: startToken.pos,
        original: startToken.original
      });
    }
    let targetName = null;
    if (this.current.type === "Identifier" && this.peek().value === "!") {
      targetName = this.current.value.toLowerCase();
      this.advance();
      this.advance();
    }
    const value = this.parseExpression(0);
    if (this.current.value !== "}") {
      this.error("Expected closing } for break block");
    }
    this.advance();
    return this.createNode("BreakBlock", {
      ...targetType ? { targetType } : {},
      ...targetName ? { targetName } : {},
      value,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseTensorLiteral(startToken, headerText) {
    const shape = headerText.split("x").map((part) => {
      const dim = Number(part);
      if (!Number.isInteger(dim) || dim < 0) {
        this.error(`Invalid tensor dimension '${part}'`);
      }
      return dim;
    });
    const size = shape.reduce((product, dim) => product * dim, 1);
    let elements = [];
    const header = this.parseSemanticHeader();
    if (size === 0) {
      if (this.current.value !== "}") {
        this.error(`Tensor literal shape ${shape.join("x")} has size 0 and must not contain elements`);
      }
    } else if (this.current.value !== "}") {
      if (shape.length === 2 && this.current.value === "[") {
        elements = this.parseTensorRowArrayPattern(shape);
      } else {
        const displayTree = this.parseTensorDisplayLevel(this.getTensorDisplayLevels(shape), 0, shape);
        elements = this.flattenTensorDisplayTree(displayTree, shape);
      }
    }
    if (this.current.value !== "}") {
      this.error("Expected closing brace for tensor literal");
    }
    this.advance();
    return this.createNode("TensorLiteral", {
      shape,
      ...header ? { header } : {},
      elements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseTensorRowArrayPattern(shape) {
    const [rows, cols] = shape;
    const elements = [];
    for (let row = 0;row < rows; row++) {
      const rowExpr = this.parseArray();
      if (rowExpr.type !== "Array" || rowExpr.elements.length !== cols) {
        this.error(`Malformed tensor destructure row: expected [..] with ${cols} entries`);
      }
      elements.push(...rowExpr.elements);
      if (row < rows - 1) {
        if (this.current.value !== ",") {
          this.error(`Tensor destructuring shape ${shape.join("x")} expects ',' between row arrays`);
        }
        this.advance();
      }
    }
    return elements;
  }
  getTensorDisplayLevels(shape) {
    if (shape.length === 0) {
      return [];
    }
    if (shape.length === 1) {
      return [{ size: shape[0], separatorCount: 0, label: "entry" }];
    }
    const levels = [];
    for (let axis = shape.length - 1;axis >= 2; axis--) {
      levels.push({
        size: shape[axis],
        separatorCount: axis,
        label: `axis ${axis + 1}`
      });
    }
    levels.push({ size: shape[0], separatorCount: 1, label: "row" });
    levels.push({ size: shape[1], separatorCount: 0, label: "column" });
    return levels;
  }
  parseTensorDisplayLevel(levels, levelIndex, shape) {
    const level = levels[levelIndex];
    if (!level) {
      return null;
    }
    if (level.separatorCount === 0) {
      const values = [];
      for (let i = 0;i < level.size; i++) {
        values.push(this.parseExpression(0));
        if (i < level.size - 1) {
          if (this.current.value !== ",") {
            this.error(`Tensor literal shape ${shape.join("x")} expects ${level.size} columns per row`);
          }
          this.advance();
        }
      }
      return values;
    }
    const groups = [];
    for (let i = 0;i < level.size; i++) {
      groups.push(this.parseTensorDisplayLevel(levels, levelIndex + 1, shape));
      if (i < level.size - 1) {
        const consumed = this.consumeSemicolonSequence();
        if (consumed !== level.separatorCount) {
          const sepText = ";".repeat(level.separatorCount);
          this.error(`Tensor literal shape ${shape.join("x")} expects '${sepText}' between ${level.label}s`);
        }
      }
    }
    return groups;
  }
  flattenTensorDisplayTree(tree, shape) {
    if (shape.length === 1) {
      return tree;
    }
    const elements = [];
    const path = [];
    const getValueAtDisplayPath = (displayPath) => {
      let node = tree;
      for (const idx of displayPath) {
        node = node[idx - 1];
      }
      return node;
    };
    const visitExternal = (axis) => {
      if (axis === shape.length) {
        const higher = path.slice(2).reverse();
        const displayPath = [...higher, path[0], path[1]];
        elements.push(getValueAtDisplayPath(displayPath));
        return;
      }
      for (let i = 1;i <= shape[axis]; i++) {
        path.push(i);
        visitExternal(axis + 1);
        path.pop();
      }
    };
    visitExternal(0);
    return elements;
  }
  parseBracketIndex(left, operator) {
    const specs = [];
    if (this.current.value !== "]") {
      do {
        specs.push(this.parseBracketSpec());
        if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "]") {
            this.error("Trailing comma is not allowed in bracket indexing");
          }
          continue;
        }
        break;
      } while (this.current.type !== "End");
    }
    if (this.current.value !== "]") {
      this.error("Expected closing bracket");
    }
    this.advance();
    if (specs.length === 1 && specs[0].type !== "SliceSpec" && specs[0].type !== "FullSlice") {
      return this.createNode("PropertyAccess", {
        object: left,
        property: specs[0],
        pos: left.pos,
        original: left.original + operator.original
      });
    }
    return this.createNode("BracketIndex", {
      object: left,
      specs,
      pos: left.pos,
      original: left.original + operator.original
    });
  }
  parseBracketSpec() {
    const token = this.current;
    if (token.value === "::") {
      this.advance();
      return this.createNode("FullSlice", {
        pos: token.pos,
        original: token.original
      });
    }
    const expr = this.parseExpression(0);
    if (expr && expr.type === "BinaryOperation" && expr.operator === ":") {
      return this.createNode("SliceSpec", {
        start: expr.left,
        end: expr.right,
        pos: expr.pos,
        original: expr.original
      });
    }
    return expr;
  }
  startsImportHeader() {
    return this.current.value === "<" || this.current.value === "<>";
  }
  normalizeImportIdentifierName(name) {
    let firstLetter = null;
    for (let i = 0;i < name.length; i++) {
      if (/[\p{L}]/u.test(name[i])) {
        firstLetter = name[i];
        break;
      }
    }
    const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
    return isCapital ? name.toUpperCase() : name.toLowerCase();
  }
  parseImportHeader() {
    const startIndex = this.position - 1;
    let raw = "";
    let endIndex = -1;
    for (let i = startIndex;i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if (token.type === "String" && token.kind === "comment") {
        continue;
      }
      const original = token.original ?? String(token.value ?? "");
      const start = i === startIndex ? original.indexOf("<") + 1 : 0;
      const end = original.indexOf(">", start);
      if (end !== -1) {
        raw += original.slice(start, end);
        endIndex = i;
        break;
      }
      raw += original.slice(start);
    }
    if (endIndex === -1) {
      this.error("Unterminated import header");
    }
    this.position = endIndex + 1;
    this.advance();
    const text = raw.trim();
    if (!text.length) {
      this.error("Import header cannot be empty");
    }
    const seenLocals = new Set;
    const imports = [];
    const pieces = raw.split(",");
    for (const piece of pieces) {
      const spec = piece.trim();
      if (!spec.length) {
        this.error("Trailing comma is not allowed in import header");
      }
      const match = spec.match(/^([\p{L}_][\p{L}\p{N}_]*)(?:\s*([~=])\s*([\p{L}_][\p{L}\p{N}_]*)?)?$/u);
      if (!match) {
        this.error("Malformed import header");
      }
      const [, rawLocal, operator, rawExplicitSource] = match;
      const local = this.normalizeImportIdentifierName(rawLocal);
      const explicitSource = rawExplicitSource ? this.normalizeImportIdentifierName(rawExplicitSource) : undefined;
      const mode = operator === "=" ? "alias" : "copy";
      const source = explicitSource || local;
      if (seenLocals.has(local)) {
        this.error(`Duplicate import target '${local}' in block import header`);
      }
      seenLocals.add(local);
      imports.push({ local, source, mode });
    }
    return imports;
  }
  parseAngleForm() {
    const startToken = this.current;
    this.advance();
    if (this.current.value === ">") {
      this.error("Angle form cannot be empty");
    }
    if (this.current.type === "String" && this.current.kind !== "comment" && this.current.kind !== "backtick") {
      return this.parseScriptImportExpression(startToken);
    }
    const bindings = this.parseScriptBindingSpecs({ allowOuterSource: false });
    if (this.current.value !== ">") {
      this.error("Expected closing > for script declaration");
    }
    this.advance();
    return this.createNode("ScriptBindingsDeclaration", {
      bindings,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseScriptImportExpression(startToken) {
    const pathToken = this.current;
    this.advance();
    const pathNode = this.createNode("String", {
      value: pathToken.value,
      kind: pathToken.kind,
      original: pathToken.original
    });
    const capabilityModifiers = this.current.value === "/" ? this.parseCapabilityModifierList() : [];
    const inputs = this.current.value !== ">" && this.current.value !== ";" ? this.parseScriptBindingSpecs({ allowOuterSource: true }) : [];
    let outputs = [];
    if (this.current.value === ";") {
      this.advance();
      outputs = this.current.value !== ">" ? this.parseScriptBindingSpecs({ allowOuterSource: false }) : [];
    }
    if (this.current.value !== ">") {
      this.error("Expected closing > for script import expression");
    }
    this.advance();
    return this.createNode("ScriptImportExpression", {
      path: pathNode,
      ...capabilityModifiers.length > 0 ? { capabilityModifiers } : {},
      ...inputs.length > 0 ? { inputs } : {},
      ...outputs.length > 0 ? { outputs } : {},
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseCapabilityModifierList() {
    this.advance();
    const modifiers = [];
    while (this.current.type !== "End" && this.current.value !== "/") {
      if (this.current.value !== "+" && this.current.value !== "-") {
        this.error("Capability modifiers must start with + or -");
      }
      const action = this.current.value === "+" ? "add" : "remove";
      this.advance();
      let targetType;
      let target;
      if (this.current.type === "Identifier" && this.current.value.toUpperCase() === "ALL") {
        targetType = "all";
        target = "All";
        this.advance();
      } else if (this.current.type === "OuterIdentifier") {
        targetType = "function";
        target = this.current.value;
        this.advance();
      } else if (this.current.type === "Identifier") {
        targetType = "group";
        target = this.current.original.trim();
        this.advance();
      } else {
        this.error("Expected capability group name, All, or @Function in capability modifiers");
      }
      modifiers.push({ action, targetType, target });
      if (this.current.value === ",") {
        this.advance();
        if (this.current.value === "/") {
          this.error("Trailing comma is not allowed in capability modifiers");
        }
      } else if (this.current.value !== "/") {
        this.error("Expected ',' or closing / in capability modifiers");
      }
    }
    if (this.current.value !== "/") {
      this.error("Unterminated capability modifier list");
    }
    this.advance();
    return modifiers;
  }
  parseScriptBindingSpecs(options = {}) {
    const allowOuterSource = options.allowOuterSource === true;
    const seenTargets = new Set;
    const specs = [];
    while (this.current.type !== "End" && this.current.value !== ">" && this.current.value !== ";") {
      const spec = this.parseScriptBindingSpec({ allowOuterSource });
      if (seenTargets.has(spec.target)) {
        this.error(`Duplicate binding target '${spec.target}'`);
      }
      seenTargets.add(spec.target);
      specs.push(spec);
      if (this.current.value === ",") {
        this.advance();
        if (this.current.value === ">" || this.current.value === ";") {
          this.error("Trailing comma is not allowed in script bindings");
        }
      } else if (this.current.value !== ">" && this.current.value !== ";") {
        this.error("Expected ',' or end of script bindings");
      }
    }
    return specs;
  }
  parseScriptBindingSpec(options = {}) {
    const allowOuterSource = options.allowOuterSource === true;
    const target = this.parseScriptBindingName("Expected binding target name");
    let mode = "copy";
    let source = target.name;
    let sourceScope = "current";
    if (this.current.value === "=") {
      mode = "alias";
      this.advance();
      if (this.current.type === "Identifier" || this.current.type === "OuterIdentifier") {
        const sourceRef = this.parseScriptBindingSource(allowOuterSource);
        source = sourceRef.name;
        sourceScope = sourceRef.scope;
      }
    } else if (this.current.value === "::") {
      mode = "deep_copy_meta";
      this.advance();
      if (this.current.type === "Identifier" || this.current.type === "OuterIdentifier") {
        const sourceRef = this.parseScriptBindingSource(allowOuterSource);
        source = sourceRef.name;
        sourceScope = sourceRef.scope;
      }
    } else if (this.current.value === "~") {
      this.advance();
      if (this.current.value === "~") {
        mode = "deep_copy";
        this.advance();
      } else {
        mode = "copy";
      }
      if (this.current.type === "Identifier" || this.current.type === "OuterIdentifier") {
        const sourceRef = this.parseScriptBindingSource(allowOuterSource);
        source = sourceRef.name;
        sourceScope = sourceRef.scope;
      }
    } else if (this.current.value === ":") {
      this.advance();
      if (this.current.value === ":") {
        mode = "deep_copy_meta";
        this.advance();
      } else {
        mode = "copy_meta";
      }
      if (this.current.type === "Identifier" || this.current.type === "OuterIdentifier") {
        const sourceRef = this.parseScriptBindingSource(allowOuterSource);
        source = sourceRef.name;
        sourceScope = sourceRef.scope;
      }
    }
    return {
      target: target.name,
      source,
      mode,
      ...sourceScope !== "current" ? { sourceScope } : {}
    };
  }
  parseScriptBindingName(message) {
    if (this.current.type !== "Identifier") {
      this.error(message);
    }
    const name = this.current.value;
    this.advance();
    return { name };
  }
  parseScriptBindingSource(allowOuterSource) {
    if (this.current.type === "OuterIdentifier") {
      if (!allowOuterSource) {
        this.error("Ancestor scope sources are not allowed in this binding list");
      }
      const name2 = this.current.value;
      this.advance();
      return { name: name2, scope: "ancestor" };
    }
    if (this.current.type !== "Identifier") {
      this.error("Expected binding source name");
    }
    const name = this.current.value;
    this.advance();
    return { name, scope: "current" };
  }
  parseMutation(target) {
    const sigil = this.current.value;
    const mutate = sigil === "{!";
    const startToken = this.current;
    this.advance();
    const operations = [];
    if (this.current.value !== "}") {
      do {
        const op = { action: null, key: null, value: null };
        if (this.current.value === "+") {
          op.action = "add";
          this.advance();
        } else if (this.current.value === "-") {
          op.action = "remove";
          this.advance();
          if (this.current.value === ".") {
            this.advance();
          }
        } else {
          op.action = "add";
        }
        if (this.current.type === "Identifier") {
          op.key = this.current.value;
          this.advance();
        } else {
          this.error("Expected property name in mutation");
        }
        if (op.action === "add" && (this.current.value === "=" || this.current.value === ":=")) {
          this.advance();
          op.value = this.parseExpression(PRECEDENCE.CONDITION + 1);
        }
        operations.push(op);
        if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "}")
            break;
        } else if (this.current.value === "}") {
          break;
        } else {
          break;
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }
    if (this.current.value !== "}") {
      this.error("Expected closing } for mutation");
    }
    this.advance();
    return this.createNode("Mutation", {
      target,
      mutate,
      operations,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseUnaryOperator() {
    const operator = this.current;
    this.advance();
    const operand = this.parseExpression(PRECEDENCE.UNARY);
    return this.createNode("UnaryOperation", {
      operator: operator.value,
      operand,
      pos: operator.pos,
      original: operator.original
    });
  }
  parseDerivative(left) {
    const quotes = [];
    let originalText = "";
    while (this.current.value === "'") {
      quotes.push(this.current);
      originalText += this.current.original;
      this.advance();
    }
    let variables = null;
    if (this.current.value === "[") {
      this.advance();
      variables = this.parseVariableList();
      if (this.current.value !== "]") {
        this.error("Expected closing bracket after variable list");
      }
      originalText += this.current.original;
      this.advance();
    }
    let evaluation = null;
    let operations = null;
    if (this.current.value === "(") {
      const parenResult = this.parseCalculusParentheses();
      if (parenResult.isEvaluation) {
        evaluation = parenResult.content;
      } else {
        operations = parenResult.content;
      }
      originalText += parenResult.original;
    }
    return this.createNode("Derivative", {
      function: left,
      order: quotes.length,
      variables,
      evaluation,
      operations,
      pos: left.pos,
      original: left.original + originalText
    });
  }
  parseIntegral() {
    const quotes = [];
    let originalText = "";
    while (this.current.value === "'") {
      quotes.push(this.current);
      originalText += this.current.original;
      this.advance();
    }
    let func = null;
    if (this.current.type === "Identifier") {
      if (this.current.kind === "System") {
        const systemInfo = this.systemLookup(this.current.value);
        func = this.createNode("SystemIdentifier", {
          name: this.current.value,
          systemInfo,
          original: this.current.original
        });
      } else {
        func = this.createNode("UserIdentifier", {
          name: this.current.value,
          original: this.current.original
        });
      }
      this.advance();
    } else {
      this.error("Expected function name after integral operator");
    }
    let variables = null;
    if (this.current.value === "[") {
      this.advance();
      variables = this.parseVariableList();
      if (this.current.value !== "]") {
        this.error("Expected closing bracket after variable list");
      }
      originalText += this.current.original;
      this.advance();
    }
    let evaluation = null;
    let operations = null;
    if (this.current.value === "(") {
      const parenResult = this.parseCalculusParentheses();
      if (parenResult.isEvaluation) {
        evaluation = parenResult.content;
      } else {
        operations = parenResult.content;
      }
      originalText += parenResult.original;
    }
    return this.createNode("Integral", {
      function: func,
      order: quotes.length,
      variables,
      evaluation,
      operations,
      metadata: { integrationConstant: "c", defaultValue: 0 },
      pos: quotes[0].pos,
      original: originalText + func.original
    });
  }
  parseVariableList() {
    const variables = [];
    if (this.current.value !== "]") {
      do {
        if (this.current.type === "Identifier") {
          variables.push({
            name: this.current.value,
            original: this.current.original
          });
          this.advance();
        } else {
          this.error("Expected variable name in variable list");
        }
        if (this.current.value === ",") {
          this.advance();
        } else if (this.current.value === "]") {
          break;
        } else {
          this.error("Expected comma or closing bracket in variable list");
        }
      } while (true);
    }
    return variables;
  }
  parseCalculusParentheses() {
    const startToken = this.current;
    this.advance();
    let isEvaluation = true;
    const content = [];
    let originalText = startToken.original;
    while (this.current.value !== ")" && this.current.type !== "End") {
      const expr = this.parseExpression(0);
      content.push(expr);
      if (this.containsCalculusOperations(expr)) {
        isEvaluation = false;
      }
      if (this.current.value === ",") {
        originalText += this.current.original;
        this.advance();
      } else {
        break;
      }
    }
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis");
    }
    originalText += this.current.original;
    this.advance();
    return {
      isEvaluation,
      content,
      original: originalText
    };
  }
  containsCalculusOperations(expr) {
    if (!expr || typeof expr !== "object")
      return false;
    if (expr.type === "Derivative" || expr.type === "Integral") {
      return true;
    }
    if (expr.type === "UserIdentifier" && expr.name) {
      return expr.name.includes("'");
    }
    if (expr.left && this.containsCalculusOperations(expr.left))
      return true;
    if (expr.right && this.containsCalculusOperations(expr.right))
      return true;
    if (expr.function && this.containsCalculusOperations(expr.function))
      return true;
    if (expr.elements) {
      for (const element of expr.elements) {
        if (this.containsCalculusOperations(element))
          return true;
      }
    }
    return false;
  }
  parseFunctionArgs() {
    const args = [];
    if (this.current.value !== ")") {
      do {
        args.push(this.parseExpression(0));
        if (this.current.value === ",") {
          this.advance();
        } else {
          break;
        }
      } while (this.current.value !== ")" && this.current.type !== "End");
    }
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in function call");
    }
    this.advance();
    return args;
  }
  parseFunctionParameters() {
    const params = {
      positional: [],
      keyword: [],
      conditionals: [],
      metadata: {}
    };
    if (this.current.value === ")") {
      return params;
    }
    let inKeywordSection = false;
    while (this.current.value !== ")" && this.current.type !== "End") {
      if (this.current.value === ";") {
        inKeywordSection = true;
        this.advance();
        continue;
      }
      const param = this.parseFunctionParameter(inKeywordSection);
      if (inKeywordSection) {
        params.keyword.push(param);
      } else {
        params.positional.push(param);
      }
      if (this.current.value === "?") {
        this.advance();
        const condition = this.parseExpression(PRECEDENCE.CONDITION + 1);
        params.conditionals.push(condition);
      }
      if (this.current.value === ",") {
        this.advance();
      } else if (this.current.value !== ")" && this.current.value !== ";") {
        break;
      }
    }
    return params;
  }
  parseFunctionParameter(isKeywordOnly = false) {
    const param = {
      name: null,
      defaultValue: null
    };
    if (this.current.type === "Identifier" && this.current.kind === "User") {
      param.name = this.current.value;
      this.advance();
    } else {
      this.error("Expected parameter name");
    }
    if (this.current.value === "?=") {
      this.advance();
      param.holeDefault = this.parseExpression(PRECEDENCE.CONDITION + 1);
    }
    return param;
  }
  parseFunctionCallArgs() {
    const args = {
      positional: [],
      keyword: {}
    };
    if (this.current.value === ")") {
      return args;
    }
    let inKeywordSection = false;
    while (this.current.value !== ")" && this.current.type !== "End") {
      if (this.current.value === ";") {
        inKeywordSection = true;
        this.advance();
        continue;
      }
      if (inKeywordSection) {
        if (this.current.type === "Identifier" && this.current.kind === "User") {
          const keyName = this.current.value;
          const keyPos = this.current.pos;
          const keyOriginal = this.current.original;
          this.advance();
          if (this.current.value === ":=") {
            this.advance();
            const value = this.parseExpression(PRECEDENCE.ASSIGNMENT + 1);
            args.keyword[keyName] = value;
          } else {
            args.keyword[keyName] = this.createNode("UserIdentifier", {
              name: keyName,
              pos: keyPos,
              original: keyOriginal
            });
          }
        } else {
          this.error("Expected identifier for keyword argument");
        }
      } else {
        if (this.current.value === "," || this.current.value === ")") {
          args.positional.push(this.createNode("Hole", { original: "" }));
        } else {
          args.positional.push(this.parseExpression(0));
        }
      }
      if (this.current.value === ",") {
        this.advance();
        if (this.current.value === ")") {
          args.positional.push(this.createNode("Hole", { original: "" }));
        }
      } else if (this.current.value !== ")" && this.current.value !== ";") {
        break;
      }
    }
    return args;
  }
  convertArgsToParams(args) {
    const params = {
      positional: [],
      keyword: [],
      conditionals: [],
      metadata: {}
    };
    if (args.positional && args.keyword) {
      for (const arg of args.positional) {
        const result = this.parseParameterFromArg(arg, false);
        params.positional.push(result.param);
        if (result.condition) {
          params.conditionals.push(result.condition);
        }
      }
      for (const [key, value] of Object.entries(args.keyword)) {
        const param = {
          name: key,
          defaultValue: null
        };
        if (value.type === "BinaryOperation" && value.operator === "?") {
          param.defaultValue = value.left;
          params.conditionals.push(value.right);
        } else {
          param.defaultValue = value;
        }
        params.keyword.push(param);
      }
    } else if (Array.isArray(args)) {
      for (const arg of args) {
        const result = this.parseParameterFromArg(arg, false);
        params.positional.push(result.param);
        if (result.condition) {
          params.conditionals.push(result.condition);
        }
      }
    }
    return params;
  }
  extractNamedFunctionSignature(left) {
    let funcName = left;
    let parameters = { positional: [], keyword: [], conditionals: [], metadata: {} };
    if (left.type === "FunctionCall") {
      funcName = left.function;
      parameters = this.convertArgsToParams(left.arguments);
      return { funcName, parameters };
    }
    if (left.type === "ImplicitMultiplication") {
      funcName = left.left;
      parameters = { positional: [], keyword: [], conditionals: [], metadata: {} };
      const paramExpr = left.right;
      if (paramExpr.type === "Grouping" && paramExpr.expression) {
        if (paramExpr.expression.type === "ParameterList") {
          parameters = paramExpr.expression.parameters;
        } else if (paramExpr.expression.type === "UserIdentifier") {
          parameters.positional.push({ name: paramExpr.expression.name, defaultValue: null });
        } else if (paramExpr.expression.type === "BinaryOperation" && paramExpr.expression.operator === "?") {
          const paramName = paramExpr.expression.left.name || paramExpr.expression.left.value;
          parameters.positional.push({ name: paramName, defaultValue: null });
          parameters.conditionals.push(paramExpr.expression.right);
        }
      } else if (paramExpr.type === "Tuple") {
        for (const el of paramExpr.elements) {
          const result = this.parseParameterFromArg(el, false);
          parameters.positional.push(result.param);
          if (result.condition) {
            parameters.conditionals.push(result.condition);
          }
        }
      }
      return { funcName, parameters };
    }
    return null;
  }
  canHaveFunctionVariantHeader(left) {
    return Boolean(this.extractNamedFunctionSignature(left) || this.extractLambdaParameters(left));
  }
  looksLikeFunctionVariantHeader() {
    const t1 = this.tokens[this.position - 1];
    const t2 = this.tokens[this.position];
    const t3 = this.tokens[this.position + 1];
    const t4 = this.tokens[this.position + 2];
    return t1?.value === "/" && t2?.type === "Identifier" && t3?.value === "/" && ["->", "=>", "^=>"].includes(t4?.value);
  }
  parseFunctionVariantHeader() {
    if (this.current.value !== "/") {
      return null;
    }
    this.advance();
    if (this.current.type !== "Identifier") {
      this.error("Expected variant name inside /.../");
    }
    const name = this.current.original.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      this.error("Variant names must start with a letter and contain only letters, digits, or underscores");
    }
    this.advance();
    if (this.current.value !== "/") {
      this.error("Unterminated variant name header");
    }
    this.advance();
    return name;
  }
  buildFunctionArrowNode(left, operator, body, options = {}) {
    const { prep = null, prepStrict = false, variantName = null } = options;
    const namedSig = this.extractNamedFunctionSignature(left);
    if (operator === "=>" || operator === "^=>") {
      if (!namedSig) {
        return null;
      }
      return this.createNode("FunctionVariantDefinition", {
        name: namedSig.funcName,
        parameters: namedSig.parameters,
        prep,
        prepStrict,
        ...variantName ? { variantName } : {},
        mode: operator === "^=>" ? "prepend" : "append",
        body,
        pos: left.pos,
        original: left.original
      });
    }
    if (namedSig) {
      return this.createNode("FunctionDefinition", {
        name: namedSig.funcName,
        parameters: namedSig.parameters,
        prep,
        prepStrict,
        ...variantName ? { variantName } : {},
        body,
        pos: left.pos,
        original: left.original
      });
    }
    const lambdaParameters = this.extractLambdaParameters(left);
    if (lambdaParameters) {
      return this.createNode("FunctionLambda", {
        parameters: lambdaParameters,
        prep,
        prepStrict,
        ...variantName ? { variantName } : {},
        body,
        pos: left.pos,
        original: left.original
      });
    }
    return null;
  }
  extractLambdaParameters(left) {
    if (left.type === "Grouping" && left.expression && left.expression.type === "ParameterList") {
      return left.expression.parameters;
    }
    if (left.type === "Grouping" && left.expression) {
      const parameters = {
        positional: [],
        keyword: [],
        conditionals: [],
        metadata: {}
      };
      const result = this.parseParameterFromArg(left.expression, false);
      if (result.param.name) {
        parameters.positional.push(result.param);
        if (result.condition) {
          parameters.conditionals.push(result.condition);
        }
      }
      return parameters;
    }
    if (left.type === "Tuple") {
      const parameters = {
        positional: [],
        keyword: [],
        conditionals: [],
        metadata: {}
      };
      for (const element of left.elements) {
        const result = this.parseParameterFromArg(element, false);
        if (result.param.name) {
          parameters.positional.push(result.param);
          if (result.condition) {
            parameters.conditionals.push(result.condition);
          }
        }
      }
      return parameters;
    }
    if (left.type === "UserIdentifier") {
      return {
        positional: [{ name: left.name, defaultValue: null }],
        keyword: [],
        conditionals: [],
        metadata: {}
      };
    }
    return null;
  }
  parseEmbeddedLanguage(token) {
    const content = token.value;
    if (content.startsWith(".")) {
      let depth = 0;
      let colonIndex = -1;
      for (let index = 1;index < content.length; index++) {
        const character = content[index];
        if (character === "(")
          depth++;
        else if (character === ")") {
          depth--;
          if (depth < 0)
            this.error("Unmatched ')' in backtick parser header");
        } else if (character === ":" && depth === 0) {
          colonIndex = index;
          break;
        }
      }
      if (colonIndex === -1) {
        this.error("Named backtick parser header requires ':' after .Name[.modifier...]");
      }
      if (depth !== 0)
        this.error("Unmatched '(' in backtick parser header");
      const header = content.slice(1, colonIndex).trim();
      const parts = [];
      let start = 0;
      depth = 0;
      for (let index = 0;index <= header.length; index++) {
        const character = header[index];
        if (character === "(")
          depth++;
        else if (character === ")")
          depth--;
        if (character === "." && depth === 0 || index === header.length) {
          parts.push(header.slice(start, index).trim());
          start = index + 1;
        }
      }
      const parsedParts = parts.map((part) => {
        const match = part.match(/^([\p{L}_][\p{L}\p{N}_]*)(?:\((.*)\))?$/u);
        if (!match)
          return null;
        const args = match[2] === undefined ? null : match[2].split(",").map((argument) => argument.trim()).filter(Boolean);
        if (args?.some((argument) => !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(argument))) {
          return null;
        }
        return args === null ? match[1] : { name: match[1], args };
      });
      if (parsedParts.length === 0 || parsedParts.some((part) => part === null)) {
        this.error("Invalid backtick parser header. Expected .Name[.modifier...]:body");
      }
      if (typeof parsedParts[0] !== "string") {
        this.error("The backtick parser name cannot have arguments");
      }
      return this.createNode("EmbeddedLanguage", {
        language: parsedParts[0],
        context: null,
        modifiers: parsedParts.slice(1),
        body: content.slice(colonIndex + 1),
        explicitParser: true,
        original: token.original
      });
    }
    if (content.startsWith(":")) {
      return this.createNode("EmbeddedLanguage", {
        language: "RiX-String",
        context: null,
        body: content.slice(1),
        original: token.original
      });
    }
    return this.createNode("EmbeddedLanguage", {
      language: "SArith",
      context: null,
      body: content,
      original: token.original
    });
  }
  parseParameterFromArg(arg, inKeywordSection) {
    const result = {
      param: {
        name: null,
        defaultValue: null
      },
      condition: null
    };
    if (arg.type === "Spread") {
      result.param.isRest = true;
      const inner = arg.expression;
      if (inner.type === "UserIdentifier" || inner.type === "Identifier" && inner.kind === "User") {
        result.param.name = inner.name || inner.value;
      } else {
        this.error("Rest parameter must be an identifier");
      }
    } else if (arg.type === "BinaryOperation" && arg.operator === "?=") {
      result.param.name = arg.left.name || arg.left.value;
      result.param.holeDefault = arg.right;
    } else if (arg.type === "BinaryOperation" && arg.operator === "?") {
      result.param.name = arg.left.name || arg.left.value;
      result.condition = arg.right;
    } else if (arg.type === "UserIdentifier" || arg.type === "Identifier" && arg.kind === "User") {
      result.param.name = arg.name || arg.value;
    }
    return result;
  }
  parseStatement() {
    if (this.current.type === "End") {
      return null;
    }
    if (this.current.type === "String" && this.current.kind === "comment") {
      const commentToken = this.current;
      this.advance();
      return this.createNode("Comment", {
        value: commentToken.value,
        kind: commentToken.kind,
        original: commentToken.original,
        pos: commentToken.pos
      });
    }
    const expr = this.parseExpression(0);
    if (this.current.value === ";") {
      this.advance();
      return this.createNode("Statement", {
        expression: expr,
        pos: expr.pos,
        original: expr.original
      });
    }
    return expr;
  }
  drainComments(statements) {
    while (this.skippedComments.length > 0) {
      const commentToken = this.skippedComments.shift();
      statements.push(this.createNode("Comment", {
        value: commentToken.value,
        kind: commentToken.kind,
        original: commentToken.original,
        pos: commentToken.pos
      }));
    }
  }
  parse() {
    const statements = [];
    this.drainComments(statements);
    while (this.current.type !== "End") {
      if (this.current.type === "String" && this.current.kind === "comment") {
        const commentToken = this.current;
        this.advance();
        statements.push(this.createNode("Comment", {
          value: commentToken.value,
          kind: commentToken.kind,
          original: commentToken.original,
          pos: commentToken.pos
        }));
        this.drainComments(statements);
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
      this.drainComments(statements);
    }
    return statements;
  }
  parseCall(target) {
    if (target.type === "UserIdentifier" && /^[\p{L}]/u.test(target.name) || target.type === "Number" || target.type === "Grouping" && !this.isCallableNode(target)) {
      const grouping = this.parseGrouping();
      return this.createNode("ImplicitMultiplication", {
        left: target,
        right: grouping,
        pos: [target.pos[0], target.pos[0], grouping.pos[2]],
        original: target.original + grouping.original
      });
    }
    this.advance();
    const args = this.parseFunctionCallArgs();
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in function call");
    }
    this.advance();
    if (target.type === "SystemFunctionRef") {
      return this.createNode("SystemCall", {
        name: target.name,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)"
      });
    }
    if (target.type === "SystemAccess") {
      return this.createNode("SystemCall", {
        name: target.property,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)",
        viaSystemContext: true
      });
    }
    if (target.type === "DotAccess") {
      return this.createNode("MethodCall", {
        object: target.object,
        method: target.property,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)"
      });
    }
    if (target.type === "SystemIdentifier" || target.type === "UserIdentifier") {
      return this.createNode("FunctionCall", {
        function: target,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)"
      });
    }
    return this.createNode("Call", {
      target,
      arguments: args,
      pos: target.pos,
      original: target.original + "(...)"
    });
  }
  parseAt(target) {
    this.advance();
    if (this.current.value !== "(") {
      this.error("Expected opening parenthesis after @ operator");
    }
    this.advance();
    const arg = this.parseExpression(0);
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in @ operator");
    }
    this.advance();
    return this.createNode("At", {
      target,
      arg,
      pos: target.pos,
      original: target.original + "@(" + (arg.original || "") + ")"
    });
  }
  parseAsk(target) {
    this.advance();
    if (this.current.value !== "(") {
      this.error("Expected opening parenthesis after ? operator");
    }
    this.advance();
    const arg = this.parseExpression(0);
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in ? operator");
    }
    this.advance();
    return this.createNode("Ask", {
      target,
      arg,
      pos: target.pos,
      original: target.original + "?(" + (arg.original || "") + ")"
    });
  }
  parseScientificUnit(target) {
    const startToken = this.current;
    this.advance();
    let unitContent = "";
    let unitOriginal = "";
    while (this.current.type !== "End") {
      if (this.current.value === "[") {
        this.error("Nested '[' not allowed inside scientific unit ~[...]");
      } else if (this.current.value === "]") {
        break;
      }
      unitContent += this.current.original;
      unitOriginal += this.current.original;
      this.advance();
    }
    if (this.current.value !== "]") {
      this.error("Expected closing bracket ] for scientific unit");
    }
    this.advance();
    return this.createNode("ScientificUnit", {
      target,
      unit: unitContent.trim(),
      pos: target.pos,
      original: target.original + startToken.original + unitOriginal + "]"
    });
  }
  parseMathematicalUnit(target) {
    const startToken = this.current;
    this.advance();
    let unitContent = "";
    let unitOriginal = "";
    while (this.current.type !== "End") {
      if (this.current.value === "{") {
        this.error("Nested '{' not allowed inside mathematical unit ~{...}");
      } else if (this.current.value === "}") {
        break;
      }
      unitContent += this.current.original;
      unitOriginal += this.current.original;
      this.advance();
    }
    if (this.current.value !== "}") {
      this.error("Expected closing brace } for mathematical unit");
    }
    this.advance();
    return this.createNode("MathematicalUnit", {
      target,
      unit: unitContent.trim(),
      pos: target.pos,
      original: target.original + startToken.original + unitOriginal + "}"
    });
  }
}
function parse(input, systemLookup, options = {}) {
  let tokens;
  let source = "";
  if (typeof input === "string") {
    source = input;
    tokens = tokenize(input);
  } else {
    tokens = input;
    source = options.source || "";
  }
  const localOperators = extractOperatorDeclarations(tokens, {
    source,
    owner: options.operatorOwner || null,
    label: options.file || "source"
  });
  const customOperators = mergeOperatorDefinitions(options.operatorDefinitions, localOperators);
  const parser = new Parser(tokens, systemLookup, source, customOperators);
  return parser.parse();
}
// documentation/parser/src/demo.js
var inputExpression = document.getElementById("input-expression");
var parseButton = document.getElementById("parse-button");
var astTree = document.getElementById("ast-tree");
var tokensList = document.getElementById("tokens-list");
var rawOutput = document.getElementById("raw-output");
var diagnosticsContent = document.getElementById("diagnostics-content");
var nodeModal = document.getElementById("node-modal");
var modalTitle = document.getElementById("modal-title");
var modalContent = document.getElementById("modal-content");
var modalCloseButton = document.getElementById("modal-close");
var closeButton = document.querySelector(".close-button");
var examplesDropdown = document.getElementById("examples-dropdown");
var copyButton = document.getElementById("copy-button");
var clearButton = document.getElementById("clear-button");
var tabButtons = document.querySelectorAll(".tab-button");
var tabPanels = document.querySelectorAll(".tab-panel");
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetTab = button.getAttribute("data-tab");
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(`${targetTab}-tab`).classList.add("active");
  });
});
parseButton.addEventListener("click", parseExpression);
inputExpression.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    parseExpression();
  } else if (e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    parseExpression();
  }
});
function parseExpression() {
  const expression = inputExpression.value.trim();
  if (!expression) {
    showPlaceholder();
    return;
  }
  try {
    const tokens = tokenize(expression);
    displayTokens(tokens);
    const ast = parse(expression);
    displayAST(ast);
    displayRaw(ast);
    displayDiagnostics([]);
  } catch (error) {
    displayError(error);
  }
}
function displayTokens(tokens) {
  tokensList.innerHTML = "";
  tokens.forEach((token) => {
    const tokenElement = document.createElement("div");
    tokenElement.className = "token-item";
    tokenElement.innerHTML = `
            <span class="token-type">${token.type}</span>
            <span class="token-value">${escapeHtml(token.value)}</span>
        `;
    tokensList.appendChild(tokenElement);
  });
}
function displayAST(ast) {
  astTree.innerHTML = "";
  const rootNode = createTreeNode(ast, "Program");
  astTree.appendChild(rootNode);
}
function createTreeNode(node, nodeName = null, isRoot = false) {
  const treeNode = document.createElement("div");
  treeNode.className = "tree-node";
  const header = document.createElement("div");
  header.className = "node-header";
  const compactContent = createCompactNodeDisplay(node, nodeName);
  header.appendChild(compactContent.main);
  if (compactContent.hasMetadata) {
    const metaToggle = document.createElement("span");
    metaToggle.className = "meta-toggle";
    metaToggle.textContent = "▼";
    metaToggle.title = "Show/hide original and position data";
    header.appendChild(metaToggle);
    const metaContainer = document.createElement("div");
    metaContainer.className = "metadata-container";
    metaContainer.style.display = "none";
    if (node && typeof node === "object" && node.original) {
      const originalDiv = document.createElement("div");
      originalDiv.className = "metadata-item";
      originalDiv.innerHTML = `<strong>original:</strong> "${escapeHtml(node.original)}"`;
      metaContainer.appendChild(originalDiv);
    }
    if (node && typeof node === "object" && node.pos) {
      const posDiv = document.createElement("div");
      posDiv.className = "metadata-item";
      posDiv.innerHTML = `<strong>pos:</strong> [${node.pos.join(", ")}]`;
      metaContainer.appendChild(posDiv);
    }
    treeNode.appendChild(metaContainer);
    metaToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = metaContainer.style.display === "none";
      metaContainer.style.display = isHidden ? "block" : "none";
      metaToggle.textContent = isHidden ? "▲" : "▼";
    });
  }
  treeNode.appendChild(header);
  if (compactContent.children && compactContent.children.length > 0) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "node-children expanded";
    compactContent.children.forEach(({ key, value }) => {
      const childWrapper = document.createElement("div");
      childWrapper.className = "child-wrapper";
      const keyLabel = document.createElement("span");
      keyLabel.className = "key-label";
      keyLabel.textContent = `${key.toUpperCase()}:`;
      childWrapper.appendChild(keyLabel);
      const childNode = createTreeNode(value, key, false);
      childNode.style.display = "inline-block";
      childWrapper.appendChild(childNode);
      childrenContainer.appendChild(childWrapper);
    });
    treeNode.appendChild(childrenContainer);
  }
  return treeNode;
}
function createCompactNodeDisplay(node, nodeName) {
  const mainDiv = document.createElement("div");
  mainDiv.className = "compact-node";
  let children = [];
  let hasMetadata = false;
  if (!node || typeof node !== "object") {
    const typeSpan2 = document.createElement("span");
    typeSpan2.className = "node-type";
    typeSpan2.textContent = nodeName || typeof node;
    mainDiv.appendChild(typeSpan2);
    const colonSpan2 = document.createElement("span");
    colonSpan2.textContent = ": ";
    mainDiv.appendChild(colonSpan2);
    const valueSpan = document.createElement("span");
    valueSpan.className = "node-value";
    valueSpan.textContent = String(node);
    mainDiv.appendChild(valueSpan);
    return { main: mainDiv, children, hasMetadata };
  }
  if (Array.isArray(node)) {
    const typeSpan2 = document.createElement("span");
    typeSpan2.className = "node-type";
    typeSpan2.textContent = nodeName || "Array";
    mainDiv.appendChild(typeSpan2);
    const colonSpan2 = document.createElement("span");
    colonSpan2.textContent = ": ";
    mainDiv.appendChild(colonSpan2);
    const valueSpan = document.createElement("span");
    valueSpan.className = "node-value";
    valueSpan.textContent = `[${node.length} items]`;
    mainDiv.appendChild(valueSpan);
    children = node.map((item, index) => ({ key: `[${index}]`, value: item }));
    return { main: mainDiv, children, hasMetadata };
  }
  const nodeType = node.type || nodeName || "Node";
  const typeSpan = document.createElement("span");
  typeSpan.className = "node-type";
  typeSpan.textContent = nodeType;
  mainDiv.appendChild(typeSpan);
  const colonSpan = document.createElement("span");
  colonSpan.textContent = ": ";
  mainDiv.appendChild(colonSpan);
  const identifyingInfo = getNodeIdentifyingInfo(node);
  if (identifyingInfo.value) {
    const valueSpan = document.createElement("span");
    valueSpan.className = "node-value";
    valueSpan.textContent = identifyingInfo.value;
    mainDiv.appendChild(valueSpan);
    if (identifyingInfo.key) {
      const keySpan = document.createElement("span");
      keySpan.className = "node-key";
      keySpan.textContent = ` (${identifyingInfo.key})`;
      mainDiv.appendChild(keySpan);
    }
  }
  hasMetadata = !!(node.original || node.pos);
  const relevantProps = Object.keys(node).filter((key) => key !== "type" && key !== "original" && key !== "pos" && key !== identifyingInfo.key && node[key] !== null && node[key] !== undefined);
  children = relevantProps.map((key) => ({ key, value: node[key] }));
  return { main: mainDiv, children, hasMetadata };
}
function getNodeIdentifyingInfo(node) {
  switch (node.type) {
    case "Number":
      return { value: node.value, key: "value" };
    case "String":
      return { value: `"${node.value}"`, key: "value" };
    case "UserIdentifier":
    case "SystemIdentifier":
      return { value: node.name, key: "name" };
    case "BinaryOperation":
    case "UnaryOperation":
      return { value: node.operator, key: "operator" };
    case "PlaceHolder":
      return { value: `_${node.place}`, key: "place" };
    case "Array":
      return { value: node.elements ? `[${node.elements.length} items]` : "[]", key: null };
    case "Matrix":
      return { value: node.rows ? `${node.rows.length}×${node.rows[0]?.length || 0} matrix` : "matrix", key: null };
    case "FunctionCall":
      return { value: `${node.function?.name || "function"}()`, key: null };
    case "FunctionDefinition":
      return { value: `${node.name?.name || "function"} := ...`, key: null };
    case "Derivative":
      return { value: `${"'".repeat(node.order || 1)}`, key: "order" };
    case "Integral":
      return { value: `${"'".repeat(node.order || 1)}`, key: "order" };
    case "ScientificUnit":
      return { value: `~[${node.unit}]`, key: "unit" };
    case "MathematicalUnit":
      return { value: `~{${node.unit}}`, key: "unit" };
    case "TernaryOperation":
      return { value: "?? ?: ", key: null };
    case "GeneratorChain":
      return { value: `${node.operators?.length || 0} generators`, key: null };
    default:
      if (node.value !== undefined)
        return { value: String(node.value), key: "value" };
      if (node.name !== undefined)
        return { value: String(node.name), key: "name" };
      if (node.operator !== undefined)
        return { value: String(node.operator), key: "operator" };
      return { value: "", key: null };
  }
}
function displayRaw(ast) {
  rawOutput.textContent = JSON.stringify(ast, null, 2);
}
function displayDiagnostics(diagnostics) {
  if (!diagnostics || diagnostics.length === 0) {
    diagnosticsContent.innerHTML = '<p class="placeholder">No errors or warnings</p>';
    return;
  }
  diagnosticsContent.innerHTML = "";
  diagnostics.forEach((diagnostic) => {
    const item = document.createElement("div");
    item.className = `diagnostic-item ${diagnostic.severity}`;
    item.innerHTML = `
            <div>${escapeHtml(diagnostic.message)}</div>
            ${diagnostic.location ? `<div class="diagnostic-location">Line ${diagnostic.location.line}, Column ${diagnostic.location.column}</div>` : ""}
        `;
    diagnosticsContent.appendChild(item);
  });
}
function displayError(error) {
  astTree.innerHTML = `<div class="diagnostic-item error">${escapeHtml(error.message)}</div>`;
  tokensList.innerHTML = `<div class="diagnostic-item error">${escapeHtml(error.message)}</div>`;
  rawOutput.textContent = error.stack || error.message;
  displayDiagnostics([{
    severity: "error",
    message: error.message,
    location: error.location
  }]);
}
function showPlaceholder() {
  astTree.innerHTML = '<p class="placeholder">Parse an expression to see the AST</p>';
  tokensList.innerHTML = '<p class="placeholder">Parse an expression to see tokens</p>';
  rawOutput.textContent = "Parse an expression to see raw output";
  diagnosticsContent.innerHTML = '<p class="placeholder">No errors or warnings</p>';
}
examplesDropdown.addEventListener("change", (e) => {
  if (e.target.value) {
    inputExpression.value = e.target.value;
    e.target.selectedIndex = 0;
    parseExpression();
  }
});
copyButton.addEventListener("click", async () => {
  const text = inputExpression.value;
  if (text.trim()) {
    try {
      await navigator.clipboard.writeText(text);
      const originalText = copyButton.textContent;
      copyButton.textContent = "✓";
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 1000);
    } catch (err) {
      inputExpression.select();
      document.execCommand("copy");
      const originalText = copyButton.textContent;
      copyButton.textContent = "✓";
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 1000);
    }
  }
});
clearButton.addEventListener("click", () => {
  inputExpression.value = "";
  showPlaceholder();
  inputExpression.focus();
});
function closeModal() {
  nodeModal.classList.remove("show");
}
modalCloseButton.addEventListener("click", closeModal);
closeButton.addEventListener("click", closeModal);
nodeModal.addEventListener("click", (e) => {
  if (e.target === nodeModal) {
    closeModal();
  }
});
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
if (inputExpression.value.trim()) {
  parseExpression();
}
document.addEventListener("DOMContentLoaded", () => {
  tabButtons.forEach((btn) => btn.classList.remove("active"));
  tabPanels.forEach((panel) => panel.classList.remove("active"));
  const astButton = document.querySelector('[data-tab="ast"]');
  const astPanel = document.getElementById("ast-tab");
  if (astButton && astPanel) {
    astButton.classList.add("active");
    astPanel.classList.add("active");
  }
});
