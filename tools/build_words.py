#!/usr/bin/env python3
"""Fusionne data/*.json en words.js (dédoublonné). Usage : python3 tools/build_words.py"""
import json, glob, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
FIELDS = ["w", "fr", "def", "syn", "lvl", "pos", "ex", "src"]

def clean(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

entries = {}
order = sorted(glob.glob(os.path.join(ROOT, "data", "*.json")), key=lambda f: (not f.endswith("scifi.json"), f))
dropped = collections.Counter()
for f in order:
    for e in json.load(open(f, encoding="utf-8")):
        e = {k: clean(e.get(k)) for k in FIELDS}
        if not e["w"] or not e["fr"] or not e["def"] or e["lvl"] not in LEVELS:
            dropped["invalid"] += 1
            continue
        key = e["w"].lower()
        old = entries.get(key)
        if old is None:
            entries[key] = e
        elif old["src"]:            # le vocabulaire SF garde sa fiche
            dropped["dup"] += 1
        elif e["src"] or LEVELS.index(e["lvl"]) < LEVELS.index(old["lvl"]):
            entries[key] = e        # on garde le niveau le plus bas (premier niveau où le mot apparaît)
            dropped["dup"] += 1
        else:
            dropped["dup"] += 1

rows = sorted(entries.values(), key=lambda e: (LEVELS.index(e["lvl"]), e["w"].lower()))
with open(os.path.join(ROOT, "words.js"), "w", encoding="utf-8") as out:
    out.write("// Généré par tools/build_words.py à partir de data/*.json — ne pas éditer à la main.\n")
    out.write("// Format : [mot, traduction, sens, synonymes, niveau, nature, exemple, source]\n")
    out.write("const WORDS = [\n")
    for e in rows:
        arr = [e[k] for k in ["w", "fr", "def", "syn", "lvl", "pos", "ex", "src"]]
        while arr and arr[-1] == "":
            arr.pop()
        out.write(json.dumps(arr, ensure_ascii=False) + ",\n")
    out.write("];\n")

c = collections.Counter(e["lvl"] for e in rows)
print("total", len(rows), dict(sorted(c.items())), "dropped", dict(dropped))
