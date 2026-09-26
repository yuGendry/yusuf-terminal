#!/usr/bin/env python3
"""Assemble loadout/index.html from the files in loadout/src and the imported store data.

  src/shell.html          page markup and styles
  src/games.txt           game catalog and short reviews
  src/apps.txt            app catalog and short reviews
  src/advanced-games.txt  advanced game reviews
  src/advanced-apps.txt   advanced app reviews
  src/app.js              page logic
  data/store.json         real ratings, review excerpts and picture positions (optional, from fetch_store_data.py)

Usage: python3 loadout/tools/build.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def js(value):
    # JSON is valid JavaScript; escape "</" so text can never close the <script> tag.
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def main():
    store_path = os.path.join(ROOT, "data", "store.json")
    store = json.loads(read("data", "store.json")) if os.path.exists(store_path) else {}
    data = "\n".join([
        "const GAMES_RAW = " + js(read("src", "games.txt")) + ";",
        "const APPS_RAW = " + js(read("src", "apps.txt")) + ";",
        "const ADV_GAMES_RAW = " + js(read("src", "advanced-games.txt")) + ";",
        "const ADV_APPS_RAW = " + js(read("src", "advanced-apps.txt")) + ";",
        "const STORE = " + js(store) + ";",
    ])
    page = read("src", "shell.html").rstrip() + "\n\n<script>\n" + data + "\n\n" + read("src", "app.js").strip() + "\n</script>\n"
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    rated = sum(1 for v in store.get("items", {}).values() if v.get("sources"))
    print(f"Built index.html ({len(page) // 1024} KB): {rated} titles with real ratings, sprites: {', '.join(store.get('sprites', {})) or 'none'}")


if __name__ == "__main__":
    main()
