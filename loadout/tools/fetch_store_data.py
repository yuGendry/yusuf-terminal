#!/usr/bin/env python3
"""Import real pictures, player ratings and review excerpts for the Loadout catalog.

Sources (public pages and endpoints, no API keys):
  Steam              store search, app details (header image), review summary and excerpts
  Apple App Store    iTunes Search API (icon, average rating, count) and customer-review RSS
  Google Play        public app pages, rating parsed from the page's structured data (best effort)
  PlayStation Store  public product pages, star rating parsed from page data (best effort)
  Wikipedia          page images, used as the picture when no store image is found

Writes:
  loadout/data/store.json   ratings, review excerpts and sprite positions, read by build.py
  loadout/img/games.jpg     sprite sheet of 16:9 game pictures
  loadout/img/icons.jpg     sprite sheet of square app icons

Usage:
  pip install pillow
  python3 loadout/tools/fetch_store_data.py            # everything (uses a cache in loadout/.cache)
  python3 loadout/tools/fetch_store_data.py --refresh  # ignore the cache and fetch fresh data
  python3 loadout/tools/fetch_store_data.py --only stardew-valley,spotify
  python3 loadout/tools/build.py                       # rebuild loadout/index.html

Store matches can be pinned in loadout/src/store-overrides.json when a search picks the wrong title.
"""
import argparse
import hashlib
import html
import io
import json
import os
import re
import ssl
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
CACHE = os.path.join(ROOT, ".cache")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
WIKI_UA = "LoadoutCatalog/1.0 (https://github.com/yuGendry/yusuf-terminal; catalog picture import)"
REFRESH = False
QUIET = False


def log(*a):
    if not QUIET:
        print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- catalog

def slug(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower().replace("&", " and ")
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s))


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", slug(s).replace("-", " ")).strip()


def rows(path):
    with open(path, encoding="utf-8") as f:
        return [l.strip() for l in f if l.strip() and not l.startswith("#")]


def load_catalog():
    items = []
    for l in rows(os.path.join(SRC, "games.txt")):
        f = l.split("|")
        items.append({"id": slug(f[0]), "kind": "game", "name": f[0], "maker": f[1], "codes": f[4]})
    for l in rows(os.path.join(SRC, "apps.txt")):
        f = l.split("|")
        items.append({"id": slug(f[0]), "kind": "app", "name": f[0], "maker": f[1], "codes": f[3]})
    return items


# ---------------------------------------------------------------- http

_ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
_last = {}
_host_locks = {}
_locks_guard = threading.Lock()


def _pace(host):
    gap = 1.2 if host.endswith("wikipedia.org") else 0.3
    with _locks_guard:
        lock = _host_locks.setdefault(host, threading.Lock())
    with lock:
        wait = gap - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()


def http(url, binary=False, headers=None, tries=3):
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, "http", key + (".bin" if binary else ".txt"))
    if not REFRESH and os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        return data if binary else data.decode("utf-8", "replace")
    host = urllib.parse.urlparse(url).netloc
    ua = WIKI_UA if host.endswith("wikipedia.org") or host.endswith("wikimedia.org") else UA
    h = {"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"}
    if "steampowered.com" in host or "steamcommunity.com" in host:
        h["Cookie"] = "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1; Steam_Language=english"
    h.update(headers or {})
    tries = max(tries, 5) if host.endswith("wikipedia.org") else tries
    for n in range(tries):
        try:
            _pace(host)
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25, context=_ctx) as r:
                data = r.read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
            if e.code == 429:
                time.sleep(6 * (n + 1))
                continue
            if n == tries - 1:
                log(f"  ! {e.code} {url}")
                return None
        except Exception as e:  # network errors, timeouts
            if n == tries - 1:
                log(f"  ! {type(e).__name__} {url}: {e}")
                return None
        time.sleep(1.5 * (n + 1))
    return None


def http_json(url):
    t = http(url)
    if not t:
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


# ---------------------------------------------------------------- text helpers

def clean(text, limit=320):
    text = re.sub(r"\[/?[a-z0-9*]+(=[^\]]*)?\]", " ", text or "", flags=re.I)  # Steam BBCode
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:-") + "…"
    return text


# Review quotes with strong language are skipped so the page stays family friendly.
PROFANITY = re.compile(r"\b(f+u+c+k\w*|sh[i1]t\w*|bitch\w*|cunt\w*|n[i1]gg\w*|fag\w*|retard\w*|whore\w*|dick\w*|"
                       r"piss\w*|bastard\w*|slut\w*|rape\w*|kys)\b", re.I)


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0
    if a == b:
        return 1
    if b.startswith(a) or a.startswith(b):
        return 0.9
    wa, wb = set(a.split()), set(b.split())
    return len(wa & wb) / max(len(wa), 1) * 0.8


def maker_match(maker, seller, name=None):
    m = [w for w in norm(maker).split() if len(w) > 2 and w not in ("inc", "llc", "ltd", "the", "and", "games", "studio", "studios")]
    s = norm(seller)
    if name and norm(name) and re.search(r"\b" + re.escape(norm(name)) + r"\b", s):
        return True  # e.g. TikTok Ltd., Waze Inc.
    return not m or any(w in s for w in m)


def name_then_subtitle(name, title):
    """True for store titles like "TikTok - Videos, Shop & LIVE" or "Twitch: Live Streaming"."""
    if not title.lower().startswith(name.lower()):
        return False
    rest = title[len(name):].lstrip()
    return rest == "" or rest[:1] in (":", "-", "\u2013", "\u2014", "|", "\u30fb")


# ---------------------------------------------------------------- Steam

def steam(item, pinned):
    appid = pinned
    title = None
    if appid is None:
        q = urllib.parse.quote(item["name"])
        res = http_json(f"https://store.steampowered.com/api/storesearch/?term={q}&cc=us&l=en") or {}
        best = None
        for r in res.get("items", [])[:10]:
            sc = similar(item["name"], r.get("name", ""))
            if sc >= 0.9 and (best is None or sc > best[0]):
                best = (sc, r["id"], r["name"])
        if not best:
            return None, None
        appid, title = best[1], best[2]
    details = (http_json(f"https://store.steampowered.com/api/appdetails?appids={appid}&cc=us&l=en") or {}).get(str(appid), {})
    data = details.get("data") or {}
    title = data.get("name") or title
    header = data.get("header_image") or f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg"
    page = http(f"https://store.steampowered.com/app/{appid}/?cc=us&l=english") or ""
    tips = [html.unescape(t) for t in re.findall(r'data-tooltip-html="([^"]*user reviews[^"]*)"', page)]
    summary = None
    for want in ("for this game", "in your language"):
        for t in tips:
            m = re.search(r"(\d+)% of the ([\d,]+) user reviews " + want, t)
            if m:
                summary = (int(m.group(1)), int(m.group(2).replace(",", "")), "all" if want == "for this game" else "english")
                break
        if summary:
            break
    out = None
    if summary:
        pct, total, scope = summary
        desc = re.search(r'game_review_summary[^"]*" itemprop="description">([^<]+)', page)
        reviews = []
        cpage = http(f"https://steamcommunity.com/app/{appid}/reviews/?browsefilter=toprated&l=english&filterLanguage=english") or ""
        for m in re.finditer(r'<div class="title">(Recommended|Not Recommended)</div>(.*?)<div class="apphub_CardTextContent">\s*'
                             r'<div class="date_posted">Posted:\s*([^<]+)</div>(.*?)</div>', cpage, re.S):
            t = clean(m.group(4))
            if len(t) < 60 or PROFANITY.search(t):
                continue
            hrs = re.search(r"([\d,.]+) hrs on record", m.group(2))
            date = ""
            for fmt in ("%B %d, %Y", "%d %B, %Y", "%B %d", "%d %B"):
                try:
                    d = datetime.strptime(m.group(3).strip(), fmt)
                    date = (d.replace(year=datetime.now().year) if "%Y" not in fmt else d).date().isoformat()
                    break
                except ValueError:
                    pass
            reviews.append({"text": t, "up": m.group(1) == "Recommended", "date": date,
                            "hours": round(float(hrs.group(1).replace(",", ""))) if hrs else 0})
            if len(reviews) == 3:
                break
        out = {"appid": appid, "title": title, "desc": desc.group(1).strip() if desc else "", "positive": round(total * pct / 100),
               "total": total, "pct": pct, "scope": scope, "url": f"https://store.steampowered.com/app/{appid}/#app_reviews_hash", "reviews": reviews}
    return out, header


# ---------------------------------------------------------------- App Store

def appstore(item, pinned):
    mac_only = item["kind"] == "app" and "i" not in item["codes"]
    if pinned:
        res = http_json(f"https://itunes.apple.com/lookup?id={pinned}&country=us") or {}
        cands = res.get("results", [])
    else:
        q = urllib.parse.quote(item["name"])
        entity = "macSoftware" if mac_only else "software"
        res = http_json(f"https://itunes.apple.com/search?term={q}&entity={entity}&country=us&limit=8") or {}
        cands = []
        for r in res.get("results", []):
            sc = similar(item["name"], r.get("trackName", ""))
            mk = maker_match(item["maker"], r.get("sellerName", "") + " " + r.get("artistName", ""), item["name"])
            if sc == 1 or name_then_subtitle(item["name"], r.get("trackName", "")) or (sc >= 0.9 and (mk or item["kind"] == "game")) or (sc >= 0.5 and mk):
                cands.append((sc + (0.2 if mk else 0), r))
        cands = [r for _, r in sorted(cands, key=lambda x: -x[0])]
    if not cands:
        return None, None
    r = cands[0]
    icon = r.get("artworkUrl512") or r.get("artworkUrl100")
    count = int(r.get("userRatingCount") or 0)
    if not count:
        return None, icon
    tid = r["trackId"]
    reviews = []
    feed = (http_json(f"https://itunes.apple.com/us/rss/customerreviews/page=1/id={tid}/sortby=mosthelpful/json") or {}).get("feed", {})
    entries = feed.get("entry", [])
    if isinstance(entries, dict):
        entries = [entries]
    for e in entries:
        if "im:rating" not in e:
            continue
        t = clean(e.get("content", {}).get("label", ""))
        if len(t) < 60 or PROFANITY.search(t + " " + e.get("title", {}).get("label", "")):
            continue
        reviews.append({"title": clean(e.get("title", {}).get("label", ""), 80), "text": t,
                        "stars": int(e["im:rating"]["label"]), "date": (e.get("updated", {}).get("label", "") or "")[:10]})
        if len(reviews) == 3:
            break
    return {"id": tid, "title": r.get("trackName"), "rating": round(float(r.get("averageUserRating") or 0), 2), "count": count,
            "url": r.get("trackViewUrl", "").split("?")[0], "reviews": reviews}, icon


# ---------------------------------------------------------------- Google Play (best effort)

def gplay(item, pinned):
    pkg = pinned
    if not pkg:
        q = urllib.parse.quote(item["name"])
        page = http(f"https://play.google.com/store/search?q={q}&c=apps&hl=en_US&gl=US")
        if not page:
            return None
        ids = re.findall(r"/store/apps/details\?id=([A-Za-z0-9._]+)", page)
        seen = []
        for i in ids:
            if i not in seen:
                seen.append(i)
        cands = seen[:3]
    else:
        cands = [pkg]
    for p in cands:
        page = http(f"https://play.google.com/store/apps/details?id={p}&hl=en_US&gl=US")
        if not page:
            continue
        for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S):
            try:
                d = json.loads(block)
            except ValueError:
                continue
            if not isinstance(d, dict) or "aggregateRating" not in d:
                continue
            name = d.get("name", "")
            author = (d.get("author") or {}).get("name", "")
            if not pinned and not (similar(item["name"], name) >= 0.9 and (maker_match(item["maker"], author, item["name"])
                                                                          or similar(item["name"], name) == 1 or name_then_subtitle(item["name"], name))):
                continue
            ag = d["aggregateRating"]
            try:
                rating, count = float(ag.get("ratingValue")), int(ag.get("ratingCount"))
            except (TypeError, ValueError):
                continue
            icon = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            return {"id": p, "title": name, "rating": round(rating, 2), "count": count,
                    "url": f"https://play.google.com/store/apps/details?id={p}", "reviews": [],
                    "_icon": html.unescape(icon.group(1)) if icon else None}
    return None


# ---------------------------------------------------------------- PlayStation Store (best effort)

def psn(item, pinned):
    if pinned:
        urls = [f"https://store.playstation.com/en-us/product/{pinned}"]
    else:
        base = slug(item["name"].replace("'", "").replace("\u2019", ""))
        page = http(f"https://www.playstation.com/en-us/games/{base}/")
        if not page:
            return None
        found = []
        for m in re.findall(r"store\.playstation\.com/en-us/(product/[A-Z0-9_-]+|concept/\d+)", page):
            if m not in found:
                found.append(m)
        found.sort(key=lambda m: (not m.endswith("0000000000000000"), not m.startswith("product")))
        urls = ["https://store.playstation.com/en-us/" + m for m in found[:2]]
    for u in urls:
        page = http(u)
        if not page:
            continue
        title = html.unescape((re.search(r"<title>(.*?)</title>", page, re.S) or [None, ""])[1]).split("|")[0].strip()
        m = re.search(r'"averageRating"\s*:\s*([\d.]+)', page)
        c = re.search(r'"totalRatingsCount"\s*:\s*(\d+)', page)
        if not (m and c):
            continue
        rating, count = float(m.group(1)), int(c.group(1))
        if count and 0 < rating <= 5:
            return {"title": title, "rating": round(rating, 2), "count": count, "url": u, "reviews": []}
    return None


# ---------------------------------------------------------------- Wikipedia picture fallback

def wiki_image(item, pinned):
    titles = [pinned] if pinned else ([item["name"] + " (video game)", item["name"]] if item["kind"] == "game"
                                       else [item["name"] + " (software)", item["name"] + " (app)", item["name"]])
    for t in titles:
        d = http_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_")))
        if not d or d.get("type") == "disambiguation":
            continue
        img = (d.get("originalimage") or d.get("thumbnail") or {}).get("source")
        if img:
            if "thumbnail" in d and d["thumbnail"].get("source") and (d.get("originalimage") or {}).get("width", 0) > 900:
                img = d["thumbnail"]["source"]
            return img
    return None


# ---------------------------------------------------------------- images

def open_image(url):
    from PIL import Image
    data = http(url, binary=True)
    if not data:
        return None
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return None
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    return im.convert("RGB")


def wide_tile(im, w=320, h=180):
    from PIL import Image, ImageFilter, ImageEnhance
    ratio = im.width / im.height
    if 1.6 <= ratio <= 2.3:  # already landscape: crop to 16:9
        tw = min(im.width, int(im.height * 16 / 9))
        th = min(im.height, int(tw * 9 / 16))
        left, top = (im.width - tw) // 2, (im.height - th) // 2
        return im.crop((left, top, left + tw, top + th)).resize((w, h), Image.LANCZOS)
    scale = max(w / im.width, h / im.height)  # box art: blurred fill + contained picture
    bg = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1), Image.LANCZOS)
    bg = bg.crop(((bg.width - w) // 2, (bg.height - h) // 2, (bg.width - w) // 2 + w, (bg.height - h) // 2 + h))
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(14))).enhance(0.55)
    s2 = min(w / im.width, h / im.height)
    fg = im.resize((max(1, int(im.width * s2)), max(1, int(im.height * s2))), Image.LANCZOS)
    bg.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2))
    return bg


def square_tile(im, s=128):
    from PIL import Image
    side = min(im.width, im.height)
    if abs(im.width - im.height) > side * 0.08:  # logos: pad to a square on white
        side = max(im.width, im.height)
        canvas = Image.new("RGB", (side, side), (255, 255, 255))
        canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = canvas
    else:
        im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width - side) // 2 + side, (im.height - side) // 2 + side))
    return im.resize((s, s), Image.LANCZOS)


def sprite(tiles, tw, th, cols, path):
    from PIL import Image
    n = len(tiles)
    if not n:
        return None
    cols = min(cols, n)
    rws = (n + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rws * th), (30, 34, 50))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * tw, (k // cols) * th))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path, "JPEG", quality=80, optimize=True, progressive=True)
    return cols, rws


# ---------------------------------------------------------------- main

def main():
    global REFRESH, QUIET
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated ids to fetch (others keep their previous data)")
    ap.add_argument("--refresh", action="store_true", help="ignore cached responses")
    ap.add_argument("--no-scrape", action="store_true", help="skip Google Play and PlayStation Store page parsing")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    REFRESH, QUIET = args.refresh, args.quiet
    try:
        import PIL  # noqa: F401
    except ImportError:
        sys.exit("Pillow is required: pip install pillow")

    items = load_catalog()
    ov_path = os.path.join(SRC, "store-overrides.json")
    overrides = json.load(open(ov_path, encoding="utf-8")) if os.path.exists(ov_path) else {}
    out_path = os.path.join(ROOT, "data", "store.json")
    prev = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {}
    only = set(args.only.split(",")) if args.only else None

    results, wide_imgs, square_imgs = {}, {}, {}
    todo = [it for it in items if not only or it["id"] in only]

    def work(it):
        iid, ov = it["id"], overrides.get(it["id"], {})
        src, wide_url, square_url = {}, None, None
        codes = it["codes"]
        try:
            if it["kind"] == "game":
                if ov.get("steam") is not False and ("P" in codes or "A" in codes):
                    st, header = steam(it, ov.get("steam"))
                    if st:
                        src["steam"] = st
                    wide_url = header
                if ov.get("appstore") is not False and "M" in codes:
                    ap, icon = appstore(it, ov.get("appstore"))
                    if ap:
                        src["appstore"] = ap
                    square_url = icon
                if not args.no_scrape and ov.get("psn") is not False and ("5" in codes or "4" in codes):
                    ps = psn(it, ov.get("psn"))
                    if ps:
                        src["psn"] = ps
                if not args.no_scrape and ov.get("gplay") is not False and "M" in codes:
                    gp = gplay(it, ov.get("gplay"))
                    if gp:
                        src["gplay"] = gp
                if not wide_url:
                    wide_url = wiki_image(it, ov.get("wiki"))
            else:
                if ov.get("appstore") is not False and ("i" in codes or "m" in codes):
                    ap, icon = appstore(it, ov.get("appstore"))
                    if ap:
                        src["appstore"] = ap
                    square_url = icon
                if not args.no_scrape and ov.get("gplay") is not False and "a" in codes:
                    gp = gplay(it, ov.get("gplay"))
                    if gp:
                        src["gplay"] = gp
                        square_url = square_url or gp.get("_icon")
                if not square_url:
                    square_url = wiki_image(it, ov.get("wiki"))
        except Exception as e:  # keep going; one bad page should not stop the import
            log(f"  ! {it['name']}: {type(e).__name__}: {e}")
        wide = square = None
        if wide_url:
            im = open_image(wide_url)
            if im:
                wide = wide_tile(im)
        if wide is None and square_url:
            im = open_image(square_url)
            if im:
                square = square_tile(im)
        return iid, src, wide, square

    from concurrent.futures import ThreadPoolExecutor, as_completed
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for fut in as_completed([pool.submit(work, it) for it in todo]):
            iid, src, wide, square = fut.result()
            done += 1
            for v in src.values():
                v.pop("_icon", None)
            results[iid] = {"sources": src}
            if wide is not None:
                wide_imgs[iid] = wide
            elif square is not None:
                square_imgs[iid] = square
            found = ", ".join(k + " " + str(v.get("pct", v.get("rating"))) for k, v in src.items()) or "no ratings"
            pic = "wide" if wide is not None else "square" if square is not None else "none"
            log(f"[{done}/{len(todo)}] {iid}: {found}; picture: {pic}")

    # Keep earlier data for items not fetched this run (with --only), including their pictures.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    if only and prev.get("items"):
        for iid, v in prev["items"].items():
            if iid not in results:
                results[iid] = {"sources": v.get("sources", {})}
                art = v.get("art")
                sheet = art and prev.get("sprites", {}).get(art["sheet"])
                if sheet:
                    from PIL import Image
                    sp = Image.open(os.path.join(ROOT, sheet["file"].split("?")[0]))
                    tw, th = sp.width // sheet["cols"], sp.height // sheet["rows"]
                    c, r = art["idx"] % sheet["cols"], art["idx"] // sheet["cols"]
                    tile = sp.crop((c * tw, r * th, c * tw + tw, r * th + th)).convert("RGB")
                    (wide_imgs if art["sheet"] == "games" else square_imgs)[iid] = tile

    sprites = {}
    order_w, order_s = sorted(wide_imgs), sorted(square_imgs)
    g = sprite([wide_imgs[k] for k in order_w], 320, 180, 12, os.path.join(ROOT, "img", "games.jpg"))
    if g:
        sprites["games"] = {"file": f"img/games.jpg?v={stamp}", "cols": g[0], "rows": g[1], "shape": "wide"}
    s = sprite([square_imgs[k] for k in order_s], 128, 128, 16, os.path.join(ROOT, "img", "icons.jpg"))
    if s:
        sprites["icons"] = {"file": f"img/icons.jpg?v={stamp}", "cols": s[0], "rows": s[1], "shape": "square"}
    for k, iid in enumerate(order_w):
        results[iid]["art"] = {"sheet": "games", "idx": k}
    for k, iid in enumerate(order_s):
        results[iid]["art"] = {"sheet": "icons", "idx": k}

    store = {"fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sprites": sprites,
             "items": {k: v for k, v in results.items() if v.get("sources") or v.get("art")}}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, separators=(",", ":"))
    rated = sum(1 for v in store["items"].values() if v.get("sources"))
    log(f"\nSaved {out_path}: {rated} titles with real ratings, {len(order_w)} game pictures, {len(order_s)} icons.")


if __name__ == "__main__":
    main()
