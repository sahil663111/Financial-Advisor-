import ast, sys
from pathlib import Path

files = [
    "app/business/payroll/__init__.py",
    "app/business/payroll/schemas.py",
    "app/business/payroll/employee_service.py",
    "app/business/payroll/payroll_service.py",
    "app/business/payroll/router.py",
    "app/business/router.py",
]
errors = []
for f in files:
    p = Path(f)
    if not p.exists():
        errors.append(f"MISSING: {f}")
        continue
    try:
        ast.parse(p.read_text(encoding="utf-8"))
        print(f"  OK  {f}")
    except SyntaxError as e:
        errors.append(f"SYNTAX in {f}: L{e.lineno}: {e.msg}")

if errors:
    print("\nERRORS:")
    for e in errors: print(f"  {e}")
    sys.exit(1)
else:
    print(f"\n✅ All {len(files)} backend Phase 5 files pass")
