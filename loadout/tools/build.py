#!/usr/bin/env python3
"""Assemble Loadout from the files in loadout/src and the imported data.

Builds two versions from the same source:
  loadout/index.html   the Claude artifact demo (demo store, demo Pro, saves through the artifact)
  loadout/site/        the real website: Google and email sign-in (Firebase) and a real Pro subscription (Stripe),
                       configured by loadout/site.config.json. See loadout/SETUP.md.

Inputs:
  src/shell.html, src/app.js            page markup, styles and logic shared by both versions
  src/site-shell.html, src/site.js      sign-in dialog and account/payment logic, website only
  src/legal/                            Terms and Privacy page templates, website only
  src/games.txt, src/apps.txt           reviewed catalog
  src/advanced-*.txt                    advanced reviews
  data/store.json, data/catalog.json    imported ratings, pictures and the full platform catalog (optional)

Usage: python3 loadout/tools/build.py
"""
import glob
import html
import json
import os
import shutil
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def js(value):
    # JSON is valid JavaScript; escape "</" so text can never close the <script> tag.
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def load_json(*parts):
    path = os.path.join(ROOT, *parts)
    return json.loads(read(*parts)) if os.path.exists(path) else {}


def main():
    store, catalog = load_json("data", "store.json"), load_json("data", "catalog.json")
    data = "\n".join([
        "const GAMES_RAW = " + js(read("src", "games.txt")) + ";",
        "const APPS_RAW = " + js(read("src", "apps.txt")) + ";",
        "const ADV_GAMES_RAW = " + js(read("src", "advanced-games.txt")) + ";",
        "const ADV_APPS_RAW = " + js(read("src", "advanced-apps.txt")) + ";",
        "const STORE = " + js(store) + ";",
        "const CATALOG = " + js(catalog) + ";",
    ])
    shell, app = read("src", "shell.html").rstrip(), read("src", "app.js").strip()

    # 1. Artifact demo
    demo = shell + "\n\n<script>\n" + data + "\n\n" + app + "\n</script>\n"
    write(os.path.join(ROOT, "index.html"), demo)

    # 2. Real website
    cfg = load_json("site.config.json")
    cfg.pop("_readme", None)
    site_shell = shell.replace(
        '<button type="button" class="pro-btn" id="pro-btn" data-go="pro">Get Pro</button>',
        '<div class="acct-wrap"><button type="button" id="auth-btn" class="btn ghost small auth-btn" aria-haspopup="menu" aria-expanded="false">Sign in</button>'
        '<div class="acct-menu" id="acct-menu" role="menu" hidden></div></div>\n'
        '      <button type="button" class="pro-btn" id="pro-btn" data-go="pro">Get Pro</button>')
    assert site_shell != shell, "top bar markup changed: update the auth button injection in build.py"
    split = site_shell.index('<header class="topbar">')  # title, fonts and styles go in <head>, the page in <body>
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + site_shell[:split].rstrip() + "\n<style>body { margin: 0; } img { max-width: 100%; }</style>\n</head>\n<body>\n")
    site = (head + site_shell[split:] + "\n" + read("src", "site-shell.html").rstrip() + "\n\n<script>\n" + data
            + "\nconst SITE_CONFIG = " + js(cfg) + ";\n\n" + app + "\n\n" + read("src", "site.js").strip() + "\n</script>\n</body>\n</html>\n")
    out = os.path.join(ROOT, "site")
    write(os.path.join(out, "index.html"), site)
    fill = {"siteName": cfg.get("siteName", "Loadout"), "ownerName": cfg.get("ownerName", ""), "contactEmail": cfg.get("contactEmail", ""),
            "proPrice": cfg.get("proPrice", "$3.99"), "proInterval": cfg.get("proInterval", "month"), "date": date.today().strftime("%B %d, %Y")}
    page = read("src", "legal", "_page.html")
    for name, title in (("terms", "Terms of Service"), ("privacy", "Privacy Policy")):
        body = read("src", "legal", f"{name}.md.html")
        text = page.replace("{{body}}", body).replace("{{title}}", title)
        for k, v in fill.items():
            text = text.replace("{{" + k + "}}", html.escape(v))
        write(os.path.join(out, f"{name}.html"), text)
    os.makedirs(os.path.join(out, "img"), exist_ok=True)
    for f in glob.glob(os.path.join(ROOT, "img", "*.jpg")):
        shutil.copy2(f, os.path.join(out, "img", os.path.basename(f)))

    rated = sum(1 for v in store.get("items", {}).values() if v.get("sources"))
    total = sum(len(p["items"]) for p in catalog.get("platforms", {}).values())
    ready = not str(cfg.get("firebase", {}).get("apiKey", "YOUR_")).startswith("YOUR_")
    print(f"Built index.html ({len(demo) // 1024} KB) and site/ ({len(site) // 1024} KB, sign-in {'configured' if ready else 'not configured yet: fill in site.config.json'}): "
          f"{rated} reviewed titles with real ratings; catalog: {total} titles on {len(catalog.get('platforms', {}))} platforms")


if __name__ == "__main__":
    main()
