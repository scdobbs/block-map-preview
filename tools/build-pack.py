#!/usr/bin/env python3
"""Build a course pack: a field area the app ships with.

Run this once, from anywhere with a decent connection, and commit what it
writes. Students then install the area with one button and no USGS round trips.

    tools/build-pack.py --id poleta --name "Poleta folds" \
        --center 37.36,-118.06 --size 8 --sources topo,aerial,dem

    tools/build-pack.py --id poleta --name "Poleta folds" \
        --bbox=-118.10,37.32,-118.02,37.40

Note the equals sign on --bbox: a western longitude starts with a minus, and
argparse reads a bare one as a flag rather than a value.

It writes packs/<id>/pack.json and packs/<id>/tiles-NNN.bin, and adds the pack
to packs/index.json.

The source table below MUST agree with SOURCES in js/field/tiles.js — the app
verifies and repairs an installed area by rebuilding those URLs itself, so a
mismatch shows up as an area that installs and then reports every tile missing.
Note that the USGS services are addressed z/y/x and the terrain tiles z/x/y.
"""

import argparse, json, math, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Must match js/field/tiles.js.
SOURCES = {
    "topo": dict(max=16, min=4, bytes=22000,
                 url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"),
    "aerial": dict(max=16, min=4, bytes=34000,
                   url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"),
    "imagery": dict(max=16, min=4, bytes=37000,
                    url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"),
    "dem": dict(max=15, min=8, bytes=80000,
                url="https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"),
}

CHUNK_BYTES = 8 * 1024 * 1024
UA = "block-map-preview pack builder (github.com/scdobbs/block-map-preview)"


def lon2x(lon, z):
    return int((lon + 180.0) / 360.0 * 2 ** z)


def lat2y(lat, z):
    r = math.radians(lat)
    return int((1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * 2 ** z)


def tile_range(bbox, z):
    w, s, e, n = bbox
    x0, x1 = sorted((lon2x(w, z), lon2x(e, z)))
    y0, y1 = sorted((lat2y(n, z), lat2y(s, z)))
    lim = 2 ** z - 1
    return max(0, x0), min(lim, x1), max(0, y0), min(lim, y1)


def wanted_tiles(bbox, sources, min_zoom, max_zoom):
    out = []
    for sid in sources:
        s = SOURCES[sid]
        top = max(s["min"], min(s["max"], min_zoom))
        bottom = min(s["max"], max_zoom) if max_zoom else s["max"]
        for z in range(top, bottom + 1):
            x0, x1, y0, y1 = tile_range(bbox, z)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    out.append((sid, z, x, y))
    return out


def url_for(sid, z, x, y):
    return SOURCES[sid]["url"].format(z=z, x=x, y=y)


def fetch(sid, z, x, y, retries=3):
    """Returns (url, body_or_None, mime). None body means the source has no tile."""
    url = url_for(sid, z, x, y)
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": UA})
            with urlopen(req, timeout=30) as r:
                return url, r.read(), r.headers.get("Content-Type", "image/png").split(";")[0].strip()
        except HTTPError as e:
            if e.code == 404:
                return url, None, None       # a real hole, not a failure
            if attempt == retries - 1:
                return url, False, None
        except (URLError, TimeoutError, OSError):
            if attempt == retries - 1:
                return url, False, None
        time.sleep(0.4 * (attempt + 1))
    return url, False, None


def human(n):
    n = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", required=True, help="short slug, e.g. poleta")
    ap.add_argument("--name", required=True, help='shown in the app, e.g. "Poleta folds"')
    ap.add_argument("--detail", default="", help="one line of description")
    ap.add_argument("--bbox", help="W,S,E,N in degrees; pass it as --bbox=... , the value starts with a minus")
    ap.add_argument("--center", help="LAT,LON — use with --size")
    ap.add_argument("--size", type=float, help="box width in km, with --center")
    ap.add_argument("--sources", default="topo,aerial,dem")
    ap.add_argument("--min-zoom", type=int, default=10)
    ap.add_argument("--max-zoom", type=int, default=0, help="0 = each source's own maximum")
    ap.add_argument("--out", default=os.path.join(ROOT, "packs"))
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--chunk-mb", type=float, default=8.0,
                    help="size of each downloadable chunk; smaller resumes better on a bad connection")
    ap.add_argument("--yes", action="store_true", help="skip the confirmation")
    a = ap.parse_args()

    if a.bbox:
        bbox = [float(v) for v in a.bbox.split(",")]
        if len(bbox) != 4:
            sys.exit("--bbox needs W,S,E,N")
    elif a.center and a.size:
        lat, lon = [float(v) for v in a.center.split(",")]
        d_lat = a.size / 111.0
        d_lon = a.size / (111.0 * math.cos(math.radians(lat)))
        bbox = [lon - d_lon / 2, lat - d_lat / 2, lon + d_lon / 2, lat + d_lat / 2]
    else:
        sys.exit("give either --bbox or --center with --size")

    sources = [s.strip() for s in a.sources.split(",") if s.strip()]
    for s in sources:
        if s not in SOURCES:
            sys.exit(f"unknown source {s!r}; known: {', '.join(SOURCES)}")

    global CHUNK_BYTES
    CHUNK_BYTES = int(a.chunk_mb * 1024 * 1024)

    tiles = wanted_tiles(bbox, sources, a.min_zoom, a.max_zoom)
    est = sum(SOURCES[s]["bytes"] for s, _, _, _ in tiles)
    print(f"pack {a.id!r}: {len(tiles)} tiles, roughly {human(est)}")
    print(f"  bbox    {bbox[0]:.5f},{bbox[1]:.5f},{bbox[2]:.5f},{bbox[3]:.5f}")
    print(f"  sources {', '.join(sources)}  zoom {a.min_zoom}–{a.max_zoom or 'max'}")
    if not a.yes:
        if input("download now? [y/N] ").strip().lower() not in ("y", "yes"):
            sys.exit(0)

    out_dir = os.path.join(a.out, a.id)
    os.makedirs(out_dir, exist_ok=True)

    mimes, mime_idx = [], {}
    index, chunks = [], []
    buf = bytearray()
    chunk_no = 0
    absent = failed = 0
    written_bytes = 0

    def flush():
        nonlocal buf, chunk_no
        if not buf:
            return
        name = f"tiles-{chunk_no:03d}.bin"
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(buf)
        chunks.append({"file": name, "bytes": len(buf)})
        print(f"  wrote {name}  {human(len(buf))}")
        buf = bytearray()
        chunk_no += 1

    done = 0
    with ThreadPoolExecutor(max_workers=a.jobs) as pool:
        for url, body, mime in pool.map(lambda t: fetch(*t), tiles):
            done += 1
            if body is False:
                failed += 1
            elif body is None:
                index.append([url, chunk_no, 0, 0, 0])   # tombstone
                absent += 1
            else:
                if mime not in mime_idx:
                    mime_idx[mime] = len(mimes)
                    mimes.append(mime)
                index.append([url, chunk_no, len(buf), len(body), mime_idx[mime]])
                buf.extend(body)
                written_bytes += len(body)
                if len(buf) >= CHUNK_BYTES:
                    flush()
            if done % 100 == 0 or done == len(tiles):
                print(f"  {done}/{len(tiles)}  {human(written_bytes)}", end="\r", flush=True)
    print()
    flush()

    if failed:
        print(f"  WARNING: {failed} tiles failed after retries. Run again to fill them in.", file=sys.stderr)

    area = {
        "name": a.name, "bbox": bbox, "sources": sources,
        "minZoom": a.min_zoom, "maxZoom": a.max_zoom or max(SOURCES[s]["max"] for s in sources),
    }
    manifest = {
        "id": a.id, "name": a.name, "detail": a.detail,
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "area": area, "mimes": mimes, "chunks": chunks, "index": index,
    }
    with open(os.path.join(out_dir, "pack.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))

    # The index is what the app reads with no connection, so it carries enough
    # to describe a pack that has not been installed.
    index_path = os.path.join(a.out, "index.json")
    try:
        with open(index_path) as f:
            reg = json.load(f)
    except (OSError, ValueError):
        reg = {"packs": []}
    entry = {
        "id": a.id, "name": a.name, "detail": a.detail,
        "path": f"./packs/{a.id}/",
        "tiles": len(index), "bytes": written_bytes, "absent": absent,
        "area": area, "builtAt": manifest["builtAt"],
    }
    reg["packs"] = [p for p in reg.get("packs", []) if p.get("id") != a.id] + [entry]
    with open(index_path, "w") as f:
        json.dump(reg, f, indent=2)
        f.write("\n")

    print(f"\npack {a.id!r} built: {len(index)} tiles, {human(written_bytes)} in {len(chunks)} chunk(s)")
    if absent:
        print(f"  {absent} tiles are not published by the source here; recorded as holes.")
    print(f"  packs/{a.id}/  and packs/index.json updated — commit both.")


if __name__ == "__main__":
    main()
