#!/usr/bin/env python3
"""Import the big Loadout catalog: 1,000+ top titles per platform, with real ratings and pictures.

Platforms and sources (public store endpoints and pages, no API keys):
  iphone       Apple App Store top charts in every category (iTunes RSS) + iTunes Lookup API for ratings
  ipad         Apple App Store iPad top charts in every category + iTunes Lookup API
  mac          Mac App Store top charts in every category + iTunes Lookup API
  android      Google Play category pages + app pages (rating and count from the page's structured data)
  steam        Steam top sellers (store search) with the review summary shown on each result
  playstation  PlayStation Store top sellers (store API) + each product page's star rating
  xbox         Xbox store browse pages, which include the average rating and rating count
  switch       Wikipedia lists of Nintendo Switch and Switch 2 games (Nintendo does not publish player ratings)

Writes loadout/data/catalog.json (read by build.py) and one picture sprite per platform in loadout/img/cat-*.jpg.
Each platform is checkpointed in loadout/.cache/catalog/<platform>.json, so a rerun only redoes what is missing.

Usage:
  pip install pillow
  python3 loadout/tools/fetch_app_catalog.py                    # all platforms
  python3 loadout/tools/fetch_app_catalog.py --only steam,xbox  # some platforms
  python3 loadout/tools/fetch_app_catalog.py --refresh          # ignore checkpoints (weekly refresh)
  python3 loadout/tools/build.py
"""
import argparse
import html
import io
import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CKPT = os.path.join(ROOT, ".cache", "catalog")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
TARGET = 1200
_ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
_print_lock = threading.Lock()


def log(*a):
    with _print_lock:
        print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- polite HTTP (no disk cache: some pages are 2 MB)

GAPS = {"en.wikipedia.org": 3.0, "itunes.apple.com": 3.0, "play.google.com": 0.4, "store.steampowered.com": 0.6, "store.playstation.com": 0.3,
        "web.np.playstation.com": 0.6, "emerald.xboxservices.com": 0.6, "www.xbox.com": 0.6}
_last, _locks, _guard = {}, {}, threading.Lock()


def _pace(host):
    gap = GAPS.get(host, 0.05)
    with _guard:
        lock = _locks.setdefault(host, threading.Lock())
    with lock:
        wait = gap - (time.time() - _last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last[host] = time.time()


def http(url, data=None, headers=None, binary=False, tries=4):
    host = urllib.parse.urlparse(url).netloc
    h = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}
    if "steampowered.com" in host:
        h["Cookie"] = "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1; Steam_Language=english"
    h.update(headers or {})
    for n in range(tries):
        try:
            _pace(host)
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=30, context=_ctx) as r:
                body = r.read()
            return body if binary else body.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
            if e.code in (403, 429, 503):  # rate limited: back off hard
                time.sleep(15 * (n + 1))
                continue
            if n == tries - 1:
                log(f"  ! {e.code} {url[:120]}")
        except Exception as e:
            if n == tries - 1:
                log(f"  ! {type(e).__name__} {url[:120]}")
        time.sleep(2 * (n + 1))
    return None


def http_json(url, **kw):
    t = http(url, **kw)
    try:
        return json.loads(t) if t else None
    except ValueError:
        return None


def year(s):
    m = re.search(r"(19|20)\d\d", s or "")
    return int(m.group(0)) if m else 0


def item(id_, name, maker, genre, price, rating, count, yr, img, url=None):
    return {"id": str(id_), "name": html.unescape(name or "").strip(), "maker": html.unescape(maker or "").strip(),
            "genre": genre or "", "price": price or "", "rating": rating, "count": count, "year": yr, "img": img, "url": url}


# ---------------------------------------------------------------- Apple (iPhone, iPad, Mac)

IOS_GENRES = [6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6011, 6012, 6013, 6014, 6015, 6016,
              6017, 6018, 6020, 6021, 6023, 6024, 6026, 6027]
MAC_GENRES = [12001, 12002, 12003, 12004, 12005, 12006, 12007, 12008, 12010, 12011, 12012, 12013, 12014, 12015, 12016,
              12017, 12018, 12019, 12020, 12021, 12022]
APPLE_FEEDS = {
    "iphone": (["topfreeapplications", "toppaidapplications", "topgrossingapplications"], IOS_GENRES),
    "ipad": (["topfreeipadapplications", "toppaidipadapplications", "topgrossingipadapplications"], IOS_GENRES),
    "mac": (["topfreemacapps", "toppaidmacapps", "topgrossingmacapps"], MAC_GENRES),
}


MAC_TERMS = ["photo", "video", "music", "notes", "productivity", "developer", "code", "design", "pdf", "writing", "calendar",
             "mail", "vpn", "password", "utility", "cleaner", "backup", "game", "puzzle", "strategy", "finance", "budget",
             "weather", "education", "language", "health", "fitness", "drawing", "3d", "audio", "podcast", "browser", "chat",
             "social", "travel", "map", "dictionary", "news", "reader", "ebook", "scanner", "screenshot", "window", "keyboard",
             "clipboard", "menu bar", "timer", "focus", "todo", "project", "office", "spreadsheet", "presentation", "translate",
             "ai", "markdown", "terminal", "ssh", "ftp", "file manager", "archive", "converter", "font", "color", "icon",
             "camera", "streaming", "recorder", "dj", "piano", "guitar", "sports", "chess", "cards", "racing", "simulation",
             "kids", "math", "science", "astronomy", "medical", "business", "invoice", "accounting", "database", "network",
             "security", "disk", "battery", "wallpaper", "diagram", "mind map", "habit", "journal", "flashcards"]


def mac_search():
    out, seen = [], set()
    for term in (MAC_TERMS if TARGET >= 200 else MAC_TERMS[:3]):
        d = http_json("https://itunes.apple.com/search?entity=macSoftware&country=us&limit=200&term=" + urllib.parse.quote(term)) or {}
        for r in d.get("results", []):
            if r.get("trackId") in seen:
                continue
            seen.add(r.get("trackId"))
            out.append(item(r["trackId"], r.get("trackName"), r.get("sellerName") or r.get("artistName"), r.get("primaryGenreName"),
                            r.get("formattedPrice") or "", round(float(r["averageUserRating"]), 2) if r.get("userRatingCount") else None,
                            int(r.get("userRatingCount") or 0) or None, year(r.get("releaseDate")),
                            (r.get("artworkUrl100") or "").replace("100x100bb", "128x128bb"), r.get("trackViewUrl", "").split("?")[0]))
        log(f"  mac: '{term}': {len(out)} unique so far")
    out.sort(key=lambda x: -(x["count"] or 0))
    return out[:TARGET]


def apple(platform):
    if platform == "mac":
        return mac_search()
    feeds, genres = APPLE_FEEDS[platform]
    if TARGET < 200:  # quick test run
        genres = genres[:2]
    ids, best = [], {}
    for g in genres:
        for f in feeds:
            d = http_json(f"https://itunes.apple.com/us/rss/{f}/limit=200/genre={g}/json") or {}
            entries = d.get("feed", {}).get("entry", [])
            if isinstance(entries, dict):
                entries = [entries]
            for pos, e in enumerate(entries):
                try:
                    i = e["id"]["attributes"]["im:id"]
                except (KeyError, TypeError):
                    continue
                if i not in best:
                    ids.append(i)
                best[i] = min(best.get(i, 999), pos)
        log(f"  {platform}: genre {g}: {len(ids)} unique so far")
    out = []
    for k in range(0, len(ids), 150):
        batch = ids[k:k + 150]
        d = http_json(f"https://itunes.apple.com/lookup?id={','.join(batch)}&country=us") or {}
        for r in d.get("results", []):
            if r.get("wrapperType") != "software" and r.get("kind") not in ("software", "mac-software"):
                continue
            out.append(item(r["trackId"], r.get("trackName"), r.get("sellerName") or r.get("artistName"), r.get("primaryGenreName"),
                            r.get("formattedPrice") or ("Free" if not r.get("price") else f"${r['price']}"),
                            round(float(r["averageUserRating"]), 2) if r.get("userRatingCount") else None,
                            int(r.get("userRatingCount") or 0) or None, year(r.get("releaseDate")),
                            (r.get("artworkUrl100") or r.get("artworkUrl60") or "").replace("100x100bb", "128x128bb"),
                            r.get("trackViewUrl", "").split("?")[0]))
        log(f"  {platform}: looked up {min(k + 150, len(ids))}/{len(ids)}")
    out.sort(key=lambda x: (best.get(x["id"], 999), -(x["count"] or 0)))  # chart position first, so iPad differs from iPhone
    return out[:TARGET]


# ---------------------------------------------------------------- Google Play (Android)

PLAY_CATEGORIES = ["ART_AND_DESIGN", "AUTO_AND_VEHICLES", "BEAUTY", "BOOKS_AND_REFERENCE", "BUSINESS", "COMICS", "COMMUNICATION",
                   "DATING", "EDUCATION", "ENTERTAINMENT", "EVENTS", "FINANCE", "FOOD_AND_DRINK", "HEALTH_AND_FITNESS",
                   "HOUSE_AND_HOME", "LIFESTYLE", "MAPS_AND_NAVIGATION", "MEDICAL", "MUSIC_AND_AUDIO", "NEWS_AND_MAGAZINES",
                   "PARENTING", "PERSONALIZATION", "PHOTOGRAPHY", "PRODUCTIVITY", "SHOPPING", "SOCIAL", "SPORTS", "TOOLS",
                   "TRAVEL_AND_LOCAL", "VIDEO_PLAYERS", "WEATHER", "GAME_ACTION", "GAME_ADVENTURE", "GAME_ARCADE", "GAME_BOARD",
                   "GAME_CARD", "GAME_CASINO", "GAME_CASUAL", "GAME_EDUCATIONAL", "GAME_MUSIC", "GAME_PUZZLE", "GAME_RACING",
                   "GAME_ROLE_PLAYING", "GAME_SIMULATION", "GAME_SPORTS", "GAME_STRATEGY", "GAME_TRIVIA", "GAME_WORD"]


def play_details(pkg):
    page = http(f"https://play.google.com/store/apps/details?id={pkg}&hl=en_US&gl=US")
    if not page:
        return None
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get("@type") not in ("SoftwareApplication", "VideoGame", "MobileApplication"):
            continue
        ag = d.get("aggregateRating") or {}
        try:
            rating, count = round(float(ag["ratingValue"]), 2), int(ag["ratingCount"])
        except (KeyError, TypeError, ValueError):
            rating, count = None, None
        offers = d.get("offers") or [{}]
        offer = offers[0] if isinstance(offers, list) and offers else offers if isinstance(offers, dict) else {}
        price = offer.get("price")
        price = "Free" if price in (None, "0", 0) else f"${price}"
        icon = re.search(r'<meta property="og:image" content="([^"]+)"', page)
        img = re.sub(r"=[a-z0-9-]+$", "", html.unescape(icon.group(1))) + "=w128" if icon else d.get("image")
        upd = re.search(r'"datePublished"\s*:\s*"([^"]+)"', block)
        return item(pkg, d.get("name"), (d.get("author") or {}).get("name"), (d.get("applicationCategory") or "").replace("_", " ").title(),
                    price, rating, count, year(upd.group(1) if upd else ""), img,
                    f"https://play.google.com/store/apps/details?id={pkg}")
    return None


def android():
    per_cat = []
    for c in (PLAY_CATEGORIES if TARGET >= 200 else PLAY_CATEGORIES[:2]):
        page = http(f"https://play.google.com/store/apps/category/{c}?hl=en_US&gl=US") or ""
        ids = []
        for i in re.findall(r"/store/apps/details\?id=([A-Za-z0-9._]+)", page):
            if i not in ids:
                ids.append(i)
        per_cat.append(ids)
        log(f"  android: {c}: {len(ids)} apps")
    order, seen = [], set()
    for k in range(max(len(x) for x in per_cat) if per_cat else 0):  # round robin so every category is represented
        for ids in per_cat:
            if k < len(ids) and ids[k] not in seen:
                seen.add(ids[k])
                order.append(ids[k])
    log(f"  android: {len(order)} unique apps; reading app pages")
    out, lock = [], threading.Lock()

    def one(pkg):
        r = play_details(pkg)
        if r and r["count"]:
            with lock:
                out.append(r)
                if len(out) % 100 == 0:
                    log(f"  android: {len(out)} with ratings")

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(one, order[:int(TARGET * 1.35)]))
    out.sort(key=lambda x: -(x["count"] or 0))
    return out[:TARGET]


# ---------------------------------------------------------------- Steam

def steam():
    out, seen = [], set()
    for start in range(0, TARGET + 300, 100):
        d = http_json(f"https://store.steampowered.com/search/results/?query&start={start}&count=100&filter=topsellers"
                      f"&category1=998&infinite=1&cc=us&l=english") or {}
        rows = re.split(r'(?=<a href="https://store\.steampowered\.com/app/)', d.get("results_html", ""))
        for row in rows:
            m = re.search(r'data-ds-appid="(\d+)"', row)
            if not m or m.group(1) in seen:
                continue
            appid = m.group(1)
            seen.add(appid)
            title = re.search(r'<span class="title">(.*?)</span>', row, re.S)
            rel = re.search(r'search_released[^>]*>\s*([^<]*)<', row)
            price = re.search(r'discount_final_price[^>]*>([^<]+)<', row) or re.search(r'search_price[^>]*>\s*([^<]+?)\s*<', row)
            tip = re.search(r'search_review_summary[^"]*" data-tooltip-html="([^"]+)"', row)
            pct = cnt = None
            if tip:
                t = html.unescape(tip.group(1))
                mm = re.search(r"(\d+)% of the ([\d,]+) user reviews", t)
                if mm:
                    pct, cnt = int(mm.group(1)), int(mm.group(2).replace(",", ""))
            p = html.unescape(price.group(1)).strip() if price else ""
            cap = re.search(r'<img src="([^"]+/capsule_[^"]+)"', row)
            img = [f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg"] + ([cap.group(1)] if cap else [])
            out.append(item(appid, title.group(1) if title else "", "", "", "Free" if "free" in p.lower() else p,
                            pct, cnt, year(rel.group(1) if rel else ""), img,
                            f"https://store.steampowered.com/app/{appid}/"))
        log(f"  steam: {len(out)} top sellers")
        if len(out) >= TARGET:
            break
    for x in out:
        x["ratingType"] = "pct"
    return out[:TARGET]


# ---------------------------------------------------------------- PlayStation

PS_HASH = "4ce7d410a4db2c8b635a48c1dcec375906ff63b19dadd87e073f8fd0c0481d35"  # categoryGridRetrieve persisted query
PS_CATEGORY = "4cbf39e2-5749-4970-ba81-93a489e4570c"  # all games


def playstation():
    prods = []
    for off in range(0, TARGET + 200, 100):
        v = {"id": PS_CATEGORY, "pageArgs": {"size": 100, "offset": off}, "sortBy": {"name": "sales30", "isAscending": False},
             "filterBy": ["storeDisplayClassification:FULL_GAME"], "facetOptions": []}
        url = ("https://web.np.playstation.com/api/graphql/v1/op?operationName=categoryGridRetrieve&variables="
               + urllib.parse.quote(json.dumps(v)) + "&extensions="
               + urllib.parse.quote(json.dumps({"persistedQuery": {"version": 1, "sha256Hash": PS_HASH}})))
        d = http_json(url, headers={"x-psn-store-locale-override": "en-US", "content-type": "application/json"}) or {}
        page = ((d.get("data") or {}).get("categoryGridRetrieve") or {}).get("products") or []
        prods += page
        log(f"  playstation: {len(prods)} top sellers")
        if not page:
            break
    out, lock = [], threading.Lock()

    def one(p):
        media = {m["role"]: m["url"] for m in p.get("media", []) if m.get("type") == "IMAGE"}
        img = media.get("SIXTEEN_BY_NINE_BANNER") or media.get("GAMEHUB_COVER_ART") or media.get("MASTER")
        pr = p.get("price") or {}
        price = "Free" if pr.get("isFree") else (pr.get("discountedPrice") or pr.get("basePrice") or "")
        page = http(f"https://store.playstation.com/en-us/product/{p['id']}") or ""
        a = re.search(r'"averageRating"\s*:\s*([\d.]+)', page)
        c = re.search(r'"totalRatingsCount"\s*:\s*(\d+)', page)
        pub = re.search(r'"publisherName"\s*:\s*"([^"]+)"', page)
        gen = re.search(r'"genres"\s*:\s*\[\s*"([^"]+)"', page)
        rel = re.search(r'"releaseDate"\s*:\s*"([^"]+)"', page)
        r = item(p["id"], p.get("name"), pub.group(1) if pub else "", (gen.group(1).title() if gen else ""), price,
                 round(float(a.group(1)), 2) if a and c and int(c.group(1)) else None, int(c.group(1)) if c and int(c.group(1)) else None,
                 year(rel.group(1) if rel else ""), (img + "?w=320") if img else None,
                 f"https://store.playstation.com/en-us/product/{p['id']}")
        r["platforms"] = p.get("platforms") or []
        with lock:
            out.append((prods.index(p), r))

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(one, prods[:TARGET]))
    return [r for _, r in sorted(out, key=lambda x: x[0])]


# ---------------------------------------------------------------- Xbox

def xbox():
    page = http("https://www.xbox.com/en-US/games/browse") or ""
    out, seen = [], set()

    def take(summaries):
        for s in summaries:
            pid = s.get("productId")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            imgs = s.get("images") or {}
            img = (imgs.get("superHeroArt") or imgs.get("boxArt") or imgs.get("poster") or {}).get("url")
            pr = ((s.get("specificPrices") or {}).get("purchaseable") or [{}])[0]
            lp = pr.get("listPrice")
            price = "Free" if lp == 0 else (f"${lp:.2f}" if isinstance(lp, (int, float)) else "")
            out.append(item(pid, s.get("title"), s.get("publisherName"), ", ".join(s.get("categories") or [])[:40], price,
                            round(float(s["averageRating"]), 2) if s.get("ratingCount") else None, s.get("ratingCount") or None,
                            year(s.get("releaseDate")), (img.split("?")[0] + "?w=320&h=180&mode=crop") if img else None,
                            f"https://www.xbox.com/en-US/games/store/x/{pid}"))

    m = re.search(r'"productSummaries":(\{.*?\}),"skuSummaries"', page)
    ct = re.search(r'"encodedCT":"([^"]+)"', page)
    if m:
        try:
            take(json.loads(m.group(1)).values())
        except ValueError:
            pass
    ct = ct.group(1).encode().decode("unicode_escape") if ct else None
    while ct and len(out) < TARGET:
        body = json.dumps({"Filters": "e30=", "ReturnFilters": False, "ChannelKeyToBeUsedInResponse": "BROWSE_CHANNELID=_FILTERS=e30=",
                           "EncodedCT": ct, "ChannelId": ""}).encode()
        d = http_json("https://emerald.xboxservices.com/xboxcomfd/browse?locale=en-US", data=body,
                      headers={"Content-Type": "application/json", "x-ms-api-version": "1.1", "ms-cv": "LoadoutCatalog0000.1",
                               "Origin": "https://www.xbox.com", "Referer": "https://www.xbox.com/"}) or {}
        sums = d.get("productSummaries") or []
        take(sums.values() if isinstance(sums, dict) else sums)
        ch = list((d.get("channels") or {}).values())
        ct = ch[0].get("encodedCT") if ch else None
        log(f"  xbox: {len(out)} games")
        if not sums:
            break
    return out[:TARGET]


# ---------------------------------------------------------------- Nintendo Switch

WIKI_UA = "LoadoutCatalog/1.0 (https://github.com/yuGendry/yusuf-terminal; catalog import)"


def switch():
    """Nintendo publishes no player ratings, so Switch titles come from Wikipedia's lists of Switch games."""
    api = "https://en.wikipedia.org/w/api.php"
    q = http_json(api + "?action=query&list=search&format=json&srlimit=30&srsearch="
                  + urllib.parse.quote('intitle:"List of Nintendo Switch" games'), headers={"User-Agent": WIKI_UA}) or {}
    pages = [r["title"] for r in q.get("query", {}).get("search", [])
             if re.match(r"List of Nintendo Switch (2 )?games( \(.+\))?$", r["title"]) and r["title"] != "List of Nintendo Switch games"]
    found = {}
    for title in pages:
        d = http_json(api + "?action=parse&prop=text&format=json&formatversion=2&page=" + urllib.parse.quote(title),
                      headers={"User-Agent": WIKI_UA}) or {}
        text = (d.get("parse") or {}).get("text") or ""
        sw2 = "Switch 2" in title
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S):
            cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)
            if len(cells) < 3:
                continue
            first = cells[0]
            linked = bool(re.search(r'<a href="/wiki/(?!Help:|File:)[^"]+"', first))
            name = re.sub(r"<sup.*?</sup>", "", first, flags=re.S)
            name = html.unescape(re.sub(r"<[^>]+>", "", name)).strip()
            if not name or name.lower() in ("title", "game") or len(name) > 90:
                continue
            txt = lambda c: html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<sup.*?</sup>", "", c, flags=re.S))).split("\n")[0]
            dev = re.sub(r"\s+", " ", txt(cells[1])).strip(" ,")
            pub = re.sub(r"\s+", " ", txt(cells[2])).strip(" ,") if len(cells) > 2 else ""
            yrs = [int(y) for y in re.findall(r"\b(20[12]\d)\b", re.sub(r"<[^>]+>", " ", " ".join(cells[3:])))]
            key = name.lower()
            if key in found and not sw2:
                continue
            found[key] = {"name": name, "maker": pub or dev, "year": max(yrs) if yrs else 0, "linked": linked, "sw2": sw2,
                          "wiki": re.search(r'<a href="/wiki/([^"#]+)"', first)}
        log(f"  switch: {title}: {len(found)} games so far")
    now = datetime.now().year
    ranked = sorted(found.values(), key=lambda g: (not g["linked"], g["year"] > now or g["year"] == 0, -g["year"], g["name"].lower()))
    chosen = ranked[:TARGET]
    titles = [urllib.parse.unquote(g["wiki"].group(1)).replace("_", " ") for g in chosen if g["wiki"]]
    thumbs = {}
    for k in range(0, len(titles), 50):
        d = http_json(api + "?action=query&prop=pageimages&format=json&formatversion=2&pithumbsize=320&pilicense=any&redirects=1&titles="
                      + urllib.parse.quote("|".join(titles[k:k + 50])), headers={"User-Agent": WIKI_UA}) or {}
        q2 = d.get("query") or {}
        alias = {r["from"]: r["to"] for r in q2.get("redirects", []) + q2.get("normalized", [])}
        got = {pg["title"]: (pg.get("thumbnail") or {}).get("source") for pg in q2.get("pages", [])}
        for t in titles[k:k + 50]:
            thumbs[t] = got.get(alias.get(alias.get(t, t), alias.get(t, t)))
    log(f"  switch: {sum(1 for v in thumbs.values() if v)} pictures from Wikipedia")
    out = []
    for g in chosen:
        url = "https://en.wikipedia.org/wiki/" + g["wiki"].group(1) if g["wiki"] else ""
        t = urllib.parse.unquote(g["wiki"].group(1)).replace("_", " ") if g["wiki"] else None
        x = item(g["name"].lower(), g["name"], g["maker"], "", "", None, None, g["year"], thumbs.get(t) if t else None, url)
        x["platforms"] = ["Nintendo Switch 2"] if g["sw2"] else ["Nintendo Switch"]
        out.append(x)
    return out


# ---------------------------------------------------------------- pictures

def tiles(items, shape):
    from PIL import Image
    tw, th = (64, 64) if shape == "square" else (192, 108)
    result = [None] * len(items)

    def one(k):
        urls = items[k].get("img")
        data = None
        for url in (urls if isinstance(urls, list) else [urls]):
            if url:
                data = http(url, binary=True, tries=2)
                if data:
                    break
        if not data:
            return
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
                bg.alpha_composite(im)
                im = bg
            im = im.convert("RGB")
        except Exception:
            return
        r = tw / th
        if im.width / im.height > r:
            w = int(im.height * r)
            im = im.crop(((im.width - w) // 2, 0, (im.width - w) // 2 + w, im.height))
        else:
            h = int(im.width / r)
            im = im.crop((0, (im.height - h) // 2, im.width, (im.height - h) // 2 + h))
        result[k] = im.resize((tw, th), Image.LANCZOS)

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(one, range(len(items))))
    return result, tw, th


def sprite(platform, items, shape):
    from PIL import Image
    ts, tw, th = tiles(items, shape)
    have = [k for k, t in enumerate(ts) if t is not None]
    if not have:
        return None
    cols = 32 if shape == "square" else 16
    rows = (len(have) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (30, 34, 50))
    for n, k in enumerate(have):
        sheet.paste(ts[k], ((n % cols) * tw, (n // cols) * th))
        items[k]["idx"] = n
    path = os.path.join(CKPT if CKPT.endswith("-test") else os.path.join(ROOT, "img"), f"cat-{platform}.jpg")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path, "JPEG", quality=72, optimize=True, progressive=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    return {"file": f"img/cat-{platform}.jpg?v={stamp}", "cols": cols, "rows": rows, "shape": shape}


# ---------------------------------------------------------------- main

PLATFORMS = {
    "iphone": ("iPhone", "App Store", lambda: apple("iphone"), "square", "stars"),
    "ipad": ("iPad", "App Store", lambda: apple("ipad"), "square", "stars"),
    "mac": ("Mac", "Mac App Store", lambda: apple("mac"), "square", "stars"),
    "android": ("Android", "Google Play", android, "square", "stars"),
    "steam": ("Steam", "Steam", steam, "wide", "pct"),
    "playstation": ("PlayStation", "PlayStation Store", playstation, "wide", "stars"),
    "xbox": ("Xbox", "Xbox Store", xbox, "wide", "stars"),
    "switch": ("Nintendo Switch", "Wikipedia", switch, "wide", "none"),
}


def run_platform(key, refresh):
    label, source, fn, shape, rtype = PLATFORMS[key]
    path = os.path.join(CKPT, key + ".json")
    if not refresh and os.path.exists(path):
        log(f"{label}: using checkpoint")
        return json.load(open(path, encoding="utf-8"))
    log(f"{label}: fetching")
    try:
        items = fn()
    except Exception as e:  # one broken store should not stop the others
        log(f"{label}: FAILED {type(e).__name__}: {e}")
        return None
    items = [x for x in items if x["name"]]
    sp = sprite(key, items, shape) if items else None
    rows = [[x["name"], x["maker"], x["genre"], x["price"], x["rating"], x["count"], x["id"], x["year"], x.get("idx", -1),
             x.get("url") or "", "/".join(x.get("platforms") or [])] for x in items]
    res = {"label": label, "source": source, "ratingType": rtype, "sprite": sp, "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "fields": ["name", "maker", "genre", "price", "rating", "count", "id", "year", "img", "url", "platforms"], "items": rows}
    os.makedirs(CKPT, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    rated = sum(1 for r in rows if r[4] is not None)
    log(f"{label}: done, {len(rows)} titles, {rated} with ratings, {sum(1 for r in rows if r[8] >= 0)} pictures")
    return res


def main():
    global TARGET, CKPT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated platforms: " + ",".join(PLATFORMS))
    ap.add_argument("--refresh", action="store_true", help="ignore checkpoints and fetch everything again")
    ap.add_argument("--limit", type=int, default=TARGET, help=f"titles per platform (default {TARGET})")
    ap.add_argument("--test", action="store_true", help="write to loadout/.cache/catalog-test.json instead of data/catalog.json")
    args = ap.parse_args()
    TARGET = args.limit
    if args.test:
        CKPT = os.path.join(ROOT, ".cache", "catalog-test")
    try:
        import PIL  # noqa: F401
    except ImportError:
        sys.exit("Pillow is required: pip install pillow")
    keys = args.only.split(",") if args.only else list(PLATFORMS)
    out_path = os.path.join(ROOT, ".cache", "catalog-test.json") if args.test else os.path.join(ROOT, "data", "catalog.json")
    prev = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {"platforms": {}}
    with ThreadPoolExecutor(len(keys)) as pool:
        results = dict(zip(keys, pool.map(lambda k: run_platform(k, args.refresh or bool(args.only)), keys)))
    platforms = dict(prev.get("platforms", {}))
    for k in PLATFORMS:
        if results.get(k):
            platforms[k] = results[k]
    catalog = {"fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "platforms": {k: platforms[k] for k in PLATFORMS if k in platforms}}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    for k, v in catalog["platforms"].items():
        log(f"  {v['label']}: {len(v['items'])} titles")


if __name__ == "__main__":
    main()
