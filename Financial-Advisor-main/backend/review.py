import ast, sys, os
from pathlib import Path

base = Path(r"d:\Financial Advisor\Financial-Advisor-main\backend\app\business")
files = [f for f in base.rglob("*.py")
         if f.name != "__init__.py" and "__pycache__" not in str(f)]

errors = []
ok = 0
for f in sorted(files):
    try:
        ast.parse(f.read_text(encoding="utf-8"))
        ok += 1
    except SyntaxError as e:
        errors.append(f"SYNTAX {f.relative_to(base)}: L{e.lineno}: {e.msg}")

print(f"Backend business: {ok}/{len(files)} files pass syntax check")
for e in errors:
    print(f"  ERROR: {e}")
if not errors:
    print("  All pass")
