-- Render output captured by check-examples.js beneath executable RiX fences.
-- The evaluator runs before Quarto; this filter only changes presentation.

local results_path = os.getenv("RIX_DOC_EXAMPLES_RESULTS")
local results = {}

local function load_results()
  if not results_path then return end
  local file = io.open(results_path, "r")
  if not file then return end
  local ok, decoded = pcall(pandoc.json.decode, file:read("*a"))
  file:close()
  if not ok or not decoded or not decoded.results then return end
  for _, result in ipairs(decoded.results) do
    if result.id then
      results["id:" .. tostring(result.id)] = result
    end
    results["source:" .. tostring(result.source or "")] = result
  end
end

local function is_rix(el)
  for _, class in ipairs(el.classes or {}) do
    if class == "rix" then return true end
  end
  return false
end

local function attr(el, name)
  if not el.attributes then return nil end
  return el.attributes[name]
end

local function html_escape(value)
  return tostring(value or "")
    :gsub("&", "&amp;")
    :gsub("<", "&lt;")
    :gsub(">", "&gt;")
    :gsub('"', "&quot;")
    :gsub("'", "&#39;")
end

function CodeBlock(el)
  if not is_rix(el) then return nil end
  local exec = attr(el, "exec")
  local parse_only = attr(el, "parse")
  if parse_only == "true" or (exec and exec ~= "true" and exec ~= "yes" and exec ~= "1") then
    return nil
  end

  local result = nil
  local id = attr(el, "id") or el.identifier
  if id then result = results["id:" .. tostring(id)] end
  if not result then result = results["source:" .. tostring(el.text)] end
  if not result then return nil end

  if result.visibleSource then el.text = result.visibleSource end
  local blocks = {el}

  if FORMAT and FORMAT:match("html") and result.setupSource and result.setupSource ~= "" then
    local details = pandoc.RawBlock(
      "html",
      '<details class="rix-setup"><summary>Show setup code</summary><pre><code>'
        .. html_escape(result.setupSource)
        .. "</code></pre></details>"
    )
    table.insert(blocks, details)
  end

  if not result.output or result.output == "" then return blocks end

  local output = pandoc.CodeBlock(
    result.output,
    pandoc.Attr("", {"text", "rix-output"}, {})
  )
  local label = pandoc.Para({pandoc.Strong({pandoc.Str("Output")})})
  table.insert(blocks, pandoc.Div({label, output}, pandoc.Attr("", {"rix-example-output"}, {})))
  return blocks
end

load_results()
