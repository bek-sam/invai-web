"""Collects t("key", "Default") pairs from src into a flat JSON map (for src/i18n/en.ts)."""
import json, re, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent / "src"
pat = re.compile(r'\bt\(\s*"([A-Za-z0-9_.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"', re.S)
keys = {}
conflicts = []
for f in [p for p in sorted(root.rglob("*.tsx")) + sorted(root.rglob("*.ts")) if "i18n" not in p.parts]:
    for k, v in pat.findall(f.read_text()):
        v = bytes(v, "utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8")
        if k in keys and keys[k] != v:
            conflicts.append((k, keys[k], v))
        keys.setdefault(k, v)
bare = set()
for f in list(root.rglob("*.tsx")) + list(root.rglob("*.ts")):
    for k in re.findall(r'\bt\(\s*"([A-Za-z0-9_.]+)"\s*\)', f.read_text()):
        bare.add(k)
json.dump({"keys": keys, "bare": sorted(bare), "conflicts": conflicts}, sys.stdout, ensure_ascii=False, indent=1)
