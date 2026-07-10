/**
 * RiX Language Pratt Parser
 * Implements a Pratt parser for the RiX mathematical expression language
 */

import { tokenize, posToLineCol } from "./tokenizer.js";

// Precedence levels (higher numbers bind tighter)
const PRECEDENCE = {
  STATEMENT: 0,
  ASSIGNMENT: 10, // :=, :=:, :>:, etc.
  PIPE: 20, // |>, ||>, |>>, etc.
  ARROW: 25, // ->, =>, :-> for function definitions
  LOGICAL_OR: 30, // OR (if system identifier)
  LOGICAL_AND: 40, // AND (if system identifier)
  CONDITION: 45, // ? operator for conditions
  EQUALITY: 50, // ==, ===, !=
  COMPARISON: 60, // <, >, <=, >=
  INTERVAL: 70, // :
  CONVERSION: 75, // _>, <_
  ADDITION: 80, // +, -
  MULTIPLICATION: 90, // *, /, //, %, /^, /~, /%
  EXPONENTIATION: 100, // ^, **
  UNARY: 110, // unary -, +, NOT
  CALCULUS: 115, // derivatives ('), integrals (')
  POSTFIX: 120, // function calls, array access
  PROPERTY: 130, // .
};

const JUXTAPOSITION_PRECEDENCE = 95; // Between multiplication (90) and exponentiation (100)
const IMPLICIT_APPLICATION_PRECEDENCE = 97; // Implicit callable application, tighter than implicit mul

// Symbol table for operators and their parsing behavior
const SYMBOL_TABLE = {
  // Assignment operators (right associative)
  ":=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":=:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":<:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":>:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":<=:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":>=:": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },

  // Pipe operators (left associative)
  "|>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "||>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|:>": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>&&": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|>||": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
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
  "|^:": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },
  "|?": { precedence: PRECEDENCE.PIPE, associativity: "left", type: "infix" },

  // Assignment operators
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
    type: "infix",
  },
  "!=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix",
  },
  "==": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix",
  },
  "===": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "left",
    type: "infix",
  },
  "?=": {
    precedence: PRECEDENCE.EQUALITY,
    associativity: "right",
    type: "infix",
  },

  // Comparison operators
  "<": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },
  ">": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },
  "<=": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },
  ">=": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },
  "?&": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },
  "!?": {
    precedence: PRECEDENCE.COMPARISON,
    associativity: "left",
    type: "infix",
  },

  // Logical aliases
  "&&": {
    precedence: PRECEDENCE.LOGICAL_AND,
    associativity: "left",
    type: "infix",
  },
  "||": {
    precedence: PRECEDENCE.LOGICAL_OR,
    associativity: "left",
    type: "infix",
  },
  "?|": {
    precedence: PRECEDENCE.LOGICAL_OR,
    associativity: "left",
    type: "infix",
  },

  // Interval operators / ternary colon
  ":": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Interval stepping
  ":+": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Interval division
  "::": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },
  ":/:": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Interval mediants
  ":~": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },
  ":~/": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Random interval operations
  ":%": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },
  ":/%": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Infinite ranges
  "::+": {
    precedence: PRECEDENCE.INTERVAL,
    associativity: "left",
    type: "infix",
  },

  // Addition/subtraction
  "+": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
    prefix: true,
  },
  "@@": {
    precedence: PRECEDENCE.UNARY,
    associativity: "right",
    type: "prefix",
  },
  "-": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
    prefix: true,
  },
  "\\": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
  },
  "\\/": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
  },
  "++": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
  },
  "<>": {
    precedence: PRECEDENCE.ADDITION,
    associativity: "left",
    type: "infix",
  },

  // Base conversion operators
  "_>": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix",
  },
  "<_": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix",
  },
  "~:": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix",
  },
  "~!:": {
    precedence: PRECEDENCE.CONVERSION,
    associativity: "left",
    type: "infix",
  },

  // Multiplication/division
  "*": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "/": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "//": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "%": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "/\\": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "**": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "/^": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "/~": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },
  "/%": {
    precedence: PRECEDENCE.MULTIPLICATION,
    associativity: "left",
    type: "infix",
  },

  // Exponentiation (right associative)
  "^": {
    precedence: PRECEDENCE.EXPONENTIATION,
    associativity: "right",
    type: "infix",
  },

  // Function arrow (right associative)
  "->": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },
  "=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  "^=>": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  ":->": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },
  "?-": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },
  "?!-": { precedence: PRECEDENCE.ARROW, associativity: "right", type: "infix" },

  // Membership operator (also used for function parameter conditions)
  "?": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "left",
    type: "infix",
  },

  // Ternary operator
  "??": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "right",
    type: "infix",
  },
  "?:": {
    precedence: PRECEDENCE.CONDITION,
    associativity: "right",
    type: "infix",
  },

  // Property access
  ".": {
    precedence: PRECEDENCE.PROPERTY,
    associativity: "left",
    type: "infix",
  },

  // Bulk meta merge (right associative, assignment level)
  ".=": {
    precedence: PRECEDENCE.ASSIGNMENT,
    associativity: "right",
    type: "infix",
  },

  // Postfix metadata operators (highest precedence)
  "@": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix",
  },

  // Unit operators (postfix)
  "~[": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix",
  },
  "~{": {
    precedence: PRECEDENCE.POSTFIX,
    associativity: "left",
    type: "postfix",
  },

  // Calculus operators
  "'": {
    precedence: PRECEDENCE.CALCULUS,
    associativity: "left",
    type: "calculus",
  },

  // Grouping
  "(": { precedence: 0, type: "grouping" },
  ")": { precedence: 0, type: "grouping" },
  "[": { precedence: PRECEDENCE.POSTFIX, type: "postfix" },
  "^^": { precedence: PRECEDENCE.POSTFIX, type: "postfix" },
  "]": { precedence: 0, type: "grouping" },
  "{": { precedence: 0, type: "grouping" },
  "}": { precedence: 0, type: "grouping" },

  // Brace sigil containers
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

  // Mutation brace
  "{!": { precedence: 0, type: "brace_sigil" },

  // Double-dot (external property access)
  "..": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "infix" },
  // Dot-pipe operators
  ".|": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "postfix" },
  "|.": { precedence: PRECEDENCE.PROPERTY, associativity: "left", type: "postfix" },

  // Separators
  ",": { precedence: 5, associativity: "left", type: "infix" },
  ";": {
    precedence: PRECEDENCE.STATEMENT,
    associativity: "left",
  },
  "|": { precedence: 0, type: "separator" },
  "|}": { precedence: 0, type: "separator" },
};

class Parser {
  constructor(tokens, systemLookup, source = "") {
    this.tokens = tokens;
    this.systemLookup = systemLookup || (() => ({ type: "identifier" }));
    this.source = source;
    this.position = 0;
    this.current = null;
    this.skippedComments = [];
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
          pos: [this.tokens.length, this.tokens.length, this.tokens.length],
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
      ...properties,
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

  // Get symbol info, including system identifier lookup
  getSymbolInfo(token) {
    if (token.type === "Symbol") {
      return SYMBOL_TABLE[token.value] || { precedence: 0, type: "unknown" };
    } else if (token.type === "SemicolonSequence") {
      // Semicolon sequences should not be treated as binary operators
      return { precedence: 0, type: "separator" };
    } else if (token.type === "Identifier" && token.kind === "System") {
      const systemInfo = this.systemLookup(token.value);
      // Convert system lookup result to symbol table format
      if (systemInfo.type === "operator") {
        return {
          precedence: systemInfo.precedence || PRECEDENCE.MULTIPLICATION,
          associativity: systemInfo.associativity || "left",
          type: systemInfo.operatorType || "infix",
        };
      }
    }
    return null;
  }

  // Check if an AST node is syntactically callable for implicit application.
  // Callable means: uppercase-leading identifier (System) that is not an operator/constant/command,
  // SystemFunctionRef, FunctionLambda, or result of implicit application (chained calls).
  isCallableNode(node) {
    if (node.type === "SystemIdentifier") {
      // Check systemInfo — operators, constants, and commands are not callable by adjacency
      const info = node.systemInfo;
      if (!info) return true; // unknown → assume callable
      if (info.type === "operator" || info.type === "constant") return false;
      return true; // type "function" or "identifier" → callable
    }
    if (node.type === "SystemFunctionRef") return true;
    if (node.type === "FunctionLambda") return true;
    if (node.type === "ImplicitApplication") return true;
    if (node.type === "FunctionCall") return true;
    if (node.type === "SystemAccess") return true;
    if (node.type === "SystemCall") return true;
    if (node.type === "Call") return true;
    if (node.type === "MethodCall") return true;
    // Grouping that wraps a callable is callable: (F), (@-(_2, _1))
    if (node.type === "Grouping" && node.expression) return this.isCallableNode(node.expression);
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

  // Check if the current token can start a new implicit operand (factor).
  // This is used to detect adjacency — the next token must be something that
  // can begin an expression in a multiplicative context.
  canStartImplicitOperand() {
    const t = this.current;
    if (t.type === "End") return false;
    if (t.type === "Number") return true;
    if (t.type === "Identifier") {
      // System identifiers that are operators (AND, OR, NOT) cannot start an implicit operand
      if (t.kind === "System") {
        const info = this.systemLookup(t.value);
        if (info && info.type === "operator") return false;
      }
      return true;
    }
    if (t.type === "PlaceHolder") return true;
    if (t.type === "OuterIdentifier") return true;
    if (t.type === "String" && t.kind !== "comment") return true;
    if (t.type === "Symbol" && t.value === "(") return true;
    // Note: "[" is NOT included — it's a postfix bracket-index operator, not an adjacency start
    return false;
  }

  // Parse expression with given minimum precedence
  parseExpression(minPrec = 0) {
    const left = this.parsePrefix();
    return this.parseExpressionRec(left, minPrec, false);
  }

  parseCommaSequenceExpression(minPrec = 0) {
    const expressions = [this.parseExpression(minPrec)];

    while (this.current.value === ",") {
      this.advance();
      if (
        this.current.value === ";" ||
        this.current.value === "}" ||
        this.current.type === "SemicolonSequence" ||
        this.current.type === "End"
      ) {
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
      end: last.pos?.[2],
    });
  }

  // Parse prefix expressions (literals, unary operators, grouping)
  parsePrefix() {
    const token = this.current;

    switch (token.type) {
      case "Number":
        this.advance();
        return this.createNode("Number", {
          value: token.value,
          original: token.original,
        });

      case "String":
        this.advance();
        if (token.kind === "backtick") {
          return this.parseEmbeddedLanguage(token);
        } else {
          return this.createNode("String", {
            value: token.value,
            kind: token.kind,
            original: token.original,
          });
        }

      case "RegexLiteral":
        this.advance();
        return this.createNode("RegexLiteral", {
          pattern: token.pattern,
          flags: token.flags,
          mode: token.mode,
          original: token.original,
        });

      case "Identifier":
        this.advance();
        if (token.kind === "SystemFunction") {
          return this.createNode("SystemFunctionRef", {
            name: token.value,
            original: token.original,
          });
        } else if (token.kind === "System") {
          const systemInfo = this.systemLookup(token.value);
          return this.createNode("SystemIdentifier", {
            name: token.value,
            systemInfo: systemInfo,
            original: token.original,
          });
        } else {
          return this.createNode("UserIdentifier", {
            name: token.value,
            original: token.original,
          });
        }

      case "OuterIdentifier":
        this.advance();
        return this.createNode("OuterIdentifier", {
          name: token.value,
          original: token.original,
        });

      case "PlaceHolder":
        this.advance();
        return this.createNode("PlaceHolder", {
          place: token.place,
          original: token.original,
        });

      case "Symbol":
        if (token.value === "...") {
          this.advance();
          // The precedence here ensures we capture the trailing expression.
          const expr = this.parseExpression(PRECEDENCE.POSTFIX);
          return this.createNode("Spread", {
            expression: expr,
            pos: token.pos,
            original: token.original + (expr.original || ""),
          });
        } else if (token.value === "(") {
          return this.parseGrouping();
        } else if (token.value === "[") {
          return this.parseArray();
        } else if (token.value === "<") {
          return this.parseAngleForm();
        } else if (token.value === "{") {
          return this.parseBraceContainer();
        } else if (token.value === "{=" || token.value === "{?" || token.value === "{;" || token.value === "{|" || token.value === "{:" || token.value === "{@" || token.value === "{#" || token.value === "{.."
          || token.value === "{^"
          || token.value === "{$") {
          if (token.value === "{#") {
            return this.parseSystemSpecLiteral();
          }
          if (token.value === "{^") {
            return this.parseValueOutfit();
          }
          return this.parseBraceSigil(token.value, token.containerName ?? null, {
            loopMax: token.loopMax,
            loopUnlimited: token.loopUnlimited === true,
            destructureAlias: token.destructureAlias === true,
          });
        } else if (
          token.value === "{+" ||
          token.value === "{*" ||
          token.value === "{&&" ||
          token.value === "{||" ||
          token.value === "{\\/" ||
          token.value === "{/\\" ||
          token.value === "{++" ||
          token.value === "{<<" ||
          token.value === "{>>"
        ) {
          return this.parseOperatorBrace(token.value);
        } else if (token.value === "{!") {
          return this.parseBreakBlock();
        } else if (token.value === "@@") {
          this.advance(); // consume '@@'
          const expr = this.parseExpression(PRECEDENCE.UNARY);
          return this.createNode("SystemCapabilityCall", {
            property: "EVAL",
            arguments: { positional: [expr], keyword: {}, metadata: {} },
            pos: token.pos,
            original: token.original + (expr.original || ""),
          });
        } else if (token.value === "@") {
          // @ followed by { or brace sigil = deferred block: @{; ...}, @{? ...}, @{...}
          this.advance(); // consume '@'
          const nextVal = this.current.value;
          if (nextVal === "{" || nextVal === "{;" || nextVal === "{?" || nextVal === "{=" || nextVal === "{|" || nextVal === "{:" || nextVal === "{@" || nextVal === "{#" || nextVal === "{$" || nextVal === "{.." || nextVal === "{^") {
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
                destructureAlias: this.current.destructureAlias === true,
              });
            }
            return this.createNode("DeferredBlock", {
              body: inner,
              pos: token.pos,
              original: token.original,
            });
          }

          // Feature: @+ directly references ADD system function, @* to MUL, etc.
          const operatorToSystem = {
            "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", "//": "INTDIV", "%": "MOD", "^": "POW", "**": "POWPROD",
            "=": "EQ", "!=": "NEQ", "<": "LT", ">": "GT", "<=": "LTE", ">=": "GTE",
            "&&": "AND", "||": "OR", "!": "NOT"
          };

          if (operatorToSystem[nextVal]) {
            const opToken = this.current;
            this.advance(); // consume the operator symbol
            const sysName = operatorToSystem[nextVal];
            // @+ is a read-only alias for .ADD — produce SystemAccess node
            return this.createNode("SystemAccess", {
              property: sysName,
              original: token.original + opToken.original,
            });
          }

          // Bare @ — treat as user identifier for postfix @(...) syntax
          return this.createNode("UserIdentifier", {
            name: "@",
            original: token.original,
          });
        } else if (token.value === "+" || token.value === "-" || token.value === "!") {
          return this.parseUnaryOperator();
        } else if (token.value === "'") {
          // Leading quote for integral
          return this.parseIntegral();
        } else if (token.value === ".") {
          // Leading dot: system context object access
          // . alone → SystemObject (the system context itself)
          // .Name   → SystemAccess (a capability or meta flag)
          this.advance(); // consume '.'
          if (this.current.type === "Identifier") {
            const property = this.parseMethodName();
            return this.createNode("SystemAccess", {
              property: property.name,
              original: token.original + property.original,
            });
          }
          return this.createNode("SystemObject", {
            original: token.original,
          });
        } else if (token.value === "_") {
          // Underscore is always a null symbol
          this.advance();
          return this.createNode("NULL", {
            original: token.original,
          });
        } else if (token.value === "$$") {
          this.advance();
          return this.createNode("ParentSelfRef", {
            original: token.original,
          });
        } else if (token.value === "$") {
          this.advance();
          return this.createNode("SelfRef", {
            original: token.original,
          });
        } else if (token.value === ":") {
          // Colon-string: :word produces a string literal in prefix position
          this.advance(); // consume ':'
          if (this.current.type === "Identifier" || this.current.type === "Number") {
            const valToken = this.current;
            // Use original text (trimmed) to preserve case for identifiers
            // (.value is uppercased for System identifiers)
            const rawText = valToken.original.trim();
            this.advance(); // consume identifier/number
            return this.createNode("String", {
              value: rawText,
              kind: "colon",
              original: token.original + valToken.original,
            });
          }
          this.error(`Expected identifier or number after ':' in colon-string`);
        } else {
          this.error(`Unexpected token in prefix position: ${token.value}`);
        }
        break;

      default:
        this.error(`Unexpected token: ${token.type}`);
    }
  }

  // Parse infix expressions (binary operators, function calls, etc.)
  parseInfix(left, symbolInfo) {
    const operator = this.current;

    // Special case for function calls - check if we have an identifier followed by '('
    if (
      operator.value === "(" &&
      (left.type === "UserIdentifier" || left.type === "SystemIdentifier" || left.type === "SystemFunctionRef")
    ) {
      // Lowercase letter-based user identifiers followed by ( are implicit multiplication: f(x) = f * (x)
      // Uppercase (System/SystemFunctionRef) are function calls: F(x), @_ASSIGN(x)
      // Operator-symbol identifiers (+, *, <, etc.) remain function calls
      if (left.type === "UserIdentifier" && /^[\p{L}]/u.test(left.name)) {
        // Implicit multiplication: parse the grouped expression and create MUL
        const grouping = this.parseGrouping();
        return this.createNode("ImplicitMultiplication", {
          left: left,
          right: grouping,
          pos: left.pos,
          original: left.original + operator.original,
        });
      }

      this.advance(); // consume '('
      const args = this.parseFunctionCallArgs();
      if (this.current.value !== ")") {
        this.error("Expected closing parenthesis in function call");
      }
      this.advance(); // consume ')'

      // SystemFunctionRef calls produce SystemCall nodes
      if (left.type === "SystemFunctionRef") {
        return this.createNode("SystemCall", {
          name: left.name,
          arguments: args,
          pos: left.pos,
          original: left.original + operator.original,
        });
      }

      return this.createNode("FunctionCall", {
        function: left,
        arguments: args,
        pos: left.pos,
        original: left.original + operator.original,
      });
    }

    if (operator.value === "?-" || operator.value === "?!-") {
      this.advance(); // consume ?- / ?!-
      const prep = this.current.value === "["
        ? this.parseArray()
        : this.parseExpression(PRECEDENCE.ARROW + 1);
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
      this.advance(); // consume arrow
      const body = this.parseExpression(PRECEDENCE.ARROW);
      const prepStrict = operator.value === "?!-";
      const fnNode = this.buildFunctionArrowNode(left, arrow, body, {
        prep,
        prepStrict,
        variantName,
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
    if (symbolInfo.associativity === "left") {
      rightPrec += 1;
    }

    let right;
    if (operator.value === "[" && symbolInfo.type === "postfix") {
      // Check for key literal syntax: obj[:name], obj[:1], obj[:"1"]
      if (
        this.current.value === ":" &&
        ["Identifier", "Number", "String"].includes(this.peek().type)
      ) {
        this.advance(); // consume ':'
        const keyName = this.current.value;
        const keyOriginal = this.current.original;
        this.advance(); // consume identifier
        if (this.current.value !== "]") {
          this.error("Expected ] after key literal");
        }
        this.advance(); // consume ']'
        return this.createNode("PropertyAccess", {
          object: left,
          property: { type: "KeyLiteral", name: keyName, original: ":" + keyOriginal },
          pos: left.pos,
          original: left.original + operator.original,
        });
      }

      return this.parseBracketIndex(left, operator);
    } else if (operator.value === "^^" && symbolInfo.type === "postfix") {
      return this.createNode("Transpose", {
        expression: left,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":->" || operator.value === "->" || operator.value === "=>"
      || operator.value === "^=>") {
      right = this.parseExpression(rightPrec);
      const fnNode = this.buildFunctionArrowNode(left, operator.value, right);
      if (fnNode) {
        return fnNode;
      }
      if (operator.value === "=>" || operator.value === "^=>") {
        this.error("Append/prepend syntax requires a named function signature like F(x) => body");
      }
    } else if (operator.value === ":=>") {
      // Pattern matching function definition
      right = this.parseExpression(rightPrec);

      let funcName = left;
      let parameters = {
        positional: [],
        keyword: [],
        conditionals: [],
        metadata: {},
      };
      let patterns = [];
      let globalMetadata = {};

      if (left.type === "FunctionCall") {
        funcName = left.function;
        parameters = this.convertArgsToParams(left.arguments);
      }

      // Handle different pattern syntax and parse each pattern as a function
      let rawPatterns = [];
      if (right.type === "Array") {
        // Array syntax: g :=> [ (x ? x < 0) -> -x, (x) -> x ]
        rawPatterns = right.elements;
      } else if (
        right.type === "WithMetadata" &&
        right.primary &&
        right.primary.type === "Array"
      ) {
        // Array with metadata: g :=> [ [(x ? x < 0) -> -x+n, (x) -> x-n] , n := 4]
        if (
          Array.isArray(right.primary.elements) &&
          right.primary.elements.length > 0 &&
          right.primary.elements[0].type === "Array"
        ) {
          rawPatterns = right.primary.elements[0].elements;
        } else {
          rawPatterns = right.primary.elements;
        }
        globalMetadata = right.metadata;
      } else {
        // Single pattern: g :=> (x ? x < 0) -> -x
        rawPatterns = [right];
      }

      // Parse each pattern as a function definition
      for (const pattern of rawPatterns) {
        if (pattern.type === "FunctionLambda") {
          // Handle FunctionLambda nodes (new parsing with higher -> precedence)
          const patternFunc = {
            parameters: pattern.parameters,
            body: pattern.body,
          };
          patterns.push(patternFunc);
        } else if (
          pattern.type === "BinaryOperation" &&
          pattern.operator === "->"
        ) {
          // Handle legacy BinaryOperation nodes (fallback)
          const patternFunc = {
            parameters: {
              positional: [],
              keyword: [],
              conditionals: [],
              metadata: {},
            },
            body: pattern.right,
          };

          // Parse the left side (parameters with potential conditions)
          if (pattern.left.type === "Grouping") {
            const paramExpr = pattern.left.expression;
            if (
              paramExpr.type === "BinaryOperation" &&
              paramExpr.operator === "?"
            ) {
              // (x ? condition) format
              const paramName = paramExpr.left.name || paramExpr.left.value;
              patternFunc.parameters.positional.push({
                name: paramName,
                defaultValue: null,
              });
              patternFunc.parameters.conditionals.push(paramExpr.right);
            } else if (paramExpr.type === "UserIdentifier") {
              // Simple (x) format
              patternFunc.parameters.positional.push({
                name: paramExpr.name || paramExpr.value,
                defaultValue: null,
              });
            }
            // TODO: Handle more complex parameter expressions
          }

          patterns.push(patternFunc);
        }
      }

      return this.createNode("PatternMatchingFunction", {
        name: funcName,
        parameters: parameters,
        patterns: patterns,
        metadata: globalMetadata,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "->") {
      // Function arrow - handle ParameterList nodes specially
      right = this.parseExpression(rightPrec);

      // Check if left side is a ParameterList (from grouping with semicolons)
      if (
        left.type === "Grouping" &&
        left.expression &&
        left.expression.type === "ParameterList"
      ) {
        return this.createNode("FunctionLambda", {
          parameters: left.expression.parameters,
          prep: null,
          prepStrict: false,
          body: right,
          pos: left.pos,
          original: left.original + operator.original,
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
          original: left.original + operator.original,
        });
      }

      // Regular binary operation
      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>") {
      // Simple pipe operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Pipe", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>/") {
      // STRICT slice operator
      right = this.parseExpression(rightPrec);
      return this.createNode("SliceStrict", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>/|") {
      // SPLIT operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Split", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>#|") {
      // CHUNK operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Chunk", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>//") {
      // CLAMPED slice operator
      right = this.parseExpression(rightPrec);
      return this.createNode("SliceClamp", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "||>") {
      // Explicit pipe operator with placeholders
      right = this.parseExpression(rightPrec);

      return this.createNode("ExplicitPipe", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>>") {
      // Map operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Map", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>?") {
      // Filter operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Filter", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>&&") {
      // Every (all) operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Every", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|>||") {
      // Some (any) operator
      right = this.parseExpression(rightPrec);
      return this.createNode("Some", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|:>") {
      // Reduce operator with explicit init: list |:> init >: fn
      const startValue = this.parseExpression(rightPrec);

      const nextOp = this.current;
      if (nextOp.type !== "Symbol" || nextOp.value !== ">:") {
        this.error("Expected '>:' after start value in '|:>' reduce expression, found " + nextOp.value);
      } else {
        this.advance(); // consume `>:`
      }

      const fnExpr = this.parseExpression(rightPrec);
      return this.createNode("Reduce", {
        left: left,
        init: startValue,
        right: fnExpr,
        pos: left.pos,
        original: left.original + operator.original + startValue.original + (nextOp.value === ">:" ? nextOp.original : "") + fnExpr.original,
      });
    } else if (operator.value === "|>:") {
      // Reduce operator: list |>: fn (first element as init)
      // For explicit init value, use REDUCE(list, fn, init) function call
      right = this.parseExpression(rightPrec);
      return this.createNode("Reduce", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|><") {
      // Reverse operator (no right operand needed)
      return this.createNode("Reverse", {
        target: left,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|<>") {
      // Sort operator: list |<> fn (comparator function)
      right = this.parseExpression(rightPrec);
      return this.createNode("Sort", {
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":+") {
      // Interval stepping (direction determined at eval time based on step sign)
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalStepping", {
        interval: left,
        step: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "::") {
      // Interval division into equally spaced points
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalDivision", {
        interval: left,
        count: right,
        type: "equally_spaced",
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":/:") {
      // Interval partition into sub-intervals
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalPartition", {
        interval: left,
        count: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":~") {
      // Interval mediants
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        this.error("':~' is the interval mediants operator. For semantic conversion, use '~:' as in 'x ~: :Type'.");
      }
      return this.createNode("IntervalMediants", {
        interval: left,
        levels: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":~/") {
      // Interval mediant partition
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        this.error("':~/' is the interval mediant partition operator. For semantic conversion, use '~:' as in 'x ~: :Type'.");
      }
      return this.createNode("IntervalMediantPartition", {
        interval: left,
        levels: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":%") {
      // Random selection from interval
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalRandom", {
        interval: left,
        parameters: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ":/%") {
      // Random partition of interval
      right = this.parseExpression(rightPrec);
      return this.createNode("IntervalRandomPartition", {
        interval: left,
        count: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "::+") {
      // Infinite sequence (direction determined at eval time based on step sign)
      right = this.parseExpression(rightPrec);

      return this.createNode("InfiniteSequence", {
        start: left,
        step: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "??") {
      // Ternary operator: condition ?? trueExpr ?: falseExpr
      // Parse true expression with higher precedence to prevent ?: consumption
      const trueExpr = this.parseExpression(PRECEDENCE.CONDITION + 5);

      if (this.current.value !== "?:") {
        this.error('Expected "?:" in ternary operator after true expression');
      }

      this.advance(); // consume '?:'

      // Parse false expression with right-associative precedence
      const falseExpr = this.parseExpression(rightPrec);

      return this.createNode("TernaryOperation", {
        condition: left,
        trueExpression: trueExpr,
        falseExpression: falseExpr,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ".") {
      // Dot property access: P.type, P.Derivative, etc.
      // Right side must be an identifier (property name)
      const property = this.parseMethodName();

      return this.createNode("DotAccess", {
        object: left,
        property: property.name,
        pos: left.pos,
        original: left.original + operator.original + property.original,
      });
    } else if (operator.value === "..") {
      // Double-dot: obj.. returns all meta properties as a map
      // obj..name is no longer supported (use obj.name for meta access)
      if (this.current.type === "Identifier") {
        this.error("a..name is no longer supported; use a.name for meta property access");
      }
      // obj.. → META_ALL
      return this.createNode("ExternalAccess", {
        object: left,
        property: null,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === ".|") {
      // obj.| returns set of keys
      return this.createNode("KeySet", {
        object: left,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "|.") {
      // obj|. returns set of values
      return this.createNode("ValueSet", {
        object: left,
        pos: left.pos,
        original: left.original + operator.original,
      });
    } else if (operator.value === "?") {
      right = this.parseExpression(rightPrec);
      if (right?.type === "String" && right.kind === "colon") {
        return this.createNode("SemanticHas", {
          expression: left,
          name: right.value,
          pos: left.pos,
          original: left.original + operator.original + right.original,
        });
      }

      return this.createNode("BinaryOperation", {
        operator: operator.value,
        left: left,
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
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
        original: left.original + operator.original + right.original,
      });
    } else {
      // Binary operator
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
          "Number",
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
        right: right,
        pos: left.pos,
        original: left.original + operator.original,
      });
    }
  }

  parseGrouping() {
    const startToken = this.current;
    this.advance(); // consume '('

    // Check for empty parentheses first
    if (this.current.value === ")") {
      this.advance(); // consume ')'
      return this.createNode("Tuple", {
        elements: [],
        pos: startToken.pos,
        original: startToken.original,
      });
    }

    // Scan ahead to determine what type of content we have
    let hasSemicolon = false;
    let hasComma = false;
    let tempPos = this.position - 1;
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    while (tempPos < this.tokens.length) {
      const token = this.tokens[tempPos];

      if (token.value === "(") parenDepth++;
      else if (token.value === ")") {
        if (parenDepth === 0) break;
        parenDepth--;
      }
      else if (typeof token.value === 'string' && token.value.startsWith("{")) braceDepth++;
      else if (token.value === "}") braceDepth--;
      else if (token.value === "[") bracketDepth++;
      else if (token.value === "]") bracketDepth--;

      else if (parenDepth === 0 && braceDepth <= 0 && bracketDepth <= 0) {
        if (token.value === ";") {
          hasSemicolon = true;
          break;
        } else if (token.value === ",") {
          hasComma = true;
          // Don't break - continue scanning for semicolons
        }
      }
      tempPos++;
    }

    let result;
    if (hasSemicolon) {
      // Parse as function parameters
      const params = this.parseFunctionParameters();
      result = this.createNode("Grouping", {
        expression: this.createNode("ParameterList", {
          parameters: params,
          pos: startToken.pos,
          original: startToken.original,
        }),
        pos: startToken.pos,
        original: startToken.original,
      });
    } else if (hasComma) {
      // Parse as tuple
      const elements = this.parseTupleElements();
      result = this.createNode("Tuple", {
        elements: elements,
        pos: startToken.pos,
        original: startToken.original,
      });
    } else {
      // Parse as regular grouped expression
      const expr = this.parseExpression(0);
      result = this.createNode("Grouping", {
        expression: expr,
        pos: startToken.pos,
        original: startToken.original,
      });
    }

    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis");
    }
    this.advance(); // consume ')'

    return result;
  }

  parseTupleElements() {
    const elements = [];

    // Parse first element
    let firstElement = this.parseTupleElement();
    elements.push(firstElement);

    // Look for trailing comma or more elements
    while (this.current.value === ",") {
      this.advance(); // consume ','

      // Check for consecutive commas (syntax error)
      if (this.current.value === "," || this.current.value === ")") {
        if (this.current.value === ",") {
          this.error("Consecutive commas not allowed in tuples");
        }
        // Trailing comma case - we're done
        break;
      }

      // Parse next element
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
    this.advance(); // consume '['

    // Check if this might be a matrix/tensor by looking for semicolons
    const result = this.parseMatrixOrArray(startToken);

    if (this.current.value !== "]") {
      this.error("Expected closing bracket");
    }
    this.advance(); // consume ']'

    return result;
  }

  parseGeneratorChain() {
    // Parse initial expression or start with null if we begin with a generator operator
    let start = null;
    const operators = [];

    // If current token is not a generator operator, parse the start value
    if (!this.isGeneratorOperator(this.current.value)) {
      // Parse the start value but don't let it consume generator operators
      const savedPos = this.pos;
      try {
        start = this.parseExpressionUntilGenerator();
      } catch (e) {
        // If parsing fails, restore position and treat as no start value
        this.pos = savedPos;
        start = null;
      }
    }

    // Parse chain of generator operators
    while (this.isGeneratorOperator(this.current.value)) {
      const operator = this.current;
      this.advance();

      // Parse the operand with higher precedence to avoid consuming subsequent operators
      const operand = this.parseExpression(PRECEDENCE.PIPE + 1);

      const operatorNode = this.createGeneratorOperatorNode(
        operator.value,
        operand,
        operator,
      );
      operators.push(operatorNode);
    }

    if (operators.length === 0) {
      return start; // Not actually a generator chain
    }

    return this.createNode("GeneratorChain", {
      start: start,
      operators: operators,
      pos: start ? start.pos : operators[0].pos,
      original: start ? start.original : operators[0].original,
    });
  }

  parseExpressionUntilGenerator() {
    // Parse just the prefix expression and return it
    // Don't parse infix operations that might include generators
    return this.parsePrefix();
  }

  parseExpressionRec(left, minPrec, stopAtGenerators = false) {
    while (this.current.type !== "End") {
      // Check for statement terminators
      if (
        this.current.value === ";" ||
        this.current.value === "," ||
        this.current.value === ")" ||
        this.current.value === "]" ||
        this.current.value === "}" ||
        this.current.type === "SemicolonSequence"
      ) {
        break;
      }


      // Special case for function calls and implicit multiplication with parens
      if (this.current.value === "(") {
        // Non-callable expressions followed by '(' are implicit multiplication: 3(x+1), a(x+1), (x+1)(x+2)
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

      // Implicit adjacency: multiplication or callable application
      // Handles: 3a, 3x^2, a b, 5 10, F 3, F 3x, 3 F 7, F G 7, etc.
      if (this.canStartImplicitOperand()) {
        // Skip adjacency if current token is a known infix operator (e.g. "1 OR 2")
        const nextSymbolInfo = this.getSymbolInfo(this.current);
        if (nextSymbolInfo && nextSymbolInfo.type === "infix") {
          // Fall through to normal operator handling below
        } else {
          // Prefix operators like NOT when used as SystemIdentifier
          if (
            left.type === "SystemIdentifier" &&
            left.systemInfo &&
            left.systemInfo.type === "operator" && left.systemInfo.operatorType === "prefix"
          ) {
            // Parse a single operand at unary precedence
            const operand = this.parseExpression(PRECEDENCE.UNARY);
            left = this.createNode("UnaryOperation", {
              operator: left.name,
              operand: operand,
              pos: left.pos,
              original: left.original + (operand.original || ""),
            });
            continue;
          }

          // Implicit callable application: callable followed by adjacent operand
          // F 3, F 3x, F G 7, etc. — callable consumes the maximal multiplicative chunk
          if (this.isCallableNode(left)) {
            if (IMPLICIT_APPLICATION_PRECEDENCE < minPrec) {
              break;
            }
            // Parse the argument as a full multiplicative chunk (stops at addition and below)
            const arg = this.parseExpression(PRECEDENCE.ADDITION + 1);
            left = this.createNode("ImplicitApplication", {
              callable: left,
              argument: arg,
              pos: [left.pos[0], left.pos[0], arg.pos[2]],
              original: left.original + (arg.original || ""),
            });
            continue;
          }

          // Implicit multiplication: number/variable followed by adjacent operand
          // 3a, 3 a, a b, 3x^2, (x+1)(x+2), etc.
          if (JUXTAPOSITION_PRECEDENCE < minPrec) {
            break;
          }
          const right = this.parseExpression(JUXTAPOSITION_PRECEDENCE + 1);
          left = this.createNode("ImplicitMultiplication", {
            left: left,
            right: right,
            pos: [left.pos[0], left.pos[0], right.pos[2]],
            original: left.original + (right.original || ""),
          });
          continue;
        }
      }

      // Special case for postfix @ operator (AT metadata access)
      if (this.current.value === "@" && this.peek().value === "(") {
        left = this.parseAt(left);
        continue;
      }

      // Special case for postfix ? operator (ASK metadata access)
      // Must distinguish from infix ? (condition operator)
      if (this.current.value === "?" && this.peek().value === "(") {
        left = this.parseAsk(left);
        continue;
      }

      // Special case for postfix derivatives (single quotes after function/identifier)
      if (
        this.current.value === "'" &&
        (left.type === "UserIdentifier" ||
          left.type === "SystemIdentifier" ||
          left.type === "SystemFunctionRef" ||
          left.type === "FunctionCall" ||
          left.type === "ImplicitApplication" ||
          left.type === "PropertyAccess" ||
          left.type === "Derivative" ||
          left.type === "Integral")
      ) {
        left = this.parseDerivative(left);
        continue;
      }

      // Special case for unit operators ~[ and ~{
      if (this.current.value === "~[") {
        left = this.parseScientificUnit(left);
        continue;
      }
      if (this.current.value === "~{") {
        left = this.parseMathematicalUnit(left);
        continue;
      }

      // Special case for mutation syntax: obj{= ...} or obj{! ...}
      if (this.current.value === "{=" || this.current.value === "{!") {
        left = this.parseMutation(left);
        continue;
      }

      let symbolInfo = this.getSymbolInfo(this.current);

      // Disambiguate `->` operator precedence:
      // Function definitions like `F(x) -> ...` need loose precedence (assignment).
      // Lambdas like `x -> ...` need tight precedence (arrow) to bind inside pipes.
      if (symbolInfo && this.current.value === "->") {
        if (left.type === "FunctionCall" || left.type === "ImplicitMultiplication") {
          symbolInfo = { ...symbolInfo, precedence: PRECEDENCE.ASSIGNMENT };
        }
      }

      if (!symbolInfo || symbolInfo.precedence < minPrec) {
        break;
      }

      if (symbolInfo.type === "statement" || symbolInfo.type === "separator") {
        break;
      }

      // Stop at generator operators if flag is set
      if (stopAtGenerators && this.isGeneratorOperator(this.current.value)) {
        break;
      }

      left = this.parseInfix(left, symbolInfo);
    }

    return left;
  }

  isGeneratorOperator(value) {
    return ["|+", "|*", "|:", "|?", "|^", "|^:", "|;", "|>"].includes(value);
  }

  createGeneratorOperatorNode(operator, operand, token) {
    const typeMap = {
      "|+": "GeneratorAdd",
      "|*": "GeneratorMultiply",
      "|:": "GeneratorFunction",
      "|?": "GeneratorFilter",
      "|^": "GeneratorLimit",
      "|^:": "GeneratorLazyLimit",
      "|;": "GeneratorEagerLimit",
      "|>": "GeneratorPipe",
    };

    return this.createNode(typeMap[operator], {
      operator: operator,
      operand: operand,
      pos: token.pos,
      original: token.original,
    });
  }

  convertBinaryChainToGeneratorChain(binaryOp) {
    // Convert a binary operation chain with generator operators to GeneratorChain
    const operators = [];
    let current = binaryOp;
    let start = null;

    // Traverse the binary operation tree to extract generator operators
    while (
      current &&
      current.type === "BinaryOperation" &&
      this.isGeneratorOperator(current.operator)
    ) {
      // Add this operator to the front of the list (since we're traversing backwards)
      const operatorNode = this.createGeneratorOperatorNode(
        current.operator,
        current.right,
        current,
      );
      operators.unshift(operatorNode);

      current = current.left;
    }

    // The remaining left side is the start value (unless it's also a generator operation)
    if (
      current &&
      current.type === "BinaryOperation" &&
      this.isGeneratorOperator(current.operator)
    ) {
      // Recursively convert nested generator chains
      const nestedChain = this.convertBinaryChainToGeneratorChain(current);
      start = nestedChain.start;
      operators.unshift(...nestedChain.operators);
    } else {
      start = current;
    }

    return this.createNode("GeneratorChain", {
      start: start,
      operators: operators,
      pos: binaryOp.pos,
      original: binaryOp.original,
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
        // Handle leading semicolons (empty rows at start)
        if (
          this.current.value === ";" ||
          this.current.type === "SemicolonSequence"
        ) {
          hasSemicolons = true;
          const semicolonCount = this.consumeSemicolonSequence();

          // Add empty row to matrix structure
          matrixStructure.push({
            row: [],
            separatorLevel: semicolonCount,
          });
          continue;
        }

        // Parse element - check for generator chains or empty slot (hole)
        let element;
        if (this.current.value === "," || this.current.value === "]") {
          // Empty slot → hole (do not advance; separator is handled below)
          element = this.createNode("Hole", { original: "" });
        } else if (this.isGeneratorOperator(this.current.value)) {
          // Start with generator operator (no initial value)
          element = this.parseGeneratorChain();
        } else {
          // Parse expression normally first
          element = this.parseCapturedConstructorElement();

          // Check if this element is actually a generator chain (parsed as binary operations)
          if (
            element.type === "BinaryOperation" &&
            this.isGeneratorOperator(element.operator)
          ) {
            element = this.convertBinaryChainToGeneratorChain(element);
          }
        }

        // Check if this is a metadata assignment (key := value)
        if (element.type === "BinaryOperation" && element.operator === ":=") {
          if (hasSemicolons) {
            this.error(
              "Cannot mix matrix/tensor syntax with metadata - use nested array syntax",
            );
          }
          hasMetadata = true;
          // Extract the key from the left side
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
          // Regular element
          nonMetadataCount++;
          if (hasMetadata) {
            this.error(
              "Cannot mix array elements with metadata - use nested array syntax like [[1,2,3], key := value]",
            );
          }
          if (nonMetadataCount === 1) {
            primaryElement = element;
          }
          elements.push(element);
          currentRow.push(element);
        }

        // Check what comes next
        if (this.current.value === ",") {
          this.advance();
          // Trailing hole: comma immediately followed by ']'
          if (this.current.value === "]") {
            const trailingHole = this.createNode("Hole", { original: "" });
            elements.push(trailingHole);
            currentRow.push(trailingHole);
            nonMetadataCount++;
          }
        } else if (
          this.current.value === ";" ||
          this.current.type === "SemicolonSequence"
        ) {
          if (hasMetadata) {
            this.error("Cannot mix matrix/tensor syntax with metadata");
          }
          hasSemicolons = true;
          const semicolonCount = this.consumeSemicolonSequence();

          // Add current row to matrix structure (even if empty)
          matrixStructure.push({
            row: [...currentRow],
            separatorLevel: semicolonCount,
          });
          currentRow = [];
        } else {
          break;
        }
      } while (this.current.value !== "]" && this.current.type !== "End");
    }

    // Add final row (always add if we have semicolons, even if empty)
    if (currentRow.length > 0 || hasSemicolons) {
      matrixStructure.push({
        row: currentRow,
        separatorLevel: 0,
      });
    }

    // Check if we have metadata and multiple non-metadata elements
    if (hasMetadata && nonMetadataCount > 1) {
      this.error(
        "Cannot mix array elements with metadata - use nested array syntax like [[1,2,3], key := value]",
      );
    }

    // If we found metadata annotations, create a WithMetadata node
    if (hasMetadata) {
      return this.createNode("WithMetadata", {
        primary:
          primaryElement ||
          this.createNode("Array", {
            elements: [],
            pos: startToken.pos,
            original: startToken.original,
          }),
        metadata: metadataMap,
        pos: startToken.pos,
        original: startToken.original,
      });
    }

    // If we found semicolons, create Matrix or Tensor node
    if (hasSemicolons) {
      return this.buildMatrixTensor(matrixStructure, startToken);
    }

    // Otherwise, return a regular Array node
    return this.createNode("Array", {
      elements: elements,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  buildMatrixTensor(matrixStructure, startToken) {
    // Determine maximum separator level to decide between Matrix and Tensor
    const maxSeparatorLevel = Math.max(
      ...matrixStructure.map((item) => item.separatorLevel),
    );

    if (maxSeparatorLevel === 1) {
      // This is a 2D Matrix - convert structure to simple rows
      const rows = [];

      for (const item of matrixStructure) {
        rows.push(item.row);
      }

      return this.createNode("Matrix", {
        rows: rows,
        pos: startToken.pos,
        original: startToken.original,
      });
    } else {
      // This is a multi-dimensional Tensor
      return this.createNode("Tensor", {
        structure: matrixStructure,
        maxDimension: maxSeparatorLevel + 1,
        pos: startToken.pos,
        original: startToken.original,
      });
    }
  }

  isDirectAssignmentOperator(value) {
    return value === "=" || value === ":=" || value === "~=" || value === "::=" || value === "~~=";
  }

  createDestructureTargetNode(type, props, sourceNode = null) {
    return this.createNode(type, {
      ...props,
      ...(sourceNode?.pos ? { pos: sourceNode.pos } : {}),
      ...(sourceNode?.original ? { original: sourceNode.original } : {}),
    });
  }

  wrapDestructureTarget(target, wrappers) {
    let wrapped = target;
    for (const wrapper of wrappers) {
      if (wrapper.type === "capture") {
        wrapped = this.createDestructureTargetNode("DestructureBindingModeTarget", {
          bindingMode: wrapper.bindingMode,
          target: wrapped,
        }, wrapped);
      } else if (wrapper.type === "semantic") {
        wrapped = this.createDestructureTargetNode("DestructureSemanticTarget", {
          header: wrapper.header,
          target: wrapped,
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
        original: node.original,
      });
    }
    if (node?.type === "Number" && typeof node.value === "string" && node.value.includes(":")) {
      const parts = node.value.split(":");
      if (parts.length === 2) {
        return this.createNode("SliceSpec", {
          start: this.createNode("Number", { value: parts[0], original: parts[0] }),
          end: this.createNode("Number", { value: parts[1], original: parts[1] }),
          pos: node.pos,
          original: node.original,
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
      const property =
        selectorNode.property?.type === "KeyLiteral"
          ? this.createNode("String", {
            value: selectorNode.property.name,
            kind: "colon",
            original: selectorNode.property.original || `:${selectorNode.property.name}`,
          })
          : this.normalizeStandaloneIndexSpec(selectorNode.property);
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: this.convertExpressionToDestructureTarget(selectorNode.object),
        specs: [property],
        nestedTarget,
      }, selectorNode);
    }

    if (selectorNode?.type === "BracketIndex") {
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: this.convertExpressionToDestructureTarget(selectorNode.object),
        specs: selectorNode.specs,
        nestedTarget,
      }, selectorNode);
    }

    const explicitKeyExpr = options.allowBareArraySelector ? this.explicitMapKeyExpression(selectorNode) : null;
    if (explicitKeyExpr) {
      return this.createDestructureTargetNode("DestructureIndexedTarget", {
        wholeTarget: null,
        specs: [this.normalizeStandaloneIndexSpec(explicitKeyExpr)],
        nestedTarget,
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
      const indexed = this.buildIndexedDestructureTarget(
        current.left,
        this.convertExpressionToDestructureTarget(current.right),
        { allowBareArraySelector: true },
      );
      if (indexed) {
        target = indexed;
      } else {
        this.error("Invalid destructuring target");
      }
    } else if (current?.type === "UserIdentifier" || current?.type === "SystemIdentifier") {
      target = this.createDestructureTargetNode("DestructureVariableTarget", {
        name: current.name,
      }, current);
    } else if (current?.type === "Spread") {
      target = this.createDestructureTargetNode("DestructureRestTarget", {
        target: this.convertExpressionToDestructureTarget(current.expression),
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
      for (let i = 0; i < elements.length; i++) {
        const entry = this.convertExpressionToDestructureTarget(elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest) this.error("Destructuring patterns allow at most one rest capture");
          if (i !== elements.length - 1) this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureArrayPattern", {
        entries,
        rest,
      }, current);
    } else if (current?.type === "Tuple" || current?.type === "TupleContainer") {
      const elements = current.elements || [];
      const entries = [];
      let rest = null;
      for (let i = 0; i < elements.length; i++) {
        const entry = this.convertExpressionToDestructureTarget(elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest) this.error("Destructuring patterns allow at most one rest capture");
          if (i !== elements.length - 1) this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureTuplePattern", {
        entries,
        rest,
      }, current);
    } else if (current?.type === "MapContainer") {
      const entries = [];
      let rest = null;
      for (let i = 0; i < current.elements.length; i++) {
        const entry = this.convertMapDestructureEntry(current.elements[i]);
        if (entry.type === "DestructureRestTarget") {
          if (rest) this.error("Destructuring patterns allow at most one rest capture");
          if (i !== current.elements.length - 1) this.error("Rest capture must be in final position");
          rest = entry;
        } else {
          entries.push(entry);
        }
      }
      target = this.createDestructureTargetNode("DestructureMapPattern", {
        entries,
        rest,
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
      for (let row = 0; row < rows; row++) {
        const rowEntries = [];
        for (let col = 0; col < cols; col++) {
          rowEntries.push(this.convertExpressionToDestructureTarget(current.elements[row * cols + col]));
        }
        rowTargets.push(rowEntries);
      }
      target = this.createDestructureTargetNode("DestructureTensorPattern", {
        shape: [...current.shape],
        rows: rowTargets,
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
        target: this.convertExpressionToDestructureTarget(current.expression),
      }, current);
      return this.wrapDestructureTarget(rest, wrappers);
    }

    const makeEntry = (sourceKey, wholeTarget, nestedTarget, sourceNode = current) =>
      this.createDestructureTargetNode("DestructureMapEntry", {
        sourceKey,
        wholeTarget,
        nestedTarget,
      }, sourceNode);

    if (current?.type === "UserIdentifier" || current?.type === "SystemIdentifier") {
      return this.wrapDestructureTarget(
        makeEntry(
          current,
          this.createDestructureTargetNode("DestructureVariableTarget", { name: current.name }, current),
          null,
          current,
        ),
        wrappers,
      );
    }

    if (
      current?.type === "PropertyAccess" &&
      (current.object?.type === "UserIdentifier" || current.object?.type === "SystemIdentifier") &&
      current.property?.type === "KeyLiteral"
    ) {
      return this.wrapDestructureTarget(
        makeEntry(
          this.createNode("String", {
            value: current.property.name,
            kind: "colon",
            original: current.property.original || `:${current.property.name}`,
          }),
          this.createDestructureTargetNode("DestructureVariableTarget", { name: current.object.name }, current.object),
          null,
          current,
        ),
        wrappers,
      );
    }

    if (current?.type === "MapEntry") {
      const explicitKeyExpr = this.explicitMapKeyExpression(current.key);
      if (explicitKeyExpr) {
        return this.wrapDestructureTarget(
          makeEntry(
            explicitKeyExpr,
            null,
            this.convertExpressionToDestructureTarget(current.value),
            current,
          ),
          wrappers,
        );
      }

      if (current.key?.type === "UserIdentifier" || current.key?.type === "SystemIdentifier") {
        return this.wrapDestructureTarget(
          makeEntry(
            current.key,
            this.createDestructureTargetNode("DestructureVariableTarget", { name: current.key.name }, current.key),
            this.convertExpressionToDestructureTarget(current.value),
            current,
          ),
          wrappers,
        );
      }

      if (
        current.key?.type === "PropertyAccess" &&
        (current.key.object?.type === "UserIdentifier" || current.key.object?.type === "SystemIdentifier") &&
        current.key.property?.type === "KeyLiteral"
      ) {
        return this.wrapDestructureTarget(
          makeEntry(
            this.createNode("String", {
              value: current.key.property.name,
              kind: "colon",
              original: current.key.property.original || `:${current.key.property.name}`,
            }),
            this.createDestructureTargetNode("DestructureVariableTarget", { name: current.key.object.name }, current.key.object),
            this.convertExpressionToDestructureTarget(current.value),
            current,
          ),
          wrappers,
        );
      }
    }

    this.error("Malformed map rename/nested syntax");
  }

  consumeSemicolonSequence() {
    if (this.current.type === "SemicolonSequence") {
      // Multiple consecutive semicolons
      const count = this.current.count;
      this.advance();
      return count;
    } else if (this.current.value === ";") {
      // Single semicolon
      this.advance();
      return 1;
    }
    return 0;
  }

  parseBraceContainer() {
    const startToken = this.current;
    this.advance(); // consume '{'

    const imports = this.startsImportHeader() ? this.parseImportHeader() : [];
    const elements = [];

    if (this.current.value !== "}") {
      do {
        // Handle leading semicolons (empty statements)
        if (this.current.value === ";") {
          this.advance();
          continue;
        }

        const element = this.parseExpression(0);
        elements.push(element);

        if (this.current.value === ";" || this.current.value === ",") {
          this.advance();
        } else if (this.current.value !== "}") {
          // If not closed, we expect a separator
          break;
        }
      } while (this.current.value !== "}" && this.current.type !== "End");
    }

    if (this.current.value !== "}") {
      this.error("Expected closing brace for block");
    }
    this.advance(); // consume '}'

    return this.createNode("BlockContainer", {
      ...(imports.length > 0 ? { imports: imports } : {}),
      elements: elements,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  parseOperatorBrace(sigil) {
    const startToken = this.current;
    this.advance(); // consume operator brace sigil

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
    if (sigil === "{+") sysName = "ADD";
    else if (sigil === "{*") sysName = "MUL";
    else if (sigil === "{&&") sysName = "AND";
    else if (sigil === "{||") sysName = "OR";
    else if (sigil === "{\\/") sysName = "NARY_UNION";
    else if (sigil === "{/\\") sysName = "NARY_INTERSECT";
    else if (sigil === "{++") sysName = "NARY_CONCAT";
    else if (sigil === "{<<") sysName = "MIN";
    else if (sigil === "{>>") sysName = "MAX";

    return this.createNode("FunctionCall", {
      function: this.createNode("SystemIdentifier", {
        name: sysName,
        systemInfo: this.systemLookup(sysName),
        original: sigil,
      }),
      arguments: {
        positional: elements,
        keyword: {}
      },
      fromBrace: true,  // distinguishes syntax-generated calls from user-typed calls
      pos: startToken.pos,
      original: sigil,
    });
  }

  isConstructorCaptureOperator(value) {
    return value === "==" || value === ":=" || value === "~=" || value === "::=" || value === "~~=";
  }

  captureModeFromOperator(value) {
    if (value === "==") return "alias";
    if (value === ":=") return "copy";
    if (value === "~=") return "refresh";
    if (value === "::=") return "deep_copy";
    if (value === "~~=") return "deep_refresh";
    return null;
  }

  parseCapturedConstructorElement() {
    let captureMode = null;
    if (this.isConstructorCaptureOperator(this.current.value)) {
      captureMode = this.captureModeFromOperator(this.current.value);
      this.advance();
    }
    const expression = this.parseExpression(0);
    if (!captureMode) return expression;
    return this.createNode("CapturedEntry", {
      captureMode,
      expression,
      pos: expression.pos,
      original: expression.original,
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
        ...(token.kind === "System" ? { systemInfo: this.systemLookup(token.value) } : {}),
        original: token.original,
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
        original: key.original,
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
      original: key.original,
    });
    if (!prefixCaptureMode) {
      return entry;
    }
    return this.createNode("CapturedEntry", {
      captureMode: prefixCaptureMode,
      expression: entry,
      pos: entry.pos,
      original: entry.original,
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
          order,
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
      original: startToken.original,
    });
  }

  parseValueOutfit() {
    const startToken = this.current;
    this.advance(); // consume {^
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
      original: startToken.original,
    });
  }

  // Parse brace sigil containers: {= map, {? case, {; block, {| set, {: tuple, {@ loop
  parseBraceSigil(sigil, containerName = null, options = {}) {
    const startToken = this.current;
    this.advance(); // consume the sigil token (e.g., '{=')

    const isTensorShapeSigil =
      sigil === "{:" && containerName && /^\d+(?:x\d+)*$/.test(containerName);

    if (isTensorShapeSigil && !options.destructureAlias) {
      return this.parseTensorLiteral(startToken, containerName);
    }

    const effectiveSigil =
      isTensorShapeSigil && options.destructureAlias ? "{.." : sigil;

    const sigilTypeMap = {
      "{..": "ArrayContainer",
      "{=": "MapContainer",
      "{?": "CaseContainer",
      "{;": "BlockContainer",
      "{|": "SetContainer",
      "{:": "TupleContainer",
      "{@": "LoopContainer",
      "{$": "BlockContainer",
      "{^": "ValueOutfit",
    };

    const nodeType = sigilTypeMap[effectiveSigil];

    // Determine separator: temporal (;) vs spatial (,)
    const temporalSigils = new Set(["{?", "{;", "{@", "{$"]);
    const isTemporal = temporalSigils.has(effectiveSigil);
    const closerMap = {
      "{|": ["|}", "}"],
    };
    const closers = closerMap[effectiveSigil] || ["}"];
    const primaryCloser = closers[0];
    const isCloser = (val) => closers.includes(val);
    const separator = isTemporal ? ";" : ",";
    const isSeparatorToken = () => (
      isTemporal
        ? this.current.value === ";" || this.current.type === "SemicolonSequence"
        : this.current.value === separator
    );
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

    const header =
      effectiveSigil === "{=" ||
      effectiveSigil === "{|" ||
      effectiveSigil === "{:" ||
      effectiveSigil === "{.."
        ? this.parseSemanticHeader()
        : null;

    const imports =
      (effectiveSigil === "{;" || effectiveSigil === "{@" || effectiveSigil === "{$") && this.startsImportHeader()
        ? this.parseImportHeader()
        : [];
    const elements = [];
    const parseElement =
      effectiveSigil === "{="
        ? () => this.parseMapConstructorEntry()
        : effectiveSigil === "{|" || effectiveSigil === "{:" || effectiveSigil === "{.."
          ? () => this.parseCapturedConstructorElement()
          : isTemporal
            ? () => this.parseCommaSequenceExpression(0)
            : () => this.parseExpression(0);

    if (!isCloser(this.current.value)) {
      do {
        // Handle leading separators (empty slots)
        if (isSeparatorToken()) {
          const count = consumeSeparatorToken();
          if (effectiveSigil === "{@") {
            for (let i = 0; i < count; i++) pushHoleSlot();
          }
          continue;
        }

        const element = parseElement();
        if (
          effectiveSigil === "{=" &&
          element &&
          (element.type === "BinaryOperation" || element.type === "MapEntry") &&
          (
            element.type === "MapEntry" ||
            element.operator === "=" ||
            element.operator === ":="
          )
        ) {
          const lhs = element.type === "MapEntry" ? element.key : element.left;
          const lhsType = lhs?.type;
          const isIdentifierSugar =
            lhsType === "UserIdentifier" || lhsType === "SystemIdentifier";
          const isParenthesizedExpr = lhsType === "Grouping";
          const isDestructureRename =
            lhsType === "PropertyAccess" ||
            (lhsType === "Array" && Array.isArray(lhs?.elements) && lhs.elements.length === 1);
          if (!isIdentifierSugar && !isParenthesizedExpr && !isDestructureRename) {
            this.error("Map key expressions must be parenthesized in literals: use {= (expr)=value }");
          }
        }
        elements.push(element);

        // Check for separator
        if (isSeparatorToken()) {
          const count = consumeSeparatorToken();
          if (effectiveSigil === "{@") {
            if (isCloser(this.current.value)) {
              for (let i = 0; i < count; i++) pushHoleSlot();
            } else {
              for (let i = 1; i < count; i++) pushHoleSlot();
            }
          }
          // Allow trailing separator before closer
          if (isCloser(this.current.value)) {
            break;
          }
        } else if (isCloser(this.current.value)) {
          break;
        } else if (this.current.type === "End") {
          this.error(`Expected closing ${primaryCloser} for ${nodeType}`);
        } else {
          // Also accept the other separator type for flexibility
          const altSep = isTemporal ? "," : ";";
          if (this.current.value === altSep) {
            this.advance();
            if (isCloser(this.current.value)) break;
          } else {
            break;
          }
        }
      } while (!isCloser(this.current.value) && this.current.type !== "End");
    }

    if (!isCloser(this.current.value)) {
      this.error(`Expected closing ${primaryCloser} for ${nodeType}`);
    }
    this.advance(); // consume closer
    return this.createNode(nodeType, {
      sigil: sigil,
      ...(containerName && !options.destructureAlias ? { name: containerName } : {}),
      ...(isTensorShapeSigil && options.destructureAlias
        ? { tensorShape: containerName.split("x").map((part) => Number(part)) }
        : {}),
      ...(effectiveSigil === "{@" && options.loopMax !== undefined ? { maxIterations: options.loopMax } : {}),
      ...(effectiveSigil === "{@" && options.loopUnlimited ? { unlimited: true } : {}),
      ...(header ? { header } : {}),
      ...(imports.length > 0 ? { imports: imports } : {}),
      elements: elements,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  parseSystemSpecLiteral() {
    const startToken = this.current;
    const header = {
      inputs: [...(startToken.specInputs || [])],
      outputs: [...(startToken.specOutputs || [])],
      outputsDeclared: startToken.specOutputsDeclared === true,
    };

    this.validateSystemSpecHeader(header);
    this.advance(); // consume "{#"

    const imports = this.startsImportHeader() ? this.parseImportHeader() : [];
    const statements = [];

    if (this.current.value !== "}") {
      do {
        if (this.current.value === ";") {
          this.advance();
          continue;
        }

        const expression = this.parseExpression(0);
        statements.push(this.parseSystemSpecStatement(expression));

        if (this.current.value === ";") {
          this.advance();
          if (this.current.value === "}") break;
        } else if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "}") break;
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

    const finalized = this.finalizeSystemSpecStatements(header, statements);
    return this.createNode("SystemSpecLiteral", {
      sigil: "{#",
      ...(imports.length > 0 ? { imports } : {}),
      inputs: header.inputs,
      outputs: finalized.outputs,
      outputsDeclared: header.outputsDeclared,
      statements: finalized.statements,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  validateSystemSpecHeader(header) {
    const checkDuplicates = (names, label) => {
      const seen = new Set();
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

  parseSystemSpecStatement(expression) {
    if (!expression || expression.type !== "BinaryOperation" || expression.operator !== "=") {
      this.error("System spec bodies only support symbolic assignments of the form name = expr");
    }

    const target = expression.left;
    if (target.type !== "UserIdentifier" && target.type !== "SystemIdentifier") {
      this.error("System spec assignment targets must be bare identifiers");
    }

    return this.createNode("SpecAssign", {
      target: target.name,
      expr: expression.right,
      pos: expression.pos ?? target.pos,
      original: expression.original,
    });
  }

  finalizeSystemSpecStatements(header, statements) {
    const assigned = new Set();
    const inferredOutputs = [];
    const declaredOutputs = new Set(header.outputs);

    for (const statement of statements) {
      const target = statement.target;
      if (assigned.has(target)) {
        this.error(`System spec output '${target}' is assigned more than once`);
      }
      if (header.outputsDeclared && !declaredOutputs.has(target)) {
        this.error(`System spec assignment target '${target}' is not a declared output`);
      }
      assigned.add(target);
      if (!header.outputsDeclared) {
        inferredOutputs.push(target);
      }
    }

    if (header.outputsDeclared) {
      for (const output of header.outputs) {
        if (!assigned.has(output)) {
          this.error(`System spec declared output '${output}' is never assigned`);
        }
      }
    }

    return {
      outputs: header.outputsDeclared ? header.outputs : inferredOutputs,
      statements,
    };
  }

  parseBreakBlock() {
    const startToken = this.current;
    this.advance(); // consume '{!'

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
    } else if (this.current.type === "OuterIdentifier" && this.peek().value === "!") {
      targetType = "loop";
      const targetName = this.current.value.toLowerCase();
      this.advance();
      this.advance(); // consume trailing '!' after the target name
      const value = this.parseExpression(0);

      if (this.current.value !== "}") {
        this.error("Expected closing } for break block");
      }
      this.advance();

      return this.createNode("BreakBlock", {
        targetType,
        targetName,
        value,
        pos: startToken.pos,
        original: startToken.original,
      });
    }

    let targetName = null;
    if (this.current.type === "Identifier" && this.peek().value === "!") {
      targetName = this.current.value.toLowerCase();
      this.advance();
      this.advance(); // consume trailing '!' after the target name
    }

    const value = this.parseExpression(0);

    if (this.current.value !== "}") {
      this.error("Expected closing } for break block");
    }
    this.advance();

    return this.createNode("BreakBlock", {
      ...(targetType ? { targetType } : {}),
      ...(targetName ? { targetName } : {}),
      value,
      pos: startToken.pos,
      original: startToken.original,
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
        this.error(
          `Tensor literal shape ${shape.join("x")} has size 0 and must not contain elements`,
        );
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
      ...(header ? { header } : {}),
      elements,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  parseTensorRowArrayPattern(shape) {
    const [rows, cols] = shape;
    const elements = [];
    for (let row = 0; row < rows; row++) {
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
    for (let axis = shape.length - 1; axis >= 2; axis--) {
      levels.push({
        size: shape[axis],
        separatorCount: axis,
        label: `axis ${axis + 1}`,
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
      for (let i = 0; i < level.size; i++) {
        values.push(this.parseExpression(0));
        if (i < level.size - 1) {
          if (this.current.value !== ",") {
            this.error(
              `Tensor literal shape ${shape.join("x")} expects ${level.size} columns per row`,
            );
          }
          this.advance();
        }
      }
      return values;
    }

    const groups = [];
    for (let i = 0; i < level.size; i++) {
      groups.push(this.parseTensorDisplayLevel(levels, levelIndex + 1, shape));
      if (i < level.size - 1) {
        const consumed = this.consumeSemicolonSequence();
        if (consumed !== level.separatorCount) {
          const sepText = ";".repeat(level.separatorCount);
          this.error(
            `Tensor literal shape ${shape.join("x")} expects '${sepText}' between ${level.label}s`,
          );
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

      for (let i = 1; i <= shape[axis]; i++) {
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

    if (
      specs.length === 1 &&
      specs[0].type !== "SliceSpec" &&
      specs[0].type !== "FullSlice"
    ) {
      return this.createNode("PropertyAccess", {
        object: left,
        property: specs[0],
        pos: left.pos,
        original: left.original + operator.original,
      });
    }

    return this.createNode("BracketIndex", {
      object: left,
      specs,
      pos: left.pos,
      original: left.original + operator.original,
    });
  }

  parseBracketSpec() {
    const token = this.current;
    if (token.value === "::") {
      this.advance();
      return this.createNode("FullSlice", {
        pos: token.pos,
        original: token.original,
      });
    }

    const expr = this.parseExpression(0);
    if (expr && expr.type === "BinaryOperation" && expr.operator === ":") {
      return this.createNode("SliceSpec", {
        start: expr.left,
        end: expr.right,
        pos: expr.pos,
        original: expr.original,
      });
    }

    return expr;
  }

  startsImportHeader() {
    return this.current.value === "<" || this.current.value === "<>";
  }

  normalizeImportIdentifierName(name) {
    let firstLetter = null;
    for (let i = 0; i < name.length; i++) {
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

    for (let i = startIndex; i < this.tokens.length; i++) {
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

    const seenLocals = new Set();
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
      const explicitSource = rawExplicitSource
        ? this.normalizeImportIdentifierName(rawExplicitSource)
        : undefined;
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
    this.advance(); // consume '<'

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
      original: startToken.original,
    });
  }

  parseScriptImportExpression(startToken) {
    const pathToken = this.current;
    this.advance();

    const pathNode = this.createNode("String", {
      value: pathToken.value,
      kind: pathToken.kind,
      original: pathToken.original,
    });

    const capabilityModifiers =
      this.current.value === "/"
        ? this.parseCapabilityModifierList()
        : [];

    const inputs =
      this.current.value !== ">" && this.current.value !== ";"
        ? this.parseScriptBindingSpecs({ allowOuterSource: true })
        : [];

    let outputs = [];
    if (this.current.value === ";") {
      this.advance();
      outputs =
        this.current.value !== ">"
          ? this.parseScriptBindingSpecs({ allowOuterSource: false })
          : [];
    }

    if (this.current.value !== ">") {
      this.error("Expected closing > for script import expression");
    }
    this.advance();

    return this.createNode("ScriptImportExpression", {
      path: pathNode,
      ...(capabilityModifiers.length > 0 ? { capabilityModifiers } : {}),
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(outputs.length > 0 ? { outputs } : {}),
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  parseCapabilityModifierList() {
    this.advance(); // consume opening '/'

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
    const seenTargets = new Set();
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
      ...(sourceScope !== "current" ? { sourceScope } : {}),
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
      const name = this.current.value;
      this.advance();
      return { name, scope: "ancestor" };
    }

    if (this.current.type !== "Identifier") {
      this.error("Expected binding source name");
    }

    const name = this.current.value;
    this.advance();
    return { name, scope: "current" };
  }

  // Parse mutation syntax: obj{= +a=3, -.b, +c} or obj{! +a=3, -.b}
  parseMutation(target) {
    const sigil = this.current.value; // "{=" or "{!"
    const mutate = sigil === "{!"; // true = in-place, false = new copy
    const startToken = this.current;
    this.advance(); // consume '{=' or '{!'

    const operations = [];

    if (this.current.value !== "}") {
      do {
        // Each operation starts with + (add/merge) or - (remove)
        const op = { action: null, key: null, value: null };

        if (this.current.value === "+") {
          op.action = "add";
          this.advance(); // consume '+'
        } else if (this.current.value === "-") {
          op.action = "remove";
          this.advance(); // consume '-'
          // Remove expects .key syntax: -.b
          if (this.current.value === ".") {
            this.advance(); // consume '.'
          }
        } else {
          // Default to add
          op.action = "add";
        }

        // Parse key (identifier)
        if (this.current.type === "Identifier") {
          op.key = this.current.value;
          this.advance();
        } else {
          this.error("Expected property name in mutation");
        }

        // Check for = value
        if (op.action === "add" && (this.current.value === "=" || this.current.value === ":=")) {
          this.advance(); // consume '=' or ':='
          op.value = this.parseExpression(PRECEDENCE.CONDITION + 1);
        }

        operations.push(op);

        if (this.current.value === ",") {
          this.advance();
          if (this.current.value === "}") break;
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
    this.advance(); // consume '}'

    return this.createNode("Mutation", {
      target: target,
      mutate: mutate,
      operations: operations,
      pos: startToken.pos,
      original: startToken.original,
    });
  }

  parseUnaryOperator() {
    const operator = this.current;
    this.advance();
    const operand = this.parseExpression(PRECEDENCE.UNARY);

    return this.createNode("UnaryOperation", {
      operator: operator.value,
      operand: operand,
      pos: operator.pos,
      original: operator.original,
    });
  }

  // Parse derivatives (postfix quotes)
  parseDerivative(left) {
    const quotes = [];
    let originalText = "";

    // Collect consecutive quotes
    while (this.current.value === "'") {
      quotes.push(this.current);
      originalText += this.current.original;
      this.advance();
    }

    // Check for bracket notation for variables: f'[x,y]
    let variables = null;
    if (this.current.value === "[") {
      this.advance(); // consume '['
      variables = this.parseVariableList();
      if (this.current.value !== "]") {
        this.error("Expected closing bracket after variable list");
      }
      originalText += this.current.original;
      this.advance(); // consume ']'
    }

    // Check for evaluation/operation parentheses
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
      variables: variables,
      evaluation: evaluation,
      operations: operations,
      pos: left.pos,
      original: left.original + originalText,
    });
  }

  // Parse integrals (leading quotes)
  parseIntegral() {
    const quotes = [];
    let originalText = "";

    // Collect consecutive leading quotes
    while (this.current.value === "'") {
      quotes.push(this.current);
      originalText += this.current.original;
      this.advance();
    }

    // Parse the base function/identifier only
    let func = null;
    if (this.current.type === "Identifier") {
      if (this.current.kind === "System") {
        const systemInfo = this.systemLookup(this.current.value);
        func = this.createNode("SystemIdentifier", {
          name: this.current.value,
          systemInfo: systemInfo,
          original: this.current.original,
        });
      } else {
        func = this.createNode("UserIdentifier", {
          name: this.current.value,
          original: this.current.original,
        });
      }
      this.advance();
    } else {
      this.error("Expected function name after integral operator");
    }

    // Check for bracket notation for variables: 'f[x,y]
    let variables = null;
    if (this.current.value === "[") {
      this.advance(); // consume '['
      variables = this.parseVariableList();
      if (this.current.value !== "]") {
        this.error("Expected closing bracket after variable list");
      }
      originalText += this.current.original;
      this.advance(); // consume ']'
    }

    // Check for evaluation/operation parentheses
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
      variables: variables,
      evaluation: evaluation,
      operations: operations,
      metadata: { integrationConstant: "c", defaultValue: 0 },
      pos: quotes[0].pos,
      original: originalText + func.original,
    });
  }

  // Parse variable lists in brackets: [x, y, z]
  parseVariableList() {
    const variables = [];

    if (this.current.value !== "]") {
      do {
        if (this.current.type === "Identifier") {
          variables.push({
            name: this.current.value,
            original: this.current.original,
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

  // Parse parentheses in calculus context to distinguish evaluation vs operations
  parseCalculusParentheses() {
    const startToken = this.current;
    this.advance(); // consume '('

    let isEvaluation = true;
    const content = [];
    let originalText = startToken.original;

    while (this.current.value !== ")" && this.current.type !== "End") {
      const expr = this.parseExpression(0);
      content.push(expr);

      // Check if this contains operations (quotes) indicating it's an operation sequence
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
    this.advance(); // consume ')'

    return {
      isEvaluation: isEvaluation,
      content: content,
      original: originalText,
    };
  }

  // Helper to check if expression contains calculus operations
  containsCalculusOperations(expr) {
    if (!expr || typeof expr !== "object") return false;

    // Check for calculus node types directly
    if (expr.type === "Derivative" || expr.type === "Integral") {
      return true;
    }

    // Check for quote symbols in identifiers (like x' or 'x)
    if (expr.type === "UserIdentifier" && expr.name) {
      return expr.name.includes("'");
    }

    // Recursively check child nodes
    if (expr.left && this.containsCalculusOperations(expr.left)) return true;
    if (expr.right && this.containsCalculusOperations(expr.right)) return true;
    if (expr.function && this.containsCalculusOperations(expr.function))
      return true;
    if (expr.elements) {
      for (const element of expr.elements) {
        if (this.containsCalculusOperations(element)) return true;
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
    this.advance(); // consume ')'

    return args;
  }

  parseFunctionParameters() {
    const params = {
      positional: [],
      keyword: [],
      conditionals: [],
      metadata: {},
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

      // Check for condition after parameter
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
      defaultValue: null,
    };

    // Parse parameter name
    if (this.current.type === "Identifier" && this.current.kind === "User") {
      param.name = this.current.value;
      this.advance();
    } else {
      this.error("Expected parameter name");
    }

    // Check for hole-default value: x ?= defaultExpr
    if (this.current.value === "?=") {
      this.advance();
      param.holeDefault = this.parseExpression(PRECEDENCE.CONDITION + 1);
    }

    return param;
  }

  parseFunctionCallArgs() {
    const args = {
      positional: [],
      keyword: {},
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
        // Parse keyword argument
        if (
          this.current.type === "Identifier" &&
          this.current.kind === "User"
        ) {
          const keyName = this.current.value;
          const keyPos = this.current.pos;
          const keyOriginal = this.current.original;
          this.advance();

          if (this.current.value === ":=") {
            this.advance();
            const value = this.parseExpression(PRECEDENCE.ASSIGNMENT + 1);
            args.keyword[keyName] = value;
          } else {
            // Shorthand: n := n (identifier is both key and value)
            args.keyword[keyName] = this.createNode("UserIdentifier", {
              name: keyName,
              pos: keyPos,
              original: keyOriginal,
            });
          }
        } else {
          this.error("Expected identifier for keyword argument");
        }
      } else {
        // Parse positional argument — check for empty slot (hole)
        if (this.current.value === "," || this.current.value === ")") {
          args.positional.push(this.createNode("Hole", { original: "" }));
        } else {
          args.positional.push(this.parseExpression(0));
        }
      }

      if (this.current.value === ",") {
        this.advance();
        // Trailing hole: comma immediately followed by ')'
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
      metadata: {},
    };

    // Handle new function call argument structure
    if (args.positional && args.keyword) {
      // Convert positional arguments
      for (const arg of args.positional) {
        const result = this.parseParameterFromArg(arg, false);
        params.positional.push(result.param);
        if (result.condition) {
          params.conditionals.push(result.condition);
        }
      }

      // Convert keyword arguments to keyword parameters
      for (const [key, value] of Object.entries(args.keyword)) {
        const param = {
          name: key,
          defaultValue: null,
        };

        // Handle keyword argument values which can be expressions with conditions
        if (value.type === "BinaryOperation" && value.operator === "?") {
          // Direct condition: n -> (2 ? condition)
          param.defaultValue = value.left;
          params.conditionals.push(value.right);
        } else {
          // Simple value
          param.defaultValue = value;
        }

        params.keyword.push(param);
      }
    } else if (Array.isArray(args)) {
      // Handle legacy array format
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
    return t1?.value === "/" &&
      t2?.type === "Identifier" &&
      t3?.value === "/" &&
      ["->", "=>", "^=>"].includes(t4?.value);
  }

  parseFunctionVariantHeader() {
    if (this.current.value !== "/") {
      return null;
    }

    this.advance(); // consume opening /
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
        ...(variantName ? { variantName } : {}),
        mode: operator === "^=>" ? "prepend" : "append",
        body,
        pos: left.pos,
        original: left.original,
      });
    }

    if (namedSig) {
      return this.createNode("FunctionDefinition", {
        name: namedSig.funcName,
        parameters: namedSig.parameters,
        prep,
        prepStrict,
        ...(variantName ? { variantName } : {}),
        body,
        pos: left.pos,
        original: left.original,
      });
    }

    const lambdaParameters = this.extractLambdaParameters(left);
    if (lambdaParameters) {
      return this.createNode("FunctionLambda", {
        parameters: lambdaParameters,
        prep,
        prepStrict,
        ...(variantName ? { variantName } : {}),
        body,
        pos: left.pos,
        original: left.original,
      });
    }

    return null;
  }

  extractLambdaParameters(left) {
    if (
      left.type === "Grouping" &&
      left.expression &&
      left.expression.type === "ParameterList"
    ) {
      return left.expression.parameters;
    }

    if (left.type === "Grouping" && left.expression) {
      const parameters = {
        positional: [],
        keyword: [],
        conditionals: [],
        metadata: {},
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
        metadata: {},
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
        metadata: {},
      };
    }

    return null;
  }

  parseEmbeddedLanguage(token) {
    const content = token.value;

    // If starts with colon or no colon found, treat as RiX-String
    if (content.startsWith(":") || content.indexOf(":") === -1) {
      const body = content.startsWith(":") ? content.slice(1) : content;
      return this.createNode("EmbeddedLanguage", {
        language: "RiX-String",
        context: null,
        body: body,
        original: token.original,
      });
    }

    // First, try to find a proper language header with parentheses
    const parenStart = content.indexOf("(");
    let colonIndex = -1;
    let header = "";
    let body = "";

    if (parenStart !== -1) {
      // Look for balanced parentheses and then find colon after them
      let parenCount = 0;
      let parenEnd = -1;

      for (let i = parenStart; i < content.length; i++) {
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

      // If we found balanced parentheses, look for colon after them
      if (parenEnd !== -1) {
        const afterParens = content.slice(parenEnd + 1);
        const colonAfterParens = afterParens.indexOf(":");
        if (colonAfterParens !== -1) {
          colonIndex = parenEnd + 1 + colonAfterParens;
        }
      }
    }

    // If no parentheses or no colon after parentheses, find first colon
    if (colonIndex === -1) {
      colonIndex = content.indexOf(":");
    }

    header = content.slice(0, colonIndex).trim();
    body = content.slice(colonIndex + 1);

    // Parse the header to extract language and optional context
    let language = header;
    let context = null;

    // Check if header has parentheses for context
    const headerParenStart = header.indexOf("(");
    const headerParenEnd = header.lastIndexOf(")");

    // Check for unmatched closing parenthesis
    if (headerParenEnd !== -1 && headerParenStart === -1) {
      this.error("Unmatched closing parenthesis in embedded language header");
    }

    if (headerParenStart !== -1) {
      let parenCount = 0;
      let parenEnd = -1;

      // Find the matching closing parenthesis
      for (let i = headerParenStart; i < header.length; i++) {
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

      // Validate parentheses structure
      if (parenEnd === -1) {
        this.error("Unmatched opening parenthesis in embedded language header");
      }

      if (parenEnd !== header.length - 1) {
        this.error(
          "Invalid embedded language header format. Expected: LANGUAGE(CONTEXT):BODY",
        );
      }

      // Check for multiple outer parenthetical groups
      const afterCloseParen = header.slice(parenEnd + 1);
      if (afterCloseParen.includes("(")) {
        this.error(
          "Multiple parenthetical groups not allowed in embedded language header",
        );
      }

      language = header.slice(0, headerParenStart).trim();
      context = header.slice(headerParenStart + 1, parenEnd).trim();
    }

    return this.createNode("EmbeddedLanguage", {
      language: language || null,
      context: context,
      body: body,
      original: token.original,
    });
  }

  parseParameterFromArg(arg, inKeywordSection) {
    const result = {
      param: {
        name: null,
        defaultValue: null,
      },
      condition: null,
    };

    if (arg.type === "Spread") {
      result.param.isRest = true;
      const inner = arg.expression;
      if (
        inner.type === "UserIdentifier" ||
        (inner.type === "Identifier" && inner.kind === "User")
      ) {
        result.param.name = inner.name || inner.value;
      } else {
        this.error("Rest parameter must be an identifier");
      }
    } else if (arg.type === "BinaryOperation" && arg.operator === "?=") {
      // Hole-default: x ?= 2 — used only when arg is omitted or explicitly a hole
      result.param.name = arg.left.name || arg.left.value;
      result.param.holeDefault = arg.right;
    } else if (arg.type === "BinaryOperation" && arg.operator === "?") {
      // Parameter with condition: x ? condition
      result.param.name = arg.left.name || arg.left.value;
      result.condition = arg.right;
    } else if (
      arg.type === "UserIdentifier" ||
      (arg.type === "Identifier" && arg.kind === "User")
    ) {
      // Simple parameter
      result.param.name = arg.name || arg.value;
    }

    return result;
  }

  parseStatement() {
    if (this.current.type === "End") {
      return null;
    }

    // Handle comments as standalone nodes
    if (this.current.type === "String" && this.current.kind === "comment") {
      const commentToken = this.current;
      this.advance();
      return this.createNode("Comment", {
        value: commentToken.value,
        kind: commentToken.kind,
        original: commentToken.original,
        pos: commentToken.pos,
      });
    }

    const expr = this.parseExpression(0);

    // Check for semicolon
    if (this.current.value === ";") {
      this.advance();
      return this.createNode("Statement", {
        expression: expr,
        pos: expr.pos,
        original: expr.original,
      });
    }

    return expr;
  }

  // Drain any buffered comments into the statements array
  drainComments(statements) {
    while (this.skippedComments.length > 0) {
      const commentToken = this.skippedComments.shift();
      statements.push(
        this.createNode("Comment", {
          value: commentToken.value,
          kind: commentToken.kind,
          original: commentToken.original,
          pos: commentToken.pos,
        }),
      );
    }
  }

  // Parse the entire program (array of statements)
  parse() {
    const statements = [];

    // Drain any comments collected during constructor's initial advance()
    this.drainComments(statements);

    while (this.current.type !== "End") {
      // Collect standalone comments (shouldn't normally be reached since advance skips them,
      // but kept for safety)
      if (this.current.type === "String" && this.current.kind === "comment") {
        const commentToken = this.current;
        this.advance();
        statements.push(
          this.createNode("Comment", {
            value: commentToken.value,
            kind: commentToken.kind,
            original: commentToken.original,
            pos: commentToken.pos,
          }),
        );
        this.drainComments(statements);
        continue;
      }

      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
      // Drain any comments that were skipped during expression parsing
      this.drainComments(statements);
    }

    return statements;
  }

  // Parse function calls - now works on any expression, not just identifiers
  parseCall(target) {
    // Certain expression types followed by ( are implicit multiplication:
    // - Lowercase letter-based user identifiers: f(x) = f * (x)
    // - Numbers: 3(x+1) = 3 * (x+1)
    // - Groupings: (a+b)(c) = (a+b) * (c)
    // - Binary operations: (x+1)(x+2) already covered by Grouping
    // Everything else (System identifiers, SystemFunctionRef, Call, PropertyAccess, etc.) → function call
    if (
      (target.type === "UserIdentifier" && /^[\p{L}]/u.test(target.name)) ||
      target.type === "Number" ||
      (target.type === "Grouping" && !this.isCallableNode(target))
    ) {
      const grouping = this.parseGrouping();
      return this.createNode("ImplicitMultiplication", {
        left: target,
        right: grouping,
        pos: [target.pos[0], target.pos[0], grouping.pos[2]],
        original: target.original + grouping.original,
      });
    }

    this.advance(); // consume '('
    const args = this.parseFunctionCallArgs();
    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in function call");
    }
    this.advance(); // consume ')'

    // SystemFunctionRef calls produce SystemCall nodes
    if (target.type === "SystemFunctionRef") {
      return this.createNode("SystemCall", {
        name: target.name,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)",
      });
    }

    // SystemAccess (.Name) calls produce SystemCall nodes
    if (target.type === "SystemAccess") {
      return this.createNode("SystemCall", {
        name: target.property,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)",
        viaSystemContext: true,
      });
    }

    if (target.type === "DotAccess") {
      return this.createNode("MethodCall", {
        object: target.object,
        method: target.property,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)",
      });
    }

    // SystemIdentifier and UserIdentifier (operator symbols) produce FunctionCall
    if (target.type === "SystemIdentifier" || target.type === "UserIdentifier") {
      return this.createNode("FunctionCall", {
        function: target,
        arguments: args,
        pos: target.pos,
        original: target.original + "(...)",
      });
    }

    // Everything else (expressions, etc.)
    return this.createNode("Call", {
      target: target,
      arguments: args,
      pos: target.pos,
      original: target.original + "(...)",
    });
  }

  // Parse @ postfix operator (AT metadata access)
  parseAt(target) {
    this.advance(); // consume '@'
    if (this.current.value !== "(") {
      this.error("Expected opening parenthesis after @ operator");
    }
    this.advance(); // consume '('

    const arg = this.parseExpression(0);

    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in @ operator");
    }
    this.advance(); // consume ')'

    return this.createNode("At", {
      target: target,
      arg: arg,
      pos: target.pos,
      original: target.original + "@(" + (arg.original || "") + ")",
    });
  }

  // Parse ? postfix operator (ASK metadata access)
  parseAsk(target) {
    this.advance(); // consume '?'
    if (this.current.value !== "(") {
      this.error("Expected opening parenthesis after ? operator");
    }
    this.advance(); // consume '('

    const arg = this.parseExpression(0);

    if (this.current.value !== ")") {
      this.error("Expected closing parenthesis in ? operator");
    }
    this.advance(); // consume ')'

    return this.createNode("Ask", {
      target: target,
      arg: arg,
      pos: target.pos,
      original: target.original + "?(" + (arg.original || "") + ")",
    });
  }

  // Parse ~[ postfix operator (scientific unit)
  parseScientificUnit(target) {
    const startToken = this.current;
    this.advance(); // consume '~['

    // Collect all tokens until we find the closing ]
    let unitContent = "";
    let unitOriginal = "";

    while (this.current.type !== "End") {
      if (this.current.value === "[") {
        this.error("Nested '[' not allowed inside scientific unit ~[...]");
      } else if (this.current.value === "]") {
        break;
      }

      // Preserve exact content including spaces
      unitContent += this.current.original;
      unitOriginal += this.current.original;
      this.advance();
    }

    if (this.current.value !== "]") {
      this.error("Expected closing bracket ] for scientific unit");
    }
    this.advance(); // consume ']'

    return this.createNode("ScientificUnit", {
      target: target,
      unit: unitContent.trim(),
      pos: target.pos,
      original: target.original + startToken.original + unitOriginal + "]",
    });
  }

  // Parse ~{ postfix operator (mathematical unit)
  parseMathematicalUnit(target) {
    const startToken = this.current;
    this.advance(); // consume '~{'

    // Collect all tokens until we find the closing }
    let unitContent = "";
    let unitOriginal = "";

    while (this.current.type !== "End") {
      if (this.current.value === "{") {
        this.error("Nested '{' not allowed inside mathematical unit ~{...}");
      } else if (this.current.value === "}") {
        break;
      }

      // Preserve exact content including spaces
      unitContent += this.current.original;
      unitOriginal += this.current.original;
      this.advance();
    }

    if (this.current.value !== "}") {
      this.error("Expected closing brace } for mathematical unit");
    }
    this.advance(); // consume '}'

    return this.createNode("MathematicalUnit", {
      target: target,
      unit: unitContent.trim(),
      pos: target.pos,
      original: target.original + startToken.original + unitOriginal + "}",
    });
  }
}

// Main parse function
export function parse(input, systemLookup) {
  let tokens;
  let source = "";
  if (typeof input === "string") {
    source = input;
    tokens = tokenize(input);
  } else {
    tokens = input;
  }
  const parser = new Parser(tokens, systemLookup, source);
  return parser.parse();
}
