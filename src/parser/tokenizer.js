/**
 * Math Oracle Language Tokenizer
 * Implements tokenization according to the specification in tokenizing-spec.txt
 */

// Unicode patterns for identifiers
const identifierStart = /[\p{L}_]/u;
const identifierPart = /[\p{L}\p{N}_]/u;

// Symbol patterns (sorted longest to shortest for maximal munch)
const symbols = [
  ":=:",
  ":>=:",
  ":<=:",
  ":>:",
  ":<:",
  ":=>",
  ":->",
  "\\/=",
  "/\\=",
  "\\/",
  "/\\",
  "?!-",
  "?-",
  "^=>",
  "?&",
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
  // System function prefix (must come before single @)
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
  // Triple-dot spread operator (must come before double-dot)
  "...",
  // Double-dot and dot-pipe operators (before single .)
  "..",
  "|.",
  ".|",
  // Bulk meta assign (before single . for maximal munch)
  ".=",
  // Mutation prefix
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
  "\\",
];

/**
 * Convert a character offset to {line, col} (both 1-indexed).
 */
function posToLineCol(input, pos) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < input.length; i++) {
    if (input[i] === "\n") {
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

    // Skip whitespace
    while (position < input.length && /\s/.test(input[position])) {
      position++;
    }

    if (position >= input.length) {
      // Add End token with any remaining whitespace
      tokens.push({
        type: "End",
        original: input.slice(startPos),
        value: null,
        pos: [startPos, startPos, input.length],
      });
      break;
    }

    let token = null;

    // Try comments FIRST (before numbers, to avoid # conflicts)
    token = tryMatchComment(input, position);
    if (!token) {
      // Try to match numbers first (before strings/identifiers)
      token = tryMatchNumber(input, position);
    }
    if (!token) {
      // Try to match explicit-start continued fractions (~INT.~...) before ~ is eaten as a symbol
      token = tryMatchExplicitCF(input, position);
    }
    if (!token) {
      // Try to match strings (quotes, backticks)
      token = tryMatchString(input, position);
    }
    if (!token) {
      // Try to match @_ system function refs (before identifiers and symbols)
      token = tryMatchSystemFunctionRef(input, position);
    }
    if (!token) {
      // Try to match @OuterIdentifier
      token = tryMatchOuterIdentifier(input, position);
    }
    if (!token) {
      // Try to match identifiers
      token = tryMatchIdentifier(input, position);
    }
    if (!token) {
      // Try to match regex literals first (so '{/' is not seen as '{' followed by '/')
      token = tryMatchRegexLiteral(input, position);
    }
    if (!token) {
      // Try to match brace forms (sigil containers, operator braces, plain blocks)
      // This enforces mandatory space after '{' and after sigil sequences.
      token = tryMatchBrace(input, position);
    }
    if (!token) {
      // Try to match semicolon sequences first (before general symbols)
      token = tryMatchSemicolonSequence(input, position);
    }
    if (!token) {
      // Try to match symbols
      token = tryMatchSymbol(input, position);
    }

    if (token) {
      // Include whitespace from startPos in the original
      const whitespace = input.slice(startPos, position);
      token.original = whitespace + token.original;
      // Update pos to account for whitespace - keep value position as set by token creators
      token.pos[0] = startPos;
      // Don't override pos[1] for strings or comments, as they set it correctly
      if (token.type !== "String") {
        token.pos[1] = position;
      }
      tokens.push(token);
      position += token.original.length - whitespace.length;
    } else {
      // If nothing matched, skip this character
      position++;
    }
  }

  // Always add End token if not already added
  if (tokens.length === 0 || tokens[tokens.length - 1].type !== "End") {
    tokens.push({
      type: "End",
      original: "",
      value: null,
      pos: [input.length, input.length, input.length],
    });
  }

  return tokens;
}

function tryMatchComment(input, position) {
  const remaining = input.slice(position);

  if (!remaining.startsWith("##")) return null;

  // Potential multi-line comment: ##tag##
  // Find the next ##
  let tagEndIndex = -1;
  let hasSpaceInTag = false;
  for (let i = 2; i < remaining.length - 1; i++) {
    if (remaining[i] === "#" && remaining[i + 1] === "#") {
      tagEndIndex = i;
      break;
    }
    if (/\s/.test(remaining[i])) {
      hasSpaceInTag = true;
      // We don't break yet, we might find a ## later and decide it's a line comment
      // but the user requirement says "no spaces in the tag allowed up to ##"
      // So if we find whitespace, it CANNOT be a tag.
      break;
    }
  }

  if (tagEndIndex !== -1 && !hasSpaceInTag) {
    // Found a tag!
    const tag = remaining.slice(2, tagEndIndex);
    const normalizedTag = tag.toLowerCase();
    const openDelimiter = `##${tag}##`;
    const closeDelimiter = `##${normalizedTag}##`; // Not strictly how to search, we need to match it case-insensitively

    // Search for the closing delimiter
    let searchPos = tagEndIndex + 2;
    while (searchPos < remaining.length - (normalizedTag.length + 4) + 1) {
      // Look for the next ##
      const potentialCloseStart = remaining.indexOf("##", searchPos);
      if (potentialCloseStart === -1) break;

      const potentialCloseTagEnd = remaining.indexOf(
        "##",
        potentialCloseStart + 2,
      );
      if (potentialCloseTagEnd === -1) break;

      const foundTag = remaining
        .slice(potentialCloseStart + 2, potentialCloseTagEnd)
        .toLowerCase();
      if (foundTag === normalizedTag) {
        // Found it!
        const totalLength = potentialCloseTagEnd + 2;
        const value = remaining.slice(tagEndIndex + 2, potentialCloseStart);
        return {
          type: "String",
          original: remaining.slice(0, totalLength),
          value: value,
          kind: "comment",
          pos: [position, position + tagEndIndex + 2, position + totalLength],
        };
      }
      searchPos = potentialCloseStart + 1;
    }

    // If we get here, it was meant to be a multi-line comment but was never closed
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Unclosed multi-line comment with tag "${tag}" at line ${line}:${col}`,
    );
  }

  // If it's not a multi-line tag, it's a line comment
  let lineEndIndex = remaining.indexOf("\n");
  if (lineEndIndex === -1) lineEndIndex = remaining.length;

  return {
    type: "String",
    original: remaining.slice(0, lineEndIndex),
    value: remaining.slice(2, lineEndIndex),
    kind: "comment",
    pos: [position, position + 2, position + lineEndIndex],
  };
}

function tryMatchString(input, position) {
  const remaining = input.slice(position);

  // Block comments (/* ... */)
  const blockCommentMatch = remaining.match(/^\/(\*+)/);
  if (blockCommentMatch) {
    const starCount = blockCommentMatch[1].length;
    const fullPattern = new RegExp(
      `^\\/\\*{${starCount}}([\\s\\S]*?)\\*{${starCount}}\\/`,
    );
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
          position + match[0].length,
        ],
      };
    }
    // If we reach here, block comment was not closed - throw error
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Delimiter unmatched at line ${line}:${col}. Need ${starCount} stars followed by slash.`,
    );
  }

  // Try double quotes - only throw error if we found opening quotes but no closing
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
          original: original,
          value: content,
          kind: "quote",
          pos: [position, position + quoteCount, searchPos + quoteCount],
        };
      }
      searchPos++;
    }
    // Unmatched quote delimiter - throw error only if we started parsing quotes
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Delimiter unmatched at line ${line}:${col}. Need ${quoteCount} closing quotes.`,
    );
  }

  // Try backticks - only throw error if we found opening backticks but no closing
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
          original: original,
          value: content,
          kind: "backtick",
          pos: [position, position + backtickCount, searchPos + backtickCount],
        };
      }
      searchPos++;
    }
    // Unmatched backtick delimiter - throw error only if we started parsing backticks
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Delimiter unmatched at line ${line}:${col}. Need ${backtickCount} closing backticks.`,
    );
  }

  return null;
}

function tryMatchExplicitCF(input, position) {
  const remaining = input.slice(position);
  // Explicit-start CF with prefixed base integer part: ~0b101.~11~10, ~-0B4.~3
  let match = remaining.match(/^~-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]+\.\~[0-9a-zA-Z]+(?:~[0-9a-zA-Z]+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Explicit-start CF: ~SIGNED_INT.~term~term~... (e.g. ~1.~2, ~-1.~2)
  match = remaining.match(/^~-?\d+\.~\d+(?:~\d+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }
  return null;
}

function tryMatchNumber(input, position) {
  const remaining = input.slice(position);
  let match;
  // console.log("tryMatchNumber", remaining);

  // Check if it starts with a digit, minus followed by digit, or decimal point followed by digit
  // OR if it starts with a prefix pattern (0 followed by letter)
  if (!/^(-?\d|-?\.\d)/.test(remaining)) {
    return null;
  }

  // Error: -INT.~ is an ambiguous continued fraction literal.
  // Use ~-INT.~ for a negative first coefficient, or -~INT.~ to negate the value.
  if (/^-\d+\.~\d/.test(remaining)) {
    const { line, col } = posToLineCol(input, position);
    const cfStr = remaining.match(/^-\d+\.~[\d~]*/)[0];
    const posStr = cfStr.slice(1); // strip leading -
    throw new Error(
      `Ambiguous continued fraction at ${line}:${col}: write ~${cfStr} for a negative first coefficient, or -~${posStr} to negate the continued fraction value.`
    );
  }

  // Try all number patterns (longest first for maximal munch)

  // Prefix Patterns (0x..., 0b..., 0k..., etc.)
  // Must check these before standard decimal patterns to avoid catching '0' as Integer(0) and 'x' as Identifier

  // Prefix continued fraction: 0b101.~11~10
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]+\.~[0-9a-zA-Z]+(?:~[0-9a-zA-Z]+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Uppercase-prefix quoted literal: 0A"..."
  match = remaining.match(/^-?0[A-Z]"(?:[^"\\]|\\.)*"/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Uppercase-prefix safe unquoted literal stream: 0A4A.F, 0A1..3/4, etc.
  // This also matches bare prefix token 0A for assignment LHS.
  match = remaining.match(/^-?0[A-Z][0-9A-Za-z@&./#~_^+-]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Prefix Interval: 0x1:0xA or 0x1:10
  match = remaining.match(
    /^-?(?:(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*(?:\.[0-9a-zA-Z]*)?|(?:\d+\.\.\d+\/\d+|\d+\.\d+#\d+|\.\d+#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+)):-?(?:(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*(?:\.[0-9a-zA-Z]*)?|(?:\d+\.\.\d+\/\d+|\d+\.\d+#\d+|\.\d+#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+))/,
  );
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Prefix Mixed Number: 0xA..B/C or 0xA..0xB/0xC
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*\.\.(?:0z\[\d+\]|0[a-zA-Z])?[0-9a-zA-Z]*\/(?:0z\[\d+\]|0[a-zA-Z])?[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Prefix Rational: 0xA/0xB or 0xA/B or A/0xB
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*\/(?:0z\[\d+\]|0[a-zA-Z])?[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Prefix Decimal: 0xA.B
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*\.[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Prefix Integer: 0xA, 0b101, 0z[10]10
  match = remaining.match(/^-?(?:0z\[\d+\]|0[a-zA-Z])[0-9a-zA-Z]*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Complex intervals with all number types (including leading decimal)
  match = remaining.match(
    /^-?(?:\d+\.\.\d+\/\d+|\d+\.\d*#\d+|\.\d*#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+):-?(?:\d+\.\.\d+\/\d+|\d+\.\d*#\d+|\.\d*#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+)/,
  );
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Implicit-start continued fractions: INT.~term~term~... (no sign, no ~ prefix)
  match = remaining.match(/^\d+\.~\d+(?:~\d+)*/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Radix shift notation: number_^exponent (e.g. 1_^2 = 100)
  // Note: E notation is NOT supported here
  match = remaining.match(
    /^-?(?:\d(?:_?\d)*\.\d(?:_?\d)*#\d(?:_?\d)*|\.\d(?:_?\d)*#\d(?:_?\d)*|\d(?:_?\d)*\.\.\d(?:_?\d)*\/\d(?:_?\d)*|\d(?:_?\d)*\/\d(?:_?\d)*|\d(?:_?\d)*\.\d(?:_?\d)*|\.\d(?:_?\d)*|\d(?:_?\d)*)_\^[+-]?\d(?:_?\d)*/,
  );
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Mixed numbers
  match = remaining.match(/^-?\d+\.\.\d+\/\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Repeating decimals (form: digits.digits#digits, digits.#digits, .digits#digits, .#digits)
  match = remaining.match(/^-?(?:\d+\.\d*#\d+|\.\d*#\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Repeating decimals (form: digits#digits)
  match = remaining.match(/^-?\d+#\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Decimals with interval notation
  match = remaining.match(/^-?\d+\.\d+\[[^\]]+\]/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Simple intervals (including leading decimal)
  match = remaining.match(
    /^-?(?:\d+(?:\.\d+)?|\.\d+):-?(?:\d+(?:\.\d+)?|\.\d+)/,
  );
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Rationals (no spaces allowed)
  match = remaining.match(/^-?\d+\/\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Decimals (including leading decimal)
  match = remaining.match(/^-?(?:\d+\.\d+|\.\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  // Integers
  match = remaining.match(/^-?\d+/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length],
    };
  }

  return null;
}

function tryMatchSystemFunctionRef(input, position) {
  const remaining = input.slice(position);

  // Match @_ followed by an identifier: @_ASSIGN, @_ADD, etc.
  if (remaining.startsWith("@_") && remaining.length > 2 && identifierStart.test(remaining[2])) {
    let length = 3; // @_ + first char
    while (length < remaining.length && identifierPart.test(remaining[length])) {
      length++;
    }
    const original = remaining.slice(0, length);
    const name = remaining.slice(2, length); // Strip @_ prefix for value
    // System function refs are always uppercase-normalized
    const value = name[0].toUpperCase() + name.slice(1).toUpperCase();
    return {
      type: "Identifier",
      original: original,
      value: value,
      kind: "SystemFunction",
      pos: [position, position, position + length],
    };
  }

  return null;
}

function tryMatchIdentifier(input, position) {
  const remaining = input.slice(position);

  // Check for placeholder pattern (_1, _2, __1, etc.)
  if (remaining[0] === "_") {
    const placeholderMatch = remaining.match(/^_+(\d+)/);
    if (placeholderMatch) {
      const original = placeholderMatch[0];
      const place = parseInt(placeholderMatch[1], 10);
      return {
        type: "PlaceHolder",
        original: original,
        place: place,
        pos: [position, position, position + original.length],
      };
    }
  }

  // Check if first character is a valid identifier start
  if (!identifierStart.test(remaining[0])) {
    return null;
  }

  let length = 1;
  while (length < remaining.length && identifierPart.test(remaining[length])) {
    length++;
  }

  const original = remaining.slice(0, length);

  if (original === "_") {
    return null; // standalone underscore is a symbol/null, not an identifier
  }

  let firstLetter = null;
  for (let i = 0; i < original.length; i++) {
    if (/[\p{L}]/u.test(original[i])) {
      firstLetter = original[i];
      break;
    }
  }

  const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
  const kind = isCapital ? "System" : "User";

  // Normalize case: convert rest to match first character's case
  const value = isCapital ? original.toUpperCase() : original.toLowerCase();

  return {
    type: "Identifier",
    original: original,
    value: value,
    kind: kind,
    pos: [position, position, position + length],
  };
}

function normalizeIdentifierValue(original) {
  let firstLetter = null;
  for (let i = 0; i < original.length; i++) {
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

  // Match consecutive semicolons (not separated by spaces)
  const match = remaining.match(/^;+/);
  if (match) {
    const sequence = match[0];
    const count = sequence.length;

    // Only create SemicolonSequence tokens for multiple consecutive semicolons
    if (count > 1) {
      return {
        type: "SemicolonSequence",
        original: sequence,
        value: sequence,
        count: count,
        pos: [position, position, position + sequence.length],
      };
    }
    // For single semicolons, let the regular symbol tokenizer handle it
  }

  return null;
}

function tryMatchBrace(input, position) {
  if (input[position] !== "{") return null;

  const isWhitespace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === undefined;
  const ch = input[position + 1]; // char immediately after {

  const makeAdvancedConstructorToken = (value, start, end, extras = {}) => ({
    type: "Symbol",
    original: input.slice(position, end),
    value,
    pos: [position, position, end],
    ...extras,
  });

  if (input.slice(position + 1).startsWith("=..")) {
    const after = input[position + 4];
    if (!isWhitespace(after) && after !== "}") {
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Brace array alias '{=..' must be followed by a space or '}' at line ${line}:${col}`);
    }
    return makeAdvancedConstructorToken("{..", position, position + 4, {
      destructureAlias: true,
    });
  }

  if (input.slice(position + 1).startsWith("=:")) {
    let cursor = position + 3; // after "{=:"
    let name = "";
    while (cursor < input.length && /[0-9x]/i.test(input[cursor])) {
      name += input[cursor];
      cursor++;
    }
    if (name.length > 0 && input[cursor] === ":") {
      const after = input[cursor + 1];
      if (!isWhitespace(after) && after !== "/" && after !== "}") {
        const { line, col } = posToLineCol(input, position);
        throw new Error(`Brace tensor alias '{=:${name}:' must be followed by a space, header, or '}' at line ${line}:${col}`);
      }
      return makeAdvancedConstructorToken("{:", position, cursor + 1, {
        containerName: name.toLowerCase(),
        destructureAlias: true,
      });
    }
  }

  if (input.slice(position + 1).startsWith("..")) {
    const after = input[position + 3];
    if (!isWhitespace(after) && after !== "}") {
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Brace array '{..' must be followed by a space or '}' at line ${line}:${col}`);
    }
    return makeAdvancedConstructorToken("{..", position, position + 3);
  }

  // 1. Operator brace detection (longest sequences first)
  const operatorSequences = ["&&", "||", "\\/", "/\\", "++", "<<", ">>", "+", "*"];
  for (const seq of operatorSequences) {
    if (input.slice(position + 1).startsWith(seq)) {
      const after = input[position + 1 + seq.length];
      if (!isWhitespace(after)) {
        const { line, col } = posToLineCol(input, position);
        throw new Error(
          `Operator brace '{${seq}' must be followed by a space at line ${line}:${col}`
        );
      }
      return {
        type: "Symbol",
        original: "{" + seq,
        value: "{" + seq,
        pos: [position, position, position + 1 + seq.length],
      };
    }
  }

  // 2. Sigil container detection
  const sigilChars = new Set(["@", ";", "|", ":", "=", "?", "$", "#", "^"]);
  if (sigilChars.has(ch)) {
    const sigil = ch;
    const after = input[position + 2];

    if (sigil === "#") {
      const specHeader = tryMatchSystemSpecHeader(input, position);
      if (specHeader) {
        return specHeader;
      }
    }

    // 2a. Space immediately → anonymous container
    if (isWhitespace(after) || after === "/") {
      return {
        type: "Symbol",
        original: "{" + sigil,
        value: "{" + sigil,
        containerName: null,
        pos: [position, position, position + 2],
      };
    }

    if (sigil === "@") {
      const loopHeader = tryMatchLoopHeader(input, position);
      if (loopHeader) {
        return loopHeader;
      }
    }

    // 2b. Name-between-sigils → named container: {sigil name sigil}
    if (after !== undefined && /[a-zA-Z0-9_]/.test(after)) {
      let nameLen = 0;
      while (
        position + 2 + nameLen < input.length &&
        /[a-zA-Z0-9_]/.test(input[position + 2 + nameLen])
      ) {
        nameLen++;
      }
      const name = input.slice(position + 2, position + 2 + nameLen);
      const closingSigilPos = position + 2 + nameLen;
      if (input[closingSigilPos] === sigil) {
        const afterName = input[closingSigilPos + 1];
        if (!isWhitespace(afterName) && afterName !== "}") {
          const { line, col } = posToLineCol(input, position);
          throw new Error(
            `Named container '{${sigil}${name}${sigil}' must be followed by a space or '}' at line ${line}:${col}`
          );
        }
        const tokenLen = 1 + 1 + nameLen + 1; // { sigil name closingSigil
        return {
          type: "Symbol",
          original: "{" + sigil + name + sigil,
          value: "{" + sigil,
          containerName: name.toLowerCase(),
          pos: [position, position, position + tokenLen],
        };
      }
      // Name not followed by closing sigil → error
      const { line, col } = posToLineCol(input, position);
      throw new Error(
        `Brace sigil '{${sigil}' must be followed by a space or 'name${sigil}' (e.g. '{${sigil}myname${sigil} ...') at line ${line}:${col}`
      );
    }

    // 2c. Not whitespace, not alphanumeric → error
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Brace sigil '{${sigil}' must be followed by a space or a name (e.g. '{${sigil} ...' or '{${sigil}myname${sigil} ...') at line ${line}:${col}`
    );
  }

  // 3. Plain brace: must be followed by space
  if (isWhitespace(ch)) {
    return {
      type: "Symbol",
      original: "{",
      value: "{",
      pos: [position, position, position + 1],
    };
  }

  // 4. { followed by something that should pass through to the symbols list:
  //    - {! mutation-in-place sigil
  //    - {} empty block (ch === "}")
  //    - {digit — allows {2} inside scientific unit notation ~[m{2}]
  if (ch === "!" || ch === "}" || ch === undefined || (ch >= "0" && ch <= "9")) {
    return null;
  }

  // 5. All other cases: error (missing space after {)
  const { line, col } = posToLineCol(input, position);
  throw new Error(
    `'{' must be followed by a space, a sigil (@;|:=?$#^), or an operator (+, *, &&, ||, \\/, /\\, ++, <<, >>) at line ${line}:${col}`
  );
}

function tryMatchSystemSpecHeader(input, position) {
  const start = position + 2; // after "{#"
  const first = input[start];

  if (first === "}" || first === undefined || first === " " || first === "\t" || first === "\n" || first === "\r") {
    return {
      type: "Symbol",
      original: "{#",
      value: "{#",
      specHeaderPresent: false,
      specInputs: [],
      specOutputs: [],
      specOutputsDeclared: false,
      pos: [position, position, position + 2],
    };
  }

  const closing = input.indexOf("#", start);
  if (closing === -1) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`System spec header must end with '#' at line ${line}:${col}`);
  }

  const after = input[closing + 1];
  if (!(after === "}" || after === undefined || after === " " || after === "\t" || after === "\n" || after === "\r")) {
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
    if (!trimmed) return [];
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
    pos: [position, position, closing + 1],
  };
}

function tryMatchLoopHeader(input, position) {
  const start = position + 2; // after "{@"
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
        unlimited: false,
      });
    }
    if (input[cursor] !== ":") {
      const { line, col } = posToLineCol(input, position);
      throw new Error(
        `Brace sigil '{@' must be followed by a space or a valid loop header ('{@name@', '{@:max@', '{@name:max@', '{@::@', '{@name::@') at line ${line}:${col}`
      );
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
      throw new Error(
        `Unlimited loop header must end with '{@::@' or '{@name::@' at line ${line}:${col}`
      );
    }
    return finalizeLoopHeader(input, position, cursor + 1, {
      containerName,
      loopMax: undefined,
      unlimited,
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
    unlimited: false,
  });
}

function finalizeLoopHeader(input, position, end, options) {
  const after = input[end];
  if (!(after === "}" || after === undefined || after === " " || after === "\t" || after === "\n" || after === "\r")) {
    const { line, col } = posToLineCol(input, position);
    throw new Error(
      `Loop header must be followed by a space or '}' at line ${line}:${col}`
    );
  }

  return {
    type: "Symbol",
    original: input.slice(position, end),
    value: "{@",
    containerName: options.containerName ?? null,
    ...(options.loopMax !== undefined ? { loopMax: options.loopMax } : {}),
    ...(options.unlimited ? { loopUnlimited: true } : {}),
    pos: [position, position, end],
  };
}

function tryMatchSymbol(input, position) {
  const remaining = input.slice(position);
  if (/^\/(?:==|:=|~=|::=|~~=)\s*\/(?=[\s}])/.test(remaining)) {
    return {
      type: "Symbol",
      original: "/",
      value: "/",
      pos: [position, position, position + 1],
    };
  }

  // Try to match symbols using maximal munch (longest first)
  for (const symbol of symbols) {
    if (remaining.startsWith(symbol)) {
      return {
        type: "Symbol",
        original: symbol,
        value: symbol,
        pos: [position, position, position + symbol.length],
      };
    }
  }

  // If no multi-character symbol matches, try single characters
  if (remaining.length > 0) {
    const char = remaining[0];
    // Check if it's a symbol character (not letter, digit, or whitespace)
    if (!/[\w\s\p{L}\p{N}]/u.test(char)) {
      return {
        type: "Symbol",
        original: char,
        value: char,
        pos: [position, position, position + 1],
      };
    }
  }

  return null;
}

function tryMatchOuterIdentifier(input, position) {
  const remaining = input.slice(position);

  // Match @ followed by an identifier
  // But reject @_ prefix, which is for SystemFunction identifiers
  if (remaining.startsWith("@_")) return null;

  if (remaining.startsWith("@") && remaining.length > 1 && identifierStart.test(remaining[1])) {
    let length = 2; // @ + first char
    while (length < remaining.length && identifierPart.test(remaining[length])) {
      length++;
    }
    const original = remaining.slice(0, length);
    const name = remaining.slice(1, length); // Strip @ prefix

    let firstLetter = null;
    for (let i = 0; i < name.length; i++) {
      if (/[\p{L}]/u.test(name[i])) {
        firstLetter = name[i];
        break;
      }
    }

    const isCapital = firstLetter !== null && firstLetter.toUpperCase() === firstLetter;
    const kind = isCapital ? "System" : "User";

    // Normalize case: convert rest to match first character's case
    const value = isCapital ? name.toUpperCase() : name.toLowerCase();

    return {
      type: "OuterIdentifier",
      original: original,
      value: value, // The normalized name without the @
      kind: kind,
      pos: [position, position, position + length],
    };
  }

  return null;
}

function tryMatchRegexLiteral(input, position) {
  const remaining = input.slice(position);
  // Disambiguate operator-brace sigil `{/\\ ...}` from regex literals like `{/\\s+/}`.
  if (remaining.startsWith("{/\\")) {
    let i = 3;
    let inEscape = false;
    let foundUnescapedSlash = false;
    while (i < remaining.length && remaining[i] !== "}") {
      const ch = remaining[i];
      if (inEscape) {
        inEscape = false;
      } else if (ch === "\\") {
        inEscape = true;
      } else if (ch === "/") {
        foundUnescapedSlash = true;
        break;
      }
      i++;
    }
    // No regex closing delimiter before the brace → treat as operator-brace token.
    if (!foundUnescapedSlash) return null;
  }
  // Match '{' followed by optional whitespace followed by '/'
  const startMatch = remaining.match(/^\{\s*\//);
  if (!startMatch) return null;

  // We are now inside a regex literal.
  const contentStart = startMatch[0].length;
  let searchPos = contentStart;
  let inEscape = false;
  let patternEnd = -1;

  while (searchPos < remaining.length) {
    const char = remaining[searchPos];
    if (inEscape) {
      inEscape = false;
    } else if (char === '\\') {
      inEscape = true;
    } else if (char === '/') {
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

  // Now parse flags and optional mode until '}'
  searchPos = patternEnd + 1;
  let flagsStart = searchPos;

  while (searchPos < remaining.length) {
    const char = remaining[searchPos];
    if (char === '}') {
      break;
    }
    searchPos++;
  }

  if (searchPos >= remaining.length || remaining[searchPos] !== '}') {
    const { line, col } = posToLineCol(input, position);
    throw new Error(`Unterminated regex literal at line ${line}:${col}. Expected closing '}'.`);
  }

  const flagsAndModeStr = remaining.slice(flagsStart, searchPos).trim();
  let flags = "";
  let mode = "ONE"; // Default

  if (flagsAndModeStr.length > 0) {
    const lastChar = flagsAndModeStr[flagsAndModeStr.length - 1];
    let flagsStr = flagsAndModeStr;
    if (lastChar === '?') {
      mode = "TEST";
      flagsStr = flagsAndModeStr.slice(0, -1);
    } else if (lastChar === '*') {
      mode = "ALL";
      flagsStr = flagsAndModeStr.slice(0, -1);
    } else if (lastChar === ':') {
      mode = "ITER";
      flagsStr = flagsAndModeStr.slice(0, -1);
    }

    flags = flagsStr.trim();
    if (flags.length > 0 && !/^[a-zA-Z]*$/.test(flags)) {
      // For `{/\\ ...}` ambiguity, prefer operator-brace parsing.
      if (remaining.startsWith("{/\\")) return null;
      const { line, col } = posToLineCol(input, position);
      throw new Error(`Invalid modifier or flag in regex literal at line ${line}:${col}.`);
    }
  }

  const endPosition = searchPos + 1; // Include '}'
  const original = remaining.slice(0, endPosition);

  return {
    type: "RegexLiteral",
    original: original,
    pattern: pattern,
    flags: flags,
    mode: mode,
    pos: [position, position, position + original.length],
  };
}

export { tokenize, posToLineCol };
