# String methods

Strings are immutable Unicode text values. Indexing methods count code points and use RiX's one-based indexes.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `string.Len()` | `Integer` | Count Unicode code points. |
| `string.IsEmpty()` | `1 \| null` | Test for an empty string. |
| `string.Get(index)` | `String \| null` | Read one code point; negative indexes count from the end. |
| `string.First()` | `String \| null` | Read the first character. |
| `string.Last()` | `String \| null` | Read the last character. |
| `string.Includes(text)` | `1 \| null` | Test substring membership. |
| `string.StartsWith(prefix)` | `1 \| null` | Test the prefix. |
| `string.EndsWith(suffix)` | `1 \| null` | Test the suffix. |
| `string.IndexOf(text)` | `Integer \| null` | Return the first one-based match position. |
| `string.LastIndexOf(text)` | `Integer \| null` | Return the last one-based match position. |
| `string.Slice(start?, end?)` | `String` | Copy from inclusive `start` to exclusive `end`. |
| `string.Concat(parts...)` | `String` | Append string-like values. |
| `string.Split(separator?)` | `Array` | Split at a separator, or into characters when omitted. |
| `string.Trim()` | `String` | Remove whitespace at both ends. |
| `string.TrimStart()` | `String` | Remove leading whitespace. |
| `string.TrimEnd()` | `String` | Remove trailing whitespace. |
| `string.Upper()` | `String` | Convert to uppercase. |
| `string.Lower()` | `String` | Convert to lowercase. |
| `string.Replace(search, replacement)` | `String` | Replace the first exact string match. |
| `string.ReplaceAll(search, replacement)` | `String` | Replace every exact string match. |
| `string.PadLeft(length, pad? = " ")` | `String` | Pad to a minimum width on the left. |
| `string.PadRight(length, pad? = " ")` | `String` | Pad to a minimum width on the right. |
| `string.Repeat(count)` | `String` | Repeat the text. |
| `string.Reduce((acc, char, index, string) -> next, initial?)` | `any` | Fold characters; default accumulator is `""`. |
| `string.Iterator()` | `Iterator` | Create a character cursor. |
| `string.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=string-query-transform-methods}
s := "abca";
comma := ",";
dash := "-";
s.Len() ##@ == 4;
"x".Slice(1, 1).IsEmpty() ##@ == 1;
s.Get(2) ##@ == "b";
s.First() ##@ == "a";
s.Last() ##@ == "a";
s.Includes("bc") ##@ == 1;
s.StartsWith("ab") ##@ == 1;
s.EndsWith("ca") ##@ == 1;
s.IndexOf("a") ##@ == 1;
s.LastIndexOf("a") ##@ == 4;
s.Slice(2, 4) ##@ == "bc";
"ab".Concat("cd", 5) ##@ == "abcd5";
"a,b,c".Split(comma).Join(dash) ##@ == "a-b-c";
"abc".Split().Join(dash) ##@ == "a-b-c";
"  hi  ".Trim() ##@ == "hi";
"  hi  ".TrimStart() ##@ == "hi  ";
"  hi  ".TrimEnd() ##@ == "  hi";
"abc".Upper() ##@ == "ABC";
"ABC".Lower() ##@ == "abc";
"banana".Replace("na", "x") ##@ == "baxna";
"banana".ReplaceAll("na", "x") ##@ == "baxx";
"7".PadLeft(3, "0") ##@ == "007";
"7".PadRight(3, "0") ##@ == "700";
"ha".Repeat(3) ##@ == "hahaha";
```

```{.rix exec=true id=string-reduce-iterator-methods}
"ab".Reduce((acc, char) -> acc.Concat(char.Upper())) ##@ == "AB";
it := "abc".Iterator(); it.Next() ##@ == "a"; it.Peek(1) ##@ == "b";
"abc".CheckTraits() ##@ == 1;
```

[Back to the methods overview](../methods-guide.md)
