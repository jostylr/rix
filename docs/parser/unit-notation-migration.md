# Unit Notation Migration Guide

## Overview

The RiX language parser has been updated to use a new syntax for unit notation that provides clearer distinction between scientific units and mathematical units. This change improves code readability and parser consistency.

## What Changed

### Old Syntax
Previously, all units were denoted using tildes:
- `3.2~m~` - meters (scientific unit)
- `2~i~` - imaginary unit (mathematical unit)
- `5~kg/s~` - kilograms per second
- `1~sqrt2~` - algebraic extension

### New Syntax
Units are now denoted using different bracket types based on their nature:
- `3.2~[m]` - meters (scientific unit)
- `2~{i}` - imaginary unit (mathematical unit)
- `5~[kg/s]` - kilograms per second
- `1~{sqrt2}` - algebraic extension

## Key Differences

### 1. Scientific Units
Use `~[...]` for physical and SI units:
```
// Old
distance := 10~m~;
velocity := 5~m/s~;
force := 20~kg*m/s^2~;

// New
distance := 10~[m];
velocity := 5~[m/s];
force := 20~[kg*m/s^2];
```

### 2. Mathematical Units
Use `~{...}` for mathematical constructs like complex numbers and algebraic extensions:
```
// Old
z := 3 + 4~i~;
x := 2~sqrt2~;
y := 5~pi~;

// New
z := 3 + 4~{i};
x := 2~{sqrt2};
y := 5~{pi};
```

### 3. Unit Content Preservation
The content between brackets is preserved exactly as written, including spaces:
- `5~[m / s]` - the unit string is "m / s" (with spaces)
- `5~[m/s]` - the unit string is "m/s" (without spaces)

### 4. Nested Brackets
Nested brackets of the same type are not allowed and will cause a parse error:
- `x~[m[2]]` - ERROR: Nested '[' not allowed
- `x~[m{2}]` - OK: Different bracket types
- `y~{sqrt{2}` - ERROR: Nested '{' not allowed
- `y~{sqrt[2]}` - OK: Different bracket types

## Tokenization Changes

### Old Behavior
Numbers with units were tokenized as single tokens:
- `3.2~m~` → `Number("3.2~m~")`

### New Behavior
Numbers and unit operators are separate tokens:
- `3.2~[m]` → `Number("3.2")`, `Symbol("~[")`, `Identifier("m")`, `Symbol("]")`

This change allows for more flexible parsing and better error messages.

## Unit Conversions

Unit conversion syntax has changed from the double-tilde operator to using the `CONVERT` function:

```
// Old
distance := 100~m~;
distance_in_feet := distance~~ft/m~;

// New
distance := 100~[m];
distance_in_feet := CONVERT(distance, "m", "ft");
```

## Migration Steps

1. **Update Scientific Units**: Replace `~unit~` with `~[unit]` for all physical units
2. **Update Mathematical Units**: Replace `~unit~` with `~{unit}` for complex numbers and algebraic extensions
3. **Update Unit Conversions**: Replace `~~unit1/unit2~` with `CONVERT(value, "unit2", "unit1")`
4. **Test Your Code**: Run your tests to ensure the migration is complete

## Examples

### Before
```rix
// Physics calculation
mass := 5~kg~;
acceleration := 9.8~m/s^2~;
force := mass * acceleration;  // 49~kg*m/s^2~

// Complex arithmetic
z1 := 3 + 4~i~;
z2 := 1 - 2~i~;
product := z1 * z2;  // 11 - 2~i~

// Unit conversion
height_m := 1.8~m~;
height_ft := height_m~~ft/m~;
```

### After
```rix
// Physics calculation
mass := 5~[kg];
acceleration := 9.8~[m/s^2];
force := mass * acceleration;  // 49~[kg*m/s^2]

// Complex arithmetic
z1 := 3 + 4~{i};
z2 := 1 - 2~{i};
product := z1 * z2;  // 11 - 2~{i}

// Unit conversion
height_m := 1.8~[m];
height_ft := CONVERT(height_m, "m", "ft");
```

## Benefits of the New Syntax

1. **Clarity**: Visual distinction between scientific and mathematical units
2. **Flexibility**: Units are no longer tied to number tokens
3. **Extensibility**: Easier to add new unit types in the future
4. **Better Error Messages**: Parser can provide more specific error messages
5. **Consistency**: Aligns with other postfix operators in the language

## Backward Compatibility

The old `~` operator without brackets is still available as a binary operator. Code like `a ~ b` will continue to work as before.

## Questions or Issues?

If you encounter any issues during migration or have questions about the new syntax, please open an issue on the RiX language parser repository.