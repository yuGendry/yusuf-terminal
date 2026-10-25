# Loadout

A single-page app for looking up games and apps: reviews, advanced reviews, real player ratings, best picks per theme, and a Pro demo (library tracking, store, gift cards).

`index.html` is generated. Edit the files in `src/`, then rebuild:

```sh
python3 loadout/tools/build.py
```

## Real pictures and player ratings

`tools/fetch_store_data.py` imports pictures, ratings and review excerpts from Steam, the Apple App Store, Google Play, the PlayStation Store and Wikipedia into `data/store.json` and the sprite sheets in `img/`. It needs network access to those sites and Pillow:

```sh
pip install pillow
python3 loadout/tools/fetch_store_data.py
python3 loadout/tools/build.py
```

If a search matches the wrong title, pin the right one in `src/store-overrides.json` (Steam app id, App Store id, Google Play package, PlayStation concept id or Wikipedia title), or set a source to `false` to skip it.

## Full catalog (All platforms)

`tools/fetch_app_catalog.py` imports up to 1,200 top titles per platform into `data/catalog.json`, with one picture sprite per platform in `img/cat-*.jpg`:

| Platform | Source | Ratings |
| --- | --- | --- |
| iPhone, iPad | App Store top charts in every category, iTunes Lookup API | App Store stars and count |
| Mac | iTunes Search API across topic keywords (Apple's Mac chart feeds are retired) | Mac App Store stars and count |
| Android | Google Play category pages and app pages | Google Play stars and count |
| Steam | Steam top sellers | % positive and review count |
| PlayStation | PlayStation Store top sellers and product pages | Star rating and count |
| Xbox | Xbox store browse pages | Star rating and count |
| Nintendo Switch | Wikipedia's lists of Switch and Switch 2 games | None (Nintendo publishes no ratings) |

```sh
python3 loadout/tools/fetch_app_catalog.py            # uses per-platform checkpoints in .cache/catalog
python3 loadout/tools/fetch_app_catalog.py --refresh  # fetch everything again
python3 loadout/tools/build.py
```

When publishing, include every `img/*.jpg` file alongside `index.html`.

## Weekly refresh

A scheduled routine ("Loadout weekly ratings refresh", Mondays 05:47 UTC) reruns both importers with `--refresh`, rebuilds, commits, pushes and republishes the page. It skips any platform whose title count drops more than 10%.
