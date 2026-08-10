# RiX Language Support for VS Code

This desktop-first extension provides `.rix` highlighting, snippets, static
diagnostics, completion, hover, document symbols, definition/references,
rename, quick fixes, folding, semantic tokens, readable/compact formatting,
inline-check discovery, and isolated or session execution.

The published extension bundles a version-matched Node-compatible language
server and execution worker. Bun is only a repository build/test tool and is
not required by extension users. Execution is disabled in untrusted
workspaces. The initial worker uses the checked-in `standard` capability
allowlist and loads no plugins or external renderers.

