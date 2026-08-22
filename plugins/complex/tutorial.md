---
title: Certified complex numbers over real backends
description: Combine refinable real representations, calculate complex functions, and inspect principal-branch evidence.
theme: Numbers and numerics
status: implemented
---

## Construct one complex number

The lowercase `complex` plugin represents one complex number using two
certified singleton real components. Exact Rationals work directly:

```rix
.Plugin.Load("complex");
z := .complex.FromParts(1, 2);
.Table({=
  columns = ["value kind", "real", "imaginary", "norm squared"],
  rows = [[z.Record()[:valueKind], z.Real(), z.Imaginary(), z.NormSquared()]]
});
```

Arithmetic follows the usual Cartesian formulas and embeds real Rationals on
the real axis:

```rix
.Plugin.Load("complex");
z := .complex(1, 2);
w := .complex(3, -1);
.Table({=
  columns = ["operation", "real", "imaginary"],
  rows = [
    ["z + w", (z+w).Real(), (z+w).Imaginary()],
    ["z * w", (z*w).Real(), (z*w).Imaginary()],
    ["z / w", (z/w).Real(), (z/w).Imaginary()],
    ["z + 4", (z+4).Real(), (z+4).Imaginary()]
  ]
});
```

## Mix certified real representations

Components need not use the same backend. Here an isolating algebraic real and
a continued-fraction real retain their own refinement procedures:

```rix
.Plugin.Load("complex");
.Plugin.Load("algebraic-real");
.Plugin.Load("continued-fraction");
mixed := .complex.FromParts(.ar.Sqrt2(), .cf.Sqrt2());
box := mixed.Refine({= absoluteWidth=1/1000, maxWork=400 });
.Table({=
  columns = ["status", "real interval", "imaginary interval", "calls"],
  rows = [[
    box[:status],
    box[:realInterval],
    box[:imaginaryInterval],
    box[:work][:calls]
  ]]
});
```

Both returned intervals enclose the same mathematical `sqrt(2)`. A finite
`.ball(midpoint,radius)` is intentionally rejected here because it denotes a
set, not one refinable real.

## Refine arithmetic and entire functions

Elementary complex functions build recipes from the certified real Numerics
algorithms. Refining the result gives another containing rectangle:

```rix
.Plugin.Load("complex");
z := .complex(1, 1/2);
values := [
  ["exp", .complex.Exp(z)],
  ["sin", .complex.Sin(z)],
  ["cos", .complex.Cos(z)]
];
.Table({=
  columns = ["function", "real enclosure", "imaginary enclosure", "status"],
  rows = values.Map((row) -> {;
    result := row[2].Refine({= absoluteWidth=1/1000, maxWork=800 });
    [row[1], result[:realInterval], result[:imaginaryInterval], result[:status]];
  })
});
```

## Inspect zero separation before division

Origin containment is a certification question. Exact inputs decide
immediately, while a coarse refinable input can remain unknown until given a
tighter request:

```rix
.Plugin.Load("complex");
zero := .complex(0, 0).ZeroStatus();
away := .complex(1, 1/10).ZeroStatus();
.Table({=
  columns = ["input", "status", "certified"],
  rows = [
    ["0", zero[:status], zero[:certified]],
    ["1+i/10", away[:status], away[:certified]]
  ]
});
```

Exact division by zero is rejected. A quotient over refinable components keeps
zero separation as a deferred certified obligation in its component recipes.

## Keep branch outcomes visible

The convenience functions use the principal convention
`-pi < argument <= pi`. The result forms additionally preserve cut and origin
classification:

```rix
.Plugin.Load("complex");
ordinary := .complex.LogResult(.complex(1, 1));
onCut := .complex.LogResult(.complex(-2, 0));
atOrigin := .complex.LogResult(.complex(0, 0));
sqrtCut := .complex.SqrtResult(.complex(-2, 0));
.Table({=
  columns = ["case", "status", "has value", "diagnostic"],
  rows = [
    ["log(1+i)", ordinary[:status], ordinary[:value] != _, ordinary[:diagnostic]],
    ["log(-2)", onCut[:status], onCut[:value] != _, onCut[:diagnostic]],
    ["log(0)", atOrigin[:status], atOrigin[:value] != _, atOrigin[:diagnostic]],
    ["sqrt(-2)", sqrtCut[:status], sqrtCut[:value] != _, sqrtCut[:diagnostic]]
  ]
});
```

The boundary values are conventional principal values, but their
`:branchBoundary` status warns analytic transformations that no open
neighborhood avoids the cut.

## Enclose images of complex sets

Regions denote sets rather than hidden singleton values. A centered disc uses
the direct validated analytic kernel, while a rectangle uses outward interval
ranges:

```rix
.Plugin.Load("complex");
disc := .complex.Disc(.complex(0,0),1/10);
box := .complex.Rectangle((-1):1,(-1):1);
discImage := disc.Image(:exp,{= absoluteWidth=1/10000,maxWork=1000 });
boxImage := box.Image(:sin,{= absoluteWidth=1/10000,maxWork=1000 });
.Table({=
  columns=["input","output geometry","algorithm","outward"],
  rows=[
    ["disc",discImage[:geometry],discImage[:evidence][:algorithm],discImage[:evidence][:outward]],
    ["rectangle",boxImage[:geometry],boxImage[:evidence][:algorithm],boxImage[:evidence][:outward]]
  ]
});
```

## Subdivide uncertainty without hiding it

```rix
.Plugin.Load("complex");
region := .complex.Rectangle((-1):1,(-1):1);
analysis := region.AnalyzeBoundary(:logBranch,{=
  maxDepth=4,maxCells=40,absoluteWidth=1/1000,maxWork=500
});
{: analysis[:status],analysis[:resolved].Len(),analysis[:hits].Len(),
   analysis[:unresolved].Len(),analysis[:work] };
```

Any cells left by the work/depth budget remain in `unresolved`, still carrying
their certified outward rectangles.
