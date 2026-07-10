/**
 * Enhanced System Loader for RiX Language
 * Three-tier architecture: Language Maintainers -> System Tinkerers -> Users
 * Browser-friendly with configurable keywords and extensible hooks
 */

// Default System Registry - Core language maintainer level
const DEFAULT_SYSTEM_REGISTRY = {
  // Mathematical functions
  SIN: {
    type: "function",
    arity: 1,
    precedence: 120,
    category: "trigonometric",
  },
  COS: {
    type: "function",
    arity: 1,
    precedence: 120,
    category: "trigonometric",
  },
  TAN: {
    type: "function",
    arity: 1,
    precedence: 120,
    category: "trigonometric",
  },
  LOG: { type: "function", arity: 1, precedence: 120, category: "logarithmic" },
  EXP: { type: "function", arity: 1, precedence: 120, category: "exponential" },
  SQRT: { type: "function", arity: 1, precedence: 120, category: "arithmetic" },
  ABS: { type: "function", arity: 1, precedence: 120, category: "arithmetic" },
  MAX: { type: "function", arity: -1, precedence: 120, category: "aggregate" },
  MIN: { type: "function", arity: -1, precedence: 120, category: "aggregate" },
  SUM: { type: "function", arity: -1, precedence: 120, category: "aggregate" },

  // Constants
  PI: { type: "constant", value: Math.PI, category: "mathematical" },
  EX: { type: "constant", value: Math.E, category: "mathematical" },
  INFINITY: { type: "constant", value: Infinity, category: "mathematical" },
  I: { type: "constant", category: "complex" },

  // Type constructors
  LIST: { type: "constructor", category: "collection" },
  SET: { type: "constructor", category: "collection" },
  MAP: { type: "constructor", category: "collection" },
  TUPLE: { type: "constructor", category: "collection" },

  // Meta functions
  TYPE: { type: "function", arity: 1, precedence: 120, category: "meta" },
  HELP: { type: "function", arity: -1, precedence: 120, category: "meta" },
  INFO: { type: "function", arity: 1, precedence: 120, category: "meta" },
};

// Browser environment detection
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

/**
 * SystemLoader class - Main entry point for three-tier system
 */
export class SystemLoader {
  constructor(options = {}) {
    this.coreRegistry = new Map(Object.entries(DEFAULT_SYSTEM_REGISTRY));
    this.systemRegistry = new Map(); // System tinkerer extensions
    this.operatorRegistry = new Map(); // Custom operators
    this.keywordRegistry = new Map(); // Configurable keywords
    this.hooks = new Map(); // Extension hooks
    this.contexts = new Map(); // Environment contexts

    // Configuration
    this.config = {
      allowUserOverrides: options.allowUserOverrides ?? false,
      strictMode: options.strictMode ?? false,
      browserIntegration: options.browserIntegration ?? isBrowser,
      moduleLoader: options.moduleLoader ?? null,
      ...options,
    };

    // Initialize default keywords
    this.initializeDefaultKeywords();

    // Set up browser integration if enabled
    if (this.config.browserIntegration) {
      this.setupBrowserIntegration();
    }
  }

  /**
   * Initialize default configurable keywords
   */
  initializeDefaultKeywords() {
    // Logical operators
    this.registerKeyword("AND", {
      type: "operator",
      precedence: 40,
      associativity: "left",
      operatorType: "infix",
      category: "logical",
    });

    this.registerKeyword("OR", {
      type: "operator",
      precedence: 30,
      associativity: "left",
      operatorType: "infix",
      category: "logical",
    });

    this.registerKeyword("NOT", {
      type: "operator",
      precedence: 110,
      operatorType: "prefix",
      category: "logical",
    });

    // Control flow keywords
    this.registerKeyword("IF", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    this.registerKeyword("ELSE", {
      type: "control",
      structure: "conditional",
      precedence: 5,
      category: "control",
    });

    this.registerKeyword("WHILE", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    this.registerKeyword("FOR", {
      type: "control",
      structure: "loop",
      precedence: 5,
      category: "control",
    });

    // Set operations
    this.registerKeyword("IN", {
      type: "operator",
      precedence: 60,
      associativity: "left",
      operatorType: "infix",
      category: "set",
    });

    this.registerKeyword("UNION", {
      type: "operator",
      precedence: 50,
      associativity: "left",
      operatorType: "infix",
      category: "set",
    });

    this.registerKeyword("INTERSECT", {
      type: "operator",
      precedence: 50,
      associativity: "left",
      operatorType: "infix",
      category: "set",
    });
  }

  /**
   * Register a system symbol (System tinkerer level)
   */
  registerSystem(name, definition) {
    if (!name || typeof name !== "string") {
      throw new Error("System symbol name must be a non-empty string");
    }

    const normalizedName = name.toUpperCase();

    // Validate definition
    const validatedDef = this.validateDefinition(definition);

    // Check for conflicts with core registry in strict mode
    if (this.config.strictMode && this.coreRegistry.has(normalizedName)) {
      throw new Error(`Cannot override core system symbol: ${normalizedName}`);
    }

    this.systemRegistry.set(normalizedName, {
      ...validatedDef,
      source: "system",
      registered: Date.now(),
    });

    // Trigger hooks
    this.triggerHook("system-registered", {
      name: normalizedName,
      definition: validatedDef,
    });

    return this;
  }

  /**
   * Register a configurable keyword
   */
  registerKeyword(name, definition) {
    const normalizedName = name.toUpperCase();
    const validatedDef = this.validateDefinition(definition);

    this.keywordRegistry.set(normalizedName, {
      ...validatedDef,
      source: "keyword",
      registered: Date.now(),
    });

    this.triggerHook("keyword-registered", {
      name: normalizedName,
      definition: validatedDef,
    });

    return this;
  }

  /**
   * Register a custom operator
   */
  registerOperator(symbol, definition) {
    if (!symbol || typeof symbol !== "string") {
      throw new Error("Operator symbol must be a non-empty string");
    }

    const validatedDef = this.validateOperatorDefinition(definition);

    this.operatorRegistry.set(symbol, {
      ...validatedDef,
      source: "operator",
      registered: Date.now(),
    });

    this.triggerHook("operator-registered", {
      symbol,
      definition: validatedDef,
    });

    return this;
  }

  /**
   * Main system lookup function for parser integration
   */
  lookup(name) {
    const normalizedName = name.toUpperCase();

    // Check keyword registry first
    if (this.keywordRegistry.has(normalizedName)) {
      const def = this.keywordRegistry.get(normalizedName);
      // Enable functional form for control keywords
      if (def.type === "control") {
        return this.enrichDefinition(
          {
            ...def,
            functionalForm: true,
            type: "function", // Can be used as both control and function
            controlType: def.type,
            arity: this.getControlArity(normalizedName, def),
          },
          normalizedName,
        );
      }
      return this.enrichDefinition(def, normalizedName);
    }

    // Check system registry
    if (this.systemRegistry.has(normalizedName)) {
      const def = this.systemRegistry.get(normalizedName);
      return this.enrichDefinition(def, normalizedName);
    }

    // Check core registry
    if (this.coreRegistry.has(normalizedName)) {
      const def = this.coreRegistry.get(normalizedName);
      return this.enrichDefinition(def, normalizedName);
    }

    // Default fallback
    return { type: "identifier", name: normalizedName, source: "unknown" };
  }

  /**
   * Validate symbol definition
   */
  validateDefinition(definition) {
    if (!definition || typeof definition !== "object") {
      throw new Error("Definition must be an object");
    }

    const { type } = definition;
    if (!type || typeof type !== "string") {
      throw new Error("Definition must have a type property");
    }

    // Type-specific validation
    switch (type) {
      case "operator":
        if (
          !definition.precedence ||
          typeof definition.precedence !== "number"
        ) {
          throw new Error("Operator definition must have numeric precedence");
        }
        break;

      case "function":
        if (
          definition.arity !== undefined &&
          typeof definition.arity !== "number"
        ) {
          throw new Error("Function arity must be a number or undefined");
        }
        break;

      case "control":
        if (!definition.structure || typeof definition.structure !== "string") {
          throw new Error("Control definition must have a structure property");
        }
        break;
    }

    return { ...definition };
  }

  /**
   * Validate operator definition
   */
  validateOperatorDefinition(definition) {
    const validated = this.validateDefinition(definition);

    if (validated.type !== "operator") {
      validated.type = "operator";
    }

    if (!validated.precedence) {
      validated.precedence = 50; // Default precedence
    }

    if (!validated.associativity) {
      validated.associativity = "left";
    }

    if (!validated.operatorType) {
      validated.operatorType = "infix";
    }

    return validated;
  }

  /**
   * Enrich definition with runtime information
   */
  enrichDefinition(definition, name) {
    return {
      ...definition,
      name,
      resolvedAt: Date.now(),
      context: this.getCurrentContext(),
    };
  }

  /**
   * Register extension hook
   */
  registerHook(eventName, callback) {
    if (!this.hooks.has(eventName)) {
      this.hooks.set(eventName, []);
    }
    this.hooks.get(eventName).push(callback);
    return this;
  }

  /**
   * Trigger extension hook
   */
  triggerHook(eventName, data) {
    if (this.hooks.has(eventName)) {
      this.hooks.get(eventName).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.warn(`Hook ${eventName} failed:`, error);
        }
      });
    }
  }

  /**
   * Set up browser integration
   */
  setupBrowserIntegration() {
    if (!isBrowser) return;

    // Create global RiX object
    if (typeof window.RiX === "undefined") {
      window.RiX = {};
    }

    // Expose system loader
    window.RiX.SystemLoader = this;

    // Add convenient methods to window.RiX
    window.RiX.registerSystem = (name, def) => this.registerSystem(name, def);
    window.RiX.registerKeyword = (name, def) => this.registerKeyword(name, def);
    window.RiX.registerOperator = (symbol, def) =>
      this.registerOperator(symbol, def);

    // Set up module loading if not provided
    if (!this.config.moduleLoader) {
      this.config.moduleLoader = this.createBrowserModuleLoader();
    }

    // Listen for RiX system definition events
    document.addEventListener("rix-system-define", (event) => {
      const { name, definition } = event.detail;
      this.registerSystem(name, definition);
    });

    document.addEventListener("rix-keyword-define", (event) => {
      const { name, definition } = event.detail;
      this.registerKeyword(name, definition);
    });
  }

  /**
   * Create browser-compatible module loader
   */
  createBrowserModuleLoader() {
    return {
      async load(moduleSpec) {
        // Support different module formats
        if (
          moduleSpec.startsWith("http://") ||
          moduleSpec.startsWith("https://")
        ) {
          // Load from URL
          const response = await fetch(moduleSpec);
          const code = await response.text();
          return this.evaluateModule(code);
        } else if (moduleSpec.startsWith("data:")) {
          // Data URL
          const code = decodeURIComponent(moduleSpec.split(",")[1]);
          return this.evaluateModule(code);
        } else {
          // Try to resolve as a DOM script tag
          const scriptTag = document.getElementById(moduleSpec);
          if (scriptTag && scriptTag.type === "text/rix-system") {
            return this.evaluateModule(scriptTag.textContent);
          }
        }

        throw new Error(`Cannot load module: ${moduleSpec}`);
      },

      evaluateModule(code) {
        // Simple evaluation - in production, you'd want a safer sandbox
        try {
          const moduleFunction = new Function(
            "SystemLoader",
            "registerSystem",
            "registerKeyword",
            "registerOperator",
            code,
          );
          return moduleFunction(
            this,
            (name, def) => this.registerSystem(name, def),
            (name, def) => this.registerKeyword(name, def),
            (symbol, def) => this.registerOperator(symbol, def),
          );
        } catch (error) {
          throw new Error(`Module evaluation failed: ${error.message}`);
        }
      },
    };
  }

  /**
   * Load system extension module
   */
  async loadModule(moduleSpec) {
    if (!this.config.moduleLoader) {
      throw new Error("No module loader configured");
    }

    try {
      const result = await this.config.moduleLoader.load(moduleSpec);
      this.triggerHook("module-loaded", { moduleSpec, result });
      return result;
    } catch (error) {
      this.triggerHook("module-load-error", { moduleSpec, error });
      throw error;
    }
  }

  /**
   * Create a new context (for scoped environments)
   */
  createContext(name, parentContext = null) {
    const context = {
      name,
      parent: parentContext,
      created: Date.now(),
      symbols: new Map(),
      operators: new Map(),
    };

    this.contexts.set(name, context);
    return context;
  }

  /**
   * Get current context (stub - would be implemented with actual context tracking)
   */
  getCurrentContext() {
    return "global"; // Simplified for now
  }

  /**
   * Determine the arity (number of arguments) for control keywords in functional form
   */
  getControlArity(name, definition) {
    switch (definition.structure) {
      case "conditional":
        // IF(condition, thenExpr, elseExpr) or IF(condition, thenExpr)
        return name === "IF" ? -1 : 1; // Variable args for IF, 1 for ELSE
      case "loop":
        // WHILE(condition, body), FOR(init, condition, increment, body)
        return name === "FOR" ? 4 : 2;
      case "loop_body":
      case "loop_terminator":
      case "block_end":
        return 1;
      default:
        return -1; // Variable arguments by default
    }
  }

  /**
   * Transform functional form calls to control structures
   * WHILE(condition, body) -> WHILE condition DO body
   */
  transformFunctionalForm(name, args, definition) {
    switch (name) {
      case "WHILE":
        if (args.length >= 2) {
          return {
            type: "ControlStructure",
            keyword: "WHILE",
            condition: args[0],
            body: args[1],
            structure: "while_loop",
            functionalOrigin: true,
          };
        }
        break;

      case "IF":
        if (args.length >= 2) {
          const result = {
            type: "ControlStructure",
            keyword: "IF",
            condition: args[0],
            thenBranch: args[1],
            structure: "conditional",
            functionalOrigin: true,
          };
          if (args.length >= 3) {
            result.elseBranch = args[2];
          }
          return result;
        }
        break;

      case "FOR":
        if (args.length >= 4) {
          return {
            type: "ControlStructure",
            keyword: "FOR",
            init: args[0],
            condition: args[1],
            increment: args[2],
            body: args[3],
            structure: "for_loop",
            functionalOrigin: true,
          };
        }
        break;
    }

    // Default: return as regular function call
    return {
      type: "FunctionCall",
      function: { type: "SystemIdentifier", name, systemInfo: definition },
      arguments: args,
      functionalForm: true,
    };
  }

  /**
   * Get all registered symbols by category
   */
  getSymbolsByCategory(category) {
    const result = [];

    // Collect from all registries
    [this.coreRegistry, this.systemRegistry, this.keywordRegistry].forEach(
      (registry) => {
        for (const [name, definition] of registry) {
          if (definition.category === category) {
            result.push({ name, ...definition });
          }
        }
      },
    );

    return result;
  }

  /**
   * Generate system lookup function for parser
   */
  createParserLookup() {
    return (name) => this.lookup(name);
  }

  /**
   * Export current configuration
   */
  exportConfig() {
    return {
      core: Array.from(this.coreRegistry.entries()),
      system: Array.from(this.systemRegistry.entries()),
      keywords: Array.from(this.keywordRegistry.entries()),
      operators: Array.from(this.operatorRegistry.entries()),
      config: { ...this.config },
    };
  }

  /**
   * Import configuration
   */
  importConfig(config) {
    if (config.system) {
      config.system.forEach(([name, def]) =>
        this.systemRegistry.set(name, def),
      );
    }

    if (config.keywords) {
      config.keywords.forEach(([name, def]) =>
        this.keywordRegistry.set(name, def),
      );
    }

    if (config.operators) {
      config.operators.forEach(([symbol, def]) =>
        this.operatorRegistry.set(symbol, def),
      );
    }

    this.triggerHook("config-imported", config);
  }
}

/**
 * Factory function for creating web page system loaders
 */
export function createWebPageSystemLoader(options = {}) {
  const loader = new SystemLoader({
    browserIntegration: true,
    allowUserOverrides: false,
    strictMode: false,
    ...options,
  });

  // Set up convenient web page integration
  if (isBrowser) {
    // Auto-load any script tags with type="text/rix-system"
    document.addEventListener("DOMContentLoaded", () => {
      const systemScripts = document.querySelectorAll(
        'script[type="text/rix-system"]',
      );
      systemScripts.forEach((script) => {
        try {
          loader.loadModule(script.id || "inline-script");
        } catch (error) {
          console.warn("Failed to load RiX system script:", error);
        }
      });
    });

    // Expose easy configuration methods
    window.RiX.defineLogicalOperators = (
      andName = "AND",
      orName = "OR",
      notName = "NOT",
    ) => {
      loader.registerKeyword(andName, {
        type: "operator",
        precedence: 40,
        associativity: "left",
        operatorType: "infix",
        category: "logical",
      });

      loader.registerKeyword(orName, {
        type: "operator",
        precedence: 30,
        associativity: "left",
        operatorType: "infix",
        category: "logical",
      });

      loader.registerKeyword(notName, {
        type: "operator",
        precedence: 110,
        operatorType: "prefix",
        category: "logical",
      });
    };

    window.RiX.defineControlFlow = () => {
      // Control keywords with functional form support
      const controlKeywords = {
        IF: { structure: "conditional", precedence: 5 },
        ELSE: { structure: "conditional", precedence: 5 },
        WHILE: { structure: "loop", precedence: 5 },
        FOR: { structure: "loop", precedence: 5 },
        DO: { structure: "loop_body", precedence: 4 },
        RETURN: { structure: "return", precedence: 5 },
        BREAK: { structure: "break", precedence: 5 },
        CONTINUE: { structure: "continue", precedence: 5 },
      };

      Object.entries(controlKeywords).forEach(([keyword, config]) => {
        loader.registerKeyword(keyword, {
          type: "control",
          structure: config.structure,
          precedence: config.precedence,
          category: "control",
          functionalForm: true,
        });
      });
    };

    // Convenience function for functional control structures
    window.RiX.enableFunctionalControls = () => {
      window.RiX.defineControlFlow();
      console.log(
        "Functional control structures enabled: WHILE(cond, body), IF(cond, then, else), etc.",
      );
    };
  }

  return loader;
}

/**
 * Utility function to create a minimal system loader for Node.js environments
 */
export function createNodeSystemLoader(options = {}) {
  return new SystemLoader({
    browserIntegration: false,
    strictMode: true,
    ...options,
  });
}

// Export default instance for immediate use
export const defaultSystemLoader = new SystemLoader();
