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
