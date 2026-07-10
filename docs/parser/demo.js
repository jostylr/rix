// src/tokenizer.js
var identifierStart = /[\p{L}]/u;
var identifierPart = /[\p{L}\p{N}]/u;
var symbols = [
  ":=:",
  ":>=:",
  ":<=:",
  ":>:",
  ":<:",
  ":=>",
  ":->",
  "||>",
  "|>>",
  "|>:",
  "|>?",
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
  "{{",
  "}}",
  "<=",
  ">=",
  "==",
  "!=",
  "->",
  "=>",
  "**",
  "?<=",
  "?>=",
  "?<",
  "?>",
  "?=",
  "??",
  "?:",
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
  "@",
  "'",
  ":",
  "?"
];
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
    token = tryMatchNumber(input, position);
    if (!token) {
      token = tryMatchString(input, position);
    }
    if (!token) {
      token = tryMatchIdentifier(input, position);
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
function tryMatchString(input, position) {
  const remaining = input.slice(position);
  const lineCommentMatch = remaining.match(/^#(.*)$/m);
  if (lineCommentMatch) {
    return {
      type: "String",
      original: lineCommentMatch[0],
      value: lineCommentMatch[1],
      kind: "comment",
      pos: [position, position + 1, position + lineCommentMatch[0].length]
    };
  }
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
    const remainder = input.slice(position);
    throw new Error(`Delimiter unmatched. Need ${starCount} stars followed by slash. Remainder: "${remainder}" at position ${position}`);
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
    const remainder = input.slice(position);
    throw new Error(`Delimiter unmatched. Need ${quoteCount} closing quotes. Remainder: "${remainder}" at position ${position}`);
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
    const remainder = input.slice(position);
    throw new Error(`Delimiter unmatched. Need ${backtickCount} closing backticks. Remainder: "${remainder}" at position ${position}`);
  }
  return null;
}
function tryMatchNumber(input, position) {
  const remaining = input.slice(position);
  if (!/^(-?\d|-?\.\d)/.test(remaining)) {
    return null;
  }
  let match = remaining.match(/^-?(?:\d+\.\.\d+\/\d+|\d+\.\d+#\d+|\.\d+#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+):-?(?:\d+\.\.\d+\/\d+|\d+\.\d+#\d+|\.\d+#\d+|\d+#\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d+(?:\.\d+)?(?:#\d+)?|\.\d+(?:#\d+)?|\d+\.\.\d+\/\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+)[Ee][+-]?\d+/);
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
  match = remaining.match(/^-?(?:\d+\.\d+#\d+|\.\d+#\d+)/);
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
  match = remaining.match(/^-?\d+\.\d+\[[^\]]+\]/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?(?:\d+(?:\.\d+)?|\.\d+):-?(?:\d+(?:\.\d+)?|\.\d+)/);
  if (match) {
    return {
      type: "Number",
      original: match[0],
      value: match[0],
      pos: [position, position, position + match[0].length]
    };
  }
  match = remaining.match(/^-?\d+\/\d+/);
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
    return null;
  }
  if (!identifierStart.test(remaining[0])) {
    return null;
  }
  let length = 1;
  while (length < remaining.length && identifierPart.test(remaining[length])) {
    length++;
  }
  const original = remaining.slice(0, length);
  const firstChar = original[0];
  const isCapital = firstChar.toUpperCase() === firstChar;
  const kind = isCapital ? "System" : "User";
  let value;
  if (isCapital) {
    value = firstChar + original.slice(1).toUpperCase();
  } else {
    value = firstChar + original.slice(1).toLowerCase();
  }
  return {
    type: "Identifier",
    original,
    value,
    kind,
    pos: [position, position, position + length]
  };
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
function tryMatchSymbol(input, position) {
  const remaining = input.slice(position);
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

// src/parser.js
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
  ADDITION: 80,
  MULTIPLICATION: 90,
  EXPONENTIATION: 100,
  UNARY: 110,
  CALCULUS: 115,
  POSTFIX: 120,
  PROPERTY: 130
};
var SYMBOL_TABLE = {
  ":=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  ":=:": {
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
  ":=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
  "|>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "||>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|+": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|*": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|;": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|^": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|^:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix"
  },
  "?=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
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
  "?<": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "?>": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "?<=": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix"
  },
  "?>=": {
    precedence: PRECEDENCE.COMPARISON,
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
  "-": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
    prefix: true
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
  "^": {
    precedence: PRECEDENCE.EXPONENTIATION,
    associativity: "right",
    type: "infix"
  },
  "**": {
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
  ":->": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix"
  },
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
  "]": { precedence: 0, type: "grouping" },
  "{": { precedence: 0, type: "grouping" },
  "}": { precedence: 0, type: "grouping" },
  "{{": { precedence: 0, type: "codeblock" },
  "}}": { precedence: 0, type: "codeblock" },
  ",": { precedence: 5, associativity: "left", type: "infix" },
  ";": {
    precedence: PRECEDENCE.STATEMENT,
    associativity: "left",
    type: "statement"
  }
};

class Parser {
  constructor(tokens, systemLookup) {
    this.tokens = tokens;
    this.systemLookup = systemLookup || (() => ({ type: "identifier" }));
    this.position = 0;
    this.current = null;
    this.advance();
  }
  advance() {
    if (this.position < this.tokens.length) {
      this.current = this.tokens[this.position];
      this.position++;
    } else {
      this.current = {
        type: "End",
        value: null,
        pos: [this.tokens.length, this.tokens.length, this.tokens.length]
      };
    }
    return this.current;
  }
  peek() {
    if (this.position < this.tokens.length) {
      return this.tokens[this.position];
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
    throw new Error(`Parse error at position ${pos[0]}: ${message}`);
  }
  getSymbolInfo(token) {
    if (token.type === "Symbol") {
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
    return { precedence: 0, type: "operand" };
  }
  parseExpression(minPrec = 0) {
    const left = this.parsePrefix();
    return this.parseExpressionRec(left, minPrec, false);
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
      case "Identifier":
        this.advance();
        if (token.kind === "System") {
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
      case "PlaceHolder":
        this.advance();
        return this.createNode("PlaceHolder", {
          place: token.place,
          original: token.original
        });
      case "Symbol":
        if (token.value === "(") {
          return this.parseGrouping();
        } else if (token.value === "[") {
          return this.parseArray();
        } else if (token.value === "{") {
          return this.parseBraceContainer();
        } else if (token.value === "{{") {
          return this.parseCodeBlock();
        } else if (token.value === "+" || token.value === "-") {
          if (this.peek().value === "(") {
            this.advance();
            return this.createNode("UserIdentifier", {
              name: token.value,
              original: token.original
            });
          } else {
            return this.parseUnaryOperator();
          }
        } else if (token.value === "'") {
          return this.parseIntegral();
        } else if (token.value === "_") {
          this.advance();
          return this.createNode("NULL", {
            original: token.original
          });
        } else {
          this.advance();
          return this.createNode("UserIdentifier", {
            name: token.value,
            original: token.original
          });
        }
        break;
      default:
        this.error(`Unexpected token: ${token.type}`);
    }
  }
  parseInfix(left, symbolInfo) {
    const operator = this.current;
    if (operator.value === "(" && (left.type === "UserIdentifier" || left.type === "SystemIdentifier")) {
      this.advance();
      const args = this.parseFunctionCallArgs();
      if (this.current.value !== ")") {
        this.error("Expected closing parenthesis in function call");
      }
      this.advance();
      return this.createNode("FunctionCall", {
        function: left,
        arguments: args,
        pos: left.pos,
        original: left.original + operator.original
      });
    }
    this.advance();
    let rightPrec = symbolInfo.precedence;
    if (symbolInfo.associativity === "left") {
      rightPrec += 1;
    }
    let right;
    if (operator.value === "[" && symbolInfo.type === "postfix") {
      right = this.parseExpression(0);
      if (this.current.value !== "]") {
        this.error("Expected closing bracket");
      }
      this.advance();
      return this.createNode("PropertyAccess", {
        object: left,
        property: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":->") {
      right = this.parseExpression(rightPrec);
      let funcName = left;
      let parameters = { positional: [], keyword: [], metadata: {} };
      if (left.type === "FunctionCall") {
        funcName = left.function;
        parameters = this.convertArgsToParams(left.arguments);
      }
      return this.createNode("FunctionDefinition", {
        name: funcName,
        parameters,
        body: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":=>") {
      right = this.parseExpression(rightPrec);
      let funcName = left;
      let parameters = {
        positional: [],
        keyword: [],
        conditionals: [],
        metadata: {}
      };
      let patterns = [];
      let globalMetadata = {};
      if (left.type === "FunctionCall") {
        funcName = left.function;
        parameters = this.convertArgsToParams(left.arguments);
      }
      let rawPatterns = [];
      if (right.type === "Array") {
        rawPatterns = right.elements;
      } else if (right.type === "WithMetadata" && right.primary && right.primary.type === "Array") {
        if (Array.isArray(right.primary.elements) && right.primary.elements.length > 0 && right.primary.elements[0].type === "Array") {
          rawPatterns = right.primary.elements[0].elements;
        } else {
          rawPatterns = right.primary.elements;
        }
        globalMetadata = right.metadata;
      } else {
        rawPatterns = [right];
      }
      for (const pattern of rawPatterns) {
        if (pattern.type === "FunctionLambda") {
          const patternFunc = {
            parameters: pattern.parameters,
            body: pattern.body
          };
          patterns.push(patternFunc);
        } else if (pattern.type === "BinaryOperation" && pattern.operator === "->") {
          const patternFunc = {
            parameters: {
              positional: [],
              keyword: [],
              conditionals: [],
              metadata: {}
            },
            body: pattern.right
          };
          if (pattern.left.type === "Grouping") {
            const paramExpr = pattern.left.expression;
            if (paramExpr.type === "BinaryOperation" && paramExpr.operator === "?") {
              const paramName = paramExpr.left.name || paramExpr.left.value;
              patternFunc.parameters.positional.push({
                name: paramName,
                defaultValue: null
              });
              patternFunc.parameters.conditionals.push(paramExpr.right);
            } else if (paramExpr.type === "UserIdentifier") {
              patternFunc.parameters.positional.push({
                name: paramExpr.name || paramExpr.value,
                defaultValue: null
              });
            }
          }
          patterns.push(patternFunc);
        }
      }
      return this.createNode("PatternMatchingFunction", {
        name: funcName,
        parameters,
        patterns,
        metadata: globalMetadata,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === "->") {
      right = this.parseExpression(rightPrec);
      if (left.type === "Grouping" && left.expression && left.expression.type === "ParameterList") {
        return this.createNode("FunctionLambda", {
          parameters: left.expression.parameters,
          body: right,
          pos: left.pos,
          original: left.original + operator.original
        });
      } else if (left.type === "Grouping" && left.expression) {
        let parameters = {
          positional: [],
          keyword: [],
          conditionals: [],
          metadata: {}
        };
        if (left.expression.type === "UserIdentifier") {
          parameters.positional.push({
            name: left.expression.name,
            defaultValue: null
          });
        } else if (left.expression.type === "BinaryOperation" && left.expression.operator === "?") {
          const paramName = left.expression.left.name || left.expression.left.value;
          parameters.positional.push({ name: paramName, defaultValue: null });
          parameters.conditionals.push(left.expression.right);
        }
        return this.createNode("FunctionLambda", {
          parameters,
          body: right,
          pos: left.pos,
          original: left.original + operator.original
        });
      } else if (left.type === "Tuple") {
        let parameters = {
          positional: [],
          keyword: [],
          conditionals: [],
          metadata: {}
        };
        for (const element of left.elements) {
          if (element.type === "UserIdentifier") {
            parameters.positional.push({
              name: element.name,
              defaultValue: null
            });
          }
        }
        return this.createNode("FunctionLambda", {
          parameters,
          body: right,
          pos: left.pos,
          original: left.original + operator.original
        });
      } else {
        return this.createNode("BinaryOperation", {
          operator: operator.value,
          left,
          right,
          pos: left.pos,
          original: left.original + operator.original
        });
      }
    } else if (operator.value === "|>") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Pipe", {
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
    } else if (operator.value === "|>:") {
      right = this.parseExpression(rightPrec);
      return this.createNode("Reduce", {
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
        type: "equally_spaced",
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
      return this.createNode("IntervalMediants", {
        interval: left,
        levels: right,
        pos: left.pos,
        original: left.original + operator.original
      });
    } else if (operator.value === ":~/") {
      right = this.parseExpression(rightPrec);
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
    } else {
      right = this.parseExpression(rightPrec);
      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left,
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
    let tempPos = this.position;
    let parenDepth = 0;
    while (tempPos < this.tokens.length) {
      const token = this.tokens[tempPos];
      if (token.value === "(")
        parenDepth++;
      else if (token.value === ")") {
        if (parenDepth === 0)
          break;
        parenDepth--;
      } else if (parenDepth === 0) {
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
    return this.parseExpression(0);
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
      if (this.current.value === ";" || this.current.value === "," || this.current.value === ")" || this.current.value === "]" || this.current.value === "}" || this.current.value === "}}" || this.current.type === "SemicolonSequence") {
        break;
      }
      if (this.current.type === "String" && this.current.kind === "comment") {
        break;
      }
      if (this.current.value === "(") {
        left = this.parseCall(left);
        continue;
      }
      if (this.current.value === "@" && this.peek().value === "(") {
        left = this.parseAt(left);
        continue;
      }
      if (this.current.value === "?" && this.peek().value === "(") {
        left = this.parseAsk(left);
        continue;
      }
      if (this.current.value === "'" && (left.type === "UserIdentifier" || left.type === "SystemIdentifier" || left.type === "FunctionCall" || left.type === "PropertyAccess" || left.type === "Derivative" || left.type === "Integral")) {
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
      const symbolInfo = this.getSymbolInfo(this.current);
      if (!symbolInfo || symbolInfo.precedence < minPrec) {
        break;
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
  isGeneratorOperator(value) {
    return ["|+", "|*", "|:", "|?", "|^", "|^:"].includes(value);
  }
  createGeneratorOperatorNode(operator, operand, token) {
    const typeMap = {
      "|+": "GeneratorAdd",
      "|*": "GeneratorMultiply",
      "|:": "GeneratorFunction",
      "|?": "GeneratorFilter",
      "|^": "GeneratorLimit",
      "|^:": "GeneratorLazyLimit"
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
        if (this.isGeneratorOperator(this.current.value)) {
          element = this.parseGeneratorChain();
        } else {
          element = this.parseExpression(0);
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
    const elements = [];
    let containerType = null;
    let hasAssignments = false;
    let hasPatternMatches = false;
    let hasEquations = false;
    let hasSemicolons = false;
    if (this.current.value !== "}") {
      do {
        const element = this.parseExpression(0);
        elements.push(element);
        if (element.type === "PatternMatchingFunction") {
          this.error("Pattern matching should use array syntax [ ] with sequential evaluation, not brace syntax { }. Use format: name :=> [ pattern1, pattern2, ... ]");
        } else if (element.type === "BinaryOperation") {
          if (element.operator === ":=") {
            hasAssignments = true;
          } else if (element.operator === ":=:" || element.operator === ":>:" || element.operator === ":<:" || element.operator === ":<=:" || element.operator === ":>=:") {
            hasEquations = true;
          }
        }
        if (this.current.value === ",") {
          this.advance();
        } else if (this.current.value === ";") {
          hasSemicolons = true;
          this.advance();
        } else {
          break;
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }
    if (this.current.value !== "}") {
      this.error("Expected closing brace");
    }
    this.advance();
    if (hasEquations) {
      if (!hasSemicolons) {
        this.error("System containers must contain only equations with equation operators separated by semicolons");
      }
      if (hasAssignments || hasPatternMatches) {
        this.error("Cannot mix equations with other assignment types");
      }
      containerType = "System";
    } else if (hasAssignments) {
      containerType = "Map";
    } else {
      containerType = "Set";
    }
    if (containerType === "Map") {
      for (const element of elements) {
        if (element.type !== "BinaryOperation" || element.operator !== ":=") {
          this.error("Map containers must contain only key-value pairs with :=");
        }
      }
    } else if (containerType === "System") {
      for (const element of elements) {
        if (element.type !== "BinaryOperation" || ![":=:", ":>:", ":<:", ":<=:", ":>=:"].includes(element.operator)) {
          this.error("System containers must contain only equations with equation operators");
        }
      }
    }
    return this.createNode(containerType, {
      elements,
      pos: startToken.pos,
      original: startToken.original
    });
  }
  parseCodeBlock() {
    const startToken = this.current;
    this.advance();
    const statements = [];
    if (this.current.value !== "}}") {
      do {
        const statement = this.parseExpression(0);
        statements.push(statement);
        if (this.current.value === ";") {
          this.advance();
          if (this.current.value === "}}") {
            break;
          }
        } else if (this.current.value === "}}") {
          break;
        } else if (this.current.type === "End") {
          this.error("Expected closing }}");
        } else {
          break;
        }
      } while (this.current.value !== "}}" && this.current.type !== "End");
    }
    if (this.current.value !== "}}") {
      this.error("Expected closing }}");
    }
    this.advance();
    return this.createNode("CodeBlock", {
      statements,
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
    if (this.current.value === ":=") {
      this.advance();
      param.defaultValue = this.parseExpression(PRECEDENCE.ASSIGNMENT + 1);
    }
    if (isKeywordOnly && param.defaultValue === null) {
      this.error("Keyword-only parameters must have default values");
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
        args.positional.push(this.parseExpression(0));
      }
      if (this.current.value === ",") {
        this.advance();
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
  parseEmbeddedLanguage(token) {
    const content = token.value;
    if (content.startsWith(":") || content.indexOf(":") === -1) {
      const body2 = content.startsWith(":") ? content.slice(1) : content;
      return this.createNode("EmbeddedLanguage", {
        language: "RiX-String",
        context: null,
        body: body2,
        original: token.original
      });
    }
    const parenStart = content.indexOf("(");
    let colonIndex = -1;
    let header = "";
    let body = "";
    if (parenStart !== -1) {
      let parenCount = 0;
      let parenEnd = -1;
      for (let i = parenStart;i < content.length; i++) {
        if (content[i] === "(") {
          parenCount++;
        } else if (content[i] === ")") {
          parenCount--;
          if (parenCount === 0) {
            parenEnd = i;
            break;
          }
        }
      }
      if (parenEnd !== -1) {
        const afterParens = content.slice(parenEnd + 1);
        const colonAfterParens = afterParens.indexOf(":");
        if (colonAfterParens !== -1) {
          colonIndex = parenEnd + 1 + colonAfterParens;
        }
      }
    }
    if (colonIndex === -1) {
      colonIndex = content.indexOf(":");
    }
    header = content.slice(0, colonIndex).trim();
    body = content.slice(colonIndex + 1);
    let language = header;
    let context = null;
    const headerParenStart = header.indexOf("(");
    const headerParenEnd = header.lastIndexOf(")");
    if (headerParenEnd !== -1 && headerParenStart === -1) {
      this.error("Unmatched closing parenthesis in embedded language header");
    }
    if (headerParenStart !== -1) {
      let parenCount = 0;
      let parenEnd = -1;
      for (let i = headerParenStart;i < header.length; i++) {
        if (header[i] === "(") {
          parenCount++;
        } else if (header[i] === ")") {
          parenCount--;
          if (parenCount === 0) {
            parenEnd = i;
            break;
          }
        }
      }
      if (parenEnd === -1) {
        this.error("Unmatched opening parenthesis in embedded language header");
      }
      if (parenEnd !== header.length - 1) {
        this.error("Invalid embedded language header format. Expected: LANGUAGE(CONTEXT):BODY");
      }
      const afterCloseParen = header.slice(parenEnd + 1);
      if (afterCloseParen.includes("(")) {
        this.error("Multiple parenthetical groups not allowed in embedded language header");
      }
      language = header.slice(0, headerParenStart).trim();
      context = header.slice(headerParenStart + 1, parenEnd).trim();
    }
    return this.createNode("EmbeddedLanguage", {
      language: language || null,
      context,
      body,
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
    if (arg.type === "BinaryOperation" && arg.operator === ":=") {
      result.param.name = arg.left.name || arg.left.value;
      if (arg.right.type === "BinaryOperation" && arg.right.operator === "?") {
        result.param.defaultValue = arg.right.left;
        result.condition = arg.right.right;
      } else {
        result.param.defaultValue = arg.right;
      }
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
  parse() {
    const statements = [];
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
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }
    return statements;
  }
  parseCall(target) {
    this.advance();
    const args = this.parseFunctionCallArgs();
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in function call");
    }
    this.advance();
    if (target.type === "UserIdentifier" || target.type === "SystemIdentifier") {
      return this.createNode("FunctionCall", {
        function: target,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)"
      });
    } else {
      return this.createNode("Call", {
        target,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)"
      });
    }
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
function parse(input, systemLookup) {
  let tokens;
  if (typeof input === "string") {
    tokens = tokenize(input);
  } else {
    tokens = input;
  }
  const parser = new Parser(tokens, systemLookup);
  return parser.parse();
}

// docs/src/demo.js
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
