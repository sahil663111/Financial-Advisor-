"""Full project review — backend + frontend inventory"""
from pathlib import Path
import re

BASE = Path(r"d:\Financial Advisor\Financial-Advisor-main")

# ── Backend modules ───────────────────────────────────────────────────────────
print("=" * 60)
print("BACKEND MODULES")
print("=" * 60)
biz = BASE / "backend/app/business"
total_routes = 0
for module in sorted(biz.iterdir()):
    if not module.is_dir(): continue
    py_files = [f for f in module.iterdir()
                if f.suffix == ".py" and f.name != "__init__.py"]
    if not py_files: continue
    router = module / "router.py"
    routes = 0
    if router.exists():
        content = router.read_text(encoding="utf-8")
        routes = len(re.findall(r'@router\.(get|post|put|delete|patch)', content))
        total_routes += routes
    print(f"  {module.name:22} {len(py_files)} files  {routes} endpoints")

print(f"\n  Total API endpoints: {total_routes}")

# ── Frontend pages ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("FRONTEND BUSINESS PAGES")
print("=" * 60)
fe_biz = BASE / "frontend/src/app/business"
pages = sorted(fe_biz.rglob("page.tsx"))
for p in pages:
    rel   = str(p.relative_to(fe_biz)).replace("\\page.tsx","").replace("/page.tsx","")
    lines = len(p.read_text(encoding="utf-8").splitlines())
    print(f"  {rel:40} {lines} lines")
print(f"\n  Total: {len(pages)} pages")

# ── Nav link → page check ─────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("NAV LINKS → PAGE EXISTS?")
print("=" * 60)
layout = (fe_biz / "layout.tsx").read_text(encoding="utf-8")
hrefs  = re.findall(r"href: '(/business/[^']+)'", layout)
missing = []
for href in sorted(set(hrefs)):
    folder = href.replace("/business/", "").replace("/", "\\")
    page   = fe_biz / folder / "page.tsx"
    status = "OK" if page.exists() else "MISSING"
    if status == "MISSING": missing.append(href)
    print(f"  {status:8} {href}")
if not missing:
    print("\n  All nav links have pages ✅")
else:
    print(f"\n  Missing pages: {missing}")

# ── API.ts exports ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("API.TS EXPORTS")
print("=" * 60)
api_ts = (BASE / "frontend/src/lib/api.ts").read_text(encoding="utf-8")
exports = re.findall(r'export const (\w+)', api_ts)
lines   = len(api_ts.splitlines())
print(f"  {len(exports)} exports, {lines} lines")
for e in exports:
    print(f"  - {e}")

# ── Seed scripts ──────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("SEED SCRIPTS")
print("=" * 60)
scripts = BASE / "backend/scripts"
for f in sorted(scripts.glob("*.py")):
    lines = len(f.read_text(encoding="utf-8").splitlines())
    print(f"  {f.name:40} {lines} lines")

# ── Requirements ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("REQUIREMENTS.TXT")
print("=" * 60)
req = (BASE / "backend/requirements.txt").read_text(encoding="utf-8").strip().splitlines()
print(f"  {len(req)} packages")
for r in req:
    if r: print(f"  {r}")
