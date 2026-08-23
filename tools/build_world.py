#!/usr/bin/env python3
"""
build_world.py - bake the real-world map dataset for church-street-skate.

Downloads OpenStreetMap (Overpass API) + USGS 3DEP elevation for downtown
Burlington, Vermont and writes:

    data/world.js            ES module: `export const WORLD = {...};`
    data/world-summary.txt   human-readable counts + Church St POI list

Python 3, standard library only. No third-party packages required.

Usage:
    python3 tools/build_world.py              # use cache if present
    python3 tools/build_world.py --refresh    # re-download everything
    python3 tools/build_world.py --refresh-osm / --refresh-elev

Downloads are cached in tools/cache/ so re-baking is offline and instant.

Coordinate convention (contract with the game code):
    origin  = OSM node 204493047, Church Street x College Street
    +x      = metres EAST of origin
    +z      = metres SOUTH of origin   (north is -z)
    +y      = metres of elevation RELATIVE to the origin's ground elevation
    Simple equirectangular projection at the origin latitude.

Sources / licences:
    OpenStreetMap via Overpass API - ODbL, "(c) OpenStreetMap contributors"
    USGS 3DEP ImageServer         - public domain
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(REPO, "tools", "cache")
DATA = os.path.join(REPO, "data")
DOCS = os.path.join(REPO, "docs")

# Area of interest.  Church St from the Unitarian Church (Pearl St) south to
# Main St / City Hall, Battery St west, S. Union St east, King St south.
BBOX = (44.4735, -73.2205, 44.4830, -73.2065)  # (minLat, minLon, maxLat, maxLon)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

ELEV_IMAGESERVER = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/"
    "3DEPElevation/ImageServer"
)

USER_AGENT = "church-street-skate world builder (github: btownbrief) - contact stephenvdavis@gmail.com"

# Origin: OSM intersection node of Church Street and College Street.  Resolved
# from the data at run time; this is the expected id, used only as a hint.
ORIGIN_NODE_HINT = 204493047

M_PER_DEG_LAT = 111320.0

TERRAIN_STEP = 5.0          # metres between terrain samples
TERRAIN_PAD = 20.0          # metres of terrain beyond the OSM bbox
ELEV_IMAGE_SIZE = 400       # exportImage pixels per side (~2.7 m at this bbox)
SIMPLIFY_TOL = 0.3          # Douglas-Peucker tolerance, metres

# The five named cross streets along the Church Street pedestrian mall.
CROSS_STREETS = ["Pearl", "Cherry", "Bank", "College", "Main"]

# How close a building footprint must come to the mall centreline to count as
# fronting Church Street.  The mall is ~20 m building-face to building-face.
ON_CHURCH_DIST = 13.0

# ---- tag vocabularies ----------------------------------------------------

POI_KEYS = ["shop", "amenity", "tourism", "historic", "leisure", "man_made",
            "craft", "office"]

# Point street furniture: (key, value or None for "any value") -> prop kind.
PROP_RULES = [
    ("amenity", "bench"), ("natural", "tree"), ("highway", "street_lamp"),
    ("barrier", "bollard"), ("amenity", "bicycle_parking"),
    ("amenity", "waste_basket"), ("amenity", "fountain"),
    ("historic", "memorial"), ("tourism", "artwork"),
    ("emergency", "fire_hydrant"), ("highway", "traffic_signals"),
    ("highway", "crossing"), ("highway", "bus_stop"),
    ("public_transport", "platform"), ("amenity", "post_box"),
    ("leisure", "picnic_table"), ("man_made", "planter"),
    ("amenity", "bicycle_rental"), ("amenity", "shelter"),
    ("amenity", "vending_machine"), ("advertising", None),
    ("amenity", "drinking_water"), ("amenity", "clock"),
    ("amenity", "telephone"), ("amenity", "atm"),
    ("amenity", "parking_entrance"), ("barrier", "gate"),
    ("barrier", "kerb"), ("highway", "elevator"), ("man_made", "flagpole"),
    ("man_made", "utility_pole"), ("man_made", "surveillance"),
    ("natural", "shrub"), ("amenity", "charging_station"),
    ("amenity", "smoking_area"), ("tourism", "information"),
    ("emergency", "phone"), ("emergency", "siren"),
]

# Closed ways / relations that become ground areas rather than buildings.
AREA_RULES = [
    ("leisure", None), ("landuse", None), ("natural", None),
    ("amenity", "parking"), ("amenity", "school"),
    ("amenity", "place_of_worship"), ("amenity", "hospital"),
    ("amenity", "university"), ("amenity", "college"),
    ("amenity", "marketplace"), ("amenity", "grave_yard"),
    ("amenity", "fountain"), ("man_made", "bridge"), ("place", None),
    ("tourism", None), ("historic", None),
]

# Linear barriers -> skateable ledges/walls.
BARRIER_LINE_VALUES = {
    "retaining_wall", "wall", "fence", "kerb", "hedge", "handrail",
    "guard_rail", "city_wall", "chain", "bollard", "block", "cable_barrier",
    "jersey_barrier", "wire_fence",
}

# Tag subsets kept on output objects (keeps world.js small).
BUILDING_TAG_KEEP = ["shop", "amenity", "tourism", "historic", "wikidata",
                     "office", "leisure", "operator", "brand", "religion",
                     "denomination", "start_date", "building:part", "layer"]
POI_TAG_KEEP = ["cuisine", "website", "phone", "opening_hours", "brand",
                "operator", "wikidata", "level", "outdoor_seating", "takeaway",
                "artist_name", "artwork_type", "memorial", "inscription",
                "capacity", "fee", "access", "wheelchair", "vending"]
PROP_TAG_KEEP = ["name", "backrest", "material", "species", "genus",
                 "leaf_type", "height", "capacity", "bicycle_parking",
                 "covered", "artist_name", "artwork_type", "memorial",
                 "crossing", "crossing:markings", "tactile_paving", "kerb",
                 "bollard", "direction", "shelter", "operator", "network",
                 "colour", "lamp_mount", "support"]
LINE_TAG_KEEP = ["name", "material", "height", "surface", "step_count",
                 "incline", "handrail", "ramp", "wheelchair", "layer",
                 "conveying", "width", "kerb", "tactile_paving"]
AREA_TAG_KEEP = ["surface", "access", "fee", "parking", "capacity", "sport",
                 "operator", "wikidata", "water", "playground"]

ROAD_AREA_KINDS = {"pedestrian", "footway", "service", "living_street"}


# --------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------

def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http_get(url, data=None, timeout=300, tries=5):
    """GET/POST with polite exponential backoff on 429/504/5xx."""
    delay = 5.0
    last = None
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(
            url,
            data=data,
            headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw
        except urllib.error.HTTPError as e:
            last = e
            body = ""
            try:
                body = e.read()[:200].decode("utf-8", "replace")
            except Exception:
                pass
            log(f"  HTTP {e.code} (attempt {attempt}/{tries}) {body!r}")
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except Exception as e:  # timeouts, DNS, connection reset
            last = e
            log(f"  {type(e).__name__}: {e} (attempt {attempt}/{tries})")
        if attempt < tries:
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"request failed after {tries} tries: {url}: {last}")


def r1(v):
    """Round to 0.1 and drop a trailing .0 so the JSON stays compact."""
    v = round(v + 0.0, 1)
    if v == 0:
        return 0
    return int(v) if v == int(v) else v


def compact(o):
    """Recursively round floats so json.dumps emits short numbers."""
    if isinstance(o, float):
        return r1(o)
    if isinstance(o, list):
        return [compact(v) for v in o]
    if isinstance(o, dict):
        return {k: compact(v) for k, v in o.items() if v is not None and v != {}}
    return o


def jd(o):
    return json.dumps(compact(o), separators=(",", ":"), ensure_ascii=False)


# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

def simplify(pts, tol=SIMPLIFY_TOL):
    """Iterative Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, az = pts[i]
        bx, bz = pts[j]
        dx, dz = bx - ax, bz - az
        den = dx * dx + dz * dz
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, pz = pts[k]
            if den == 0:
                d = math.hypot(px - ax, pz - az)
            else:
                d = abs(dx * (az - pz) - (ax - px) * dz) / math.sqrt(den)
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]


def dedupe(pts, eps=0.05):
    out = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > eps or abs(p[1] - out[-1][1]) > eps:
            out.append(p)
    return out


def ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2.0


def centroid(pts):
    a = ring_area(pts)
    if abs(a) < 1e-9:
        n = len(pts) or 1
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    cx = cz = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        cr = x1 * z2 - x2 * z1
        cx += (x1 + x2) * cr
        cz += (z1 + z2) * cr
    return (cx / (6 * a), cz / (6 * a))


def point_in_ring(x, z, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z):
            xint = (xj - xi) * (z - zi) / (zj - zi) + xi
            if x < xint:
                inside = not inside
        j = i
    return inside


def seg_dist(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    den = dx * dx + dz * dz
    if den == 0:
        return math.hypot(px - ax, pz - az)
    t = max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / den))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz))


def dist_to_polyline(px, pz, line):
    return min(seg_dist(px, pz, line[i][0], line[i][1],
                        line[i + 1][0], line[i + 1][1])
               for i in range(len(line) - 1))


def bbox_of(pts):
    xs = [p[0] for p in pts]
    zs = [p[1] for p in pts]
    return min(xs), min(zs), max(xs), max(zs)


def clip_poly(pts, box):
    """Sutherland-Hodgman clip of a ring against an axis-aligned box.

    Overpass returns the *complete* geometry of any way or relation member
    that touches the query bbox, so e.g. the Lake Champlain multipolygon
    arrives hundreds of kilometres wide.  Clipping keeps world.js sane.
    """
    x0, z0, x1, z1 = box
    edges = [(0, x0, 1), (0, x1, -1), (1, z0, 1), (1, z1, -1)]
    out = list(pts)
    for axis, lim, sign in edges:
        if not out:
            return []
        inp, out = out, []
        n = len(inp)
        for i in range(n):
            a, b = inp[i - 1], inp[i]
            ain = (a[axis] - lim) * sign >= 0
            bin_ = (b[axis] - lim) * sign >= 0
            if ain != bin_:
                da, db = a[axis] - lim, b[axis] - lim
                t = da / (da - db)
                out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            if bin_:
                out.append(b)
    return out


def clip_line(pts, box):
    """Split a polyline into the pieces that fall inside the box."""
    x0, z0, x1, z1 = box

    def inside(p):
        return x0 <= p[0] <= x1 and z0 <= p[1] <= z1

    def cut(a, b):
        """Clip segment a-b to the box (Liang-Barsky); None if fully outside."""
        t0, t1 = 0.0, 1.0
        dx, dz = b[0] - a[0], b[1] - a[1]
        for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]),
                     (-dz, a[1] - z0), (dz, z1 - a[1])):
            if p == 0:
                if q < 0:
                    return None
                continue
            r = q / p
            if p < 0:
                if r > t1:
                    return None
                t0 = max(t0, r)
            else:
                if r < t0:
                    return None
                t1 = min(t1, r)
        return ((a[0] + dx * t0, a[1] + dz * t0),
                (a[0] + dx * t1, a[1] + dz * t1))

    pieces, cur = [], []
    for i in range(len(pts) - 1):
        seg = cut(pts[i], pts[i + 1])
        if seg is None:
            if len(cur) > 1:
                pieces.append(cur)
            cur = []
            continue
        if not cur:
            cur = [seg[0], seg[1]]
        else:
            if math.hypot(cur[-1][0] - seg[0][0], cur[-1][1] - seg[0][1]) > 0.05:
                if len(cur) > 1:
                    pieces.append(cur)
                cur = [seg[0], seg[1]]
            else:
                cur.append(seg[1])
        if not inside(pts[i + 1]):
            if len(cur) > 1:
                pieces.append(cur)
            cur = []
    if len(cur) > 1:
        pieces.append(cur)
    return pieces


# --------------------------------------------------------------------------
# 1. OpenStreetMap
# --------------------------------------------------------------------------

OVERPASS_QUERY = """[out:json][timeout:240];
(
  way({s},{w},{n},{e});
  relation["type"="multipolygon"]({s},{w},{n},{e});
  relation["building"]({s},{w},{n},{e});
  node[~"."~"."]({s},{w},{n},{e});
);
out body geom;
"""


def fetch_osm(refresh=False):
    path = os.path.join(CACHE, "osm.json")
    if os.path.exists(path) and not refresh:
        log(f"OSM: using cache {path} ({os.path.getsize(path)/1e6:.1f} MB)")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)["elements"]

    s, w, n, e = BBOX
    q = OVERPASS_QUERY.format(s=s, w=w, n=n, e=e)
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in OVERPASS_ENDPOINTS:
        log(f"OSM: querying {ep}")
        try:
            raw = http_get(ep, data=body, timeout=300, tries=3)
            doc = json.loads(raw.decode("utf-8"))
            if "elements" not in doc:
                raise RuntimeError("no elements in response")
            os.makedirs(CACHE, exist_ok=True)
            with open(path, "wb") as f:
                f.write(raw)
            log(f"OSM: {len(doc['elements'])} elements, "
                f"{len(raw)/1e6:.1f} MB -> {path}")
            return doc["elements"]
        except Exception as exc:
            last = exc
            log(f"OSM: {ep} failed: {exc}")
    raise RuntimeError(f"all Overpass endpoints failed: {last}")


# --------------------------------------------------------------------------
# 2. Elevation (USGS 3DEP)
# --------------------------------------------------------------------------

TIFF_TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4,
                  10: 8, 11: 4, 12: 8}
TIFF_TYPE_FMT = {1: "B", 3: "H", 4: "I", 6: "b", 8: "h", 9: "i", 11: "f",
                 12: "d"}


def read_geotiff_f32(blob):
    """Minimal GeoTIFF reader: uncompressed float32, striped or tiled.

    Returns (grid, ulx, uly, sx, sy, nodata) where grid[row][col] and
    ulx/uly are the upper-left corner in degrees, sx/sy degrees per pixel.
    """
    bo = "<" if blob[:2] == b"II" else ">"
    if blob[:2] not in (b"II", b"MM"):
        raise ValueError("not a TIFF")
    ifd = struct.unpack(bo + "I", blob[4:8])[0]
    count = struct.unpack(bo + "H", blob[ifd:ifd + 2])[0]
    tags = {}
    for i in range(count):
        off = ifd + 2 + i * 12
        tag, typ, cnt = struct.unpack(bo + "HHI", blob[off:off + 8])
        size = TIFF_TYPE_SIZE.get(typ, 1) * cnt
        if size <= 4:
            raw = blob[off + 8:off + 8 + size]
        else:
            ptr = struct.unpack(bo + "I", blob[off + 8:off + 12])[0]
            raw = blob[ptr:ptr + size]
        if typ in TIFF_TYPE_FMT:
            tags[tag] = struct.unpack(bo + str(cnt) + TIFF_TYPE_FMT[typ], raw)
        else:
            tags[tag] = raw

    width = tags[256][0]
    height = tags[257][0]
    bits = tags[258][0]
    comp = tags.get(259, (1,))[0]
    sfmt = tags.get(339, (1,))[0]
    if comp != 1:
        raise ValueError(f"compressed TIFF (compression={comp}) not supported")
    if bits != 32 or sfmt != 3:
        raise ValueError(f"expected float32, got bits={bits} sampleformat={sfmt}")

    nodata = -9999.0
    if 42113 in tags:
        try:
            nodata = float(tags[42113].split(b"\x00")[0].decode())
        except Exception:
            pass

    scale = tags.get(33550, (1.0, 1.0, 0.0))
    tie = tags.get(33922, (0, 0, 0, 0.0, 0.0, 0.0))
    ulx, uly = tie[3], tie[4]
    sx, sy = scale[0], scale[1]

    grid = [[None] * width for _ in range(height)]
    if 322 in tags:  # tiled
        tw, th = tags[322][0], tags[323][0]
        offs, counts = tags[324], tags[325]
        across = (width + tw - 1) // tw
        for ti, off in enumerate(offs):
            buf = blob[off:off + counts[ti]]
            vals = struct.unpack(bo + str(tw * th) + "f", buf[:tw * th * 4])
            tx0, tz0 = (ti % across) * tw, (ti // across) * th
            for r in range(th):
                y = tz0 + r
                if y >= height:
                    break
                base = r * tw
                row = grid[y]
                for c in range(tw):
                    x = tx0 + c
                    if x >= width:
                        break
                    row[x] = vals[base + c]
    else:  # striped
        rps = tags.get(278, (height,))[0]
        offs, counts = tags[273], tags[279]
        for si, off in enumerate(offs):
            buf = blob[off:off + counts[si]]
            nrows = min(rps, height - si * rps)
            vals = struct.unpack(bo + str(nrows * width) + "f",
                                 buf[:nrows * width * 4])
            for r in range(nrows):
                grid[si * rps + r] = list(vals[r * width:(r + 1) * width])

    return grid, ulx, uly, sx, sy, nodata


def fetch_elev_tiff(bbox, size, refresh=False):
    path = os.path.join(CACHE, "elev.tif")
    if os.path.exists(path) and not refresh:
        log(f"ELEV: using cache {path}")
        return open(path, "rb").read()
    s, w, n, e = bbox
    url = ELEV_IMAGESERVER + "/exportImage?" + urllib.parse.urlencode({
        "bbox": f"{w},{s},{e},{n}",
        "bboxSR": 4326, "imageSR": 4326,
        "size": f"{size},{size}",
        "format": "tiff", "pixelType": "F32", "noData": -9999,
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
    })
    log("ELEV: exportImage from USGS 3DEP ...")
    blob = http_get(url, timeout=180, tries=4)
    if blob[:2] not in (b"II", b"MM"):
        raise RuntimeError(f"3DEP did not return a TIFF: {blob[:200]!r}")
    os.makedirs(CACHE, exist_ok=True)
    with open(path, "wb") as f:
        f.write(blob)
    log(f"ELEV: {len(blob)/1e6:.1f} MB -> {path}")
    return blob


def fetch_elev_getsamples(latlons, refresh=False):
    """Fallback: 3DEP getSamples in batches of 200 multipoints."""
    out = []
    for i in range(0, len(latlons), 200):
        batch = latlons[i:i + 200]
        geom = {"points": [[lon, lat] for lat, lon in batch],
                "spatialReference": {"wkid": 4326}}
        url = ELEV_IMAGESERVER + "/getSamples?" + urllib.parse.urlencode({
            "geometry": json.dumps(geom),
            "geometryType": "esriGeometryMultipoint",
            "returnFirstValueOnly": "true",
            "interpolation": "RSP_BilinearInterpolation",
            "f": "json",
        })
        doc = json.loads(http_get(url, timeout=120, tries=4).decode())
        vals = {int(s["locationId"]): s.get("value") for s in doc.get("samples", [])}
        for k in range(len(batch)):
            v = vals.get(k)
            try:
                out.append(float(v))
            except (TypeError, ValueError):
                out.append(None)
        time.sleep(0.4)
    return out


def fetch_elev_open_elevation(latlons):
    """Last-resort fallback: Open-Elevation public API."""
    out = []
    for i in range(0, len(latlons), 150):
        batch = latlons[i:i + 150]
        body = json.dumps({"locations": [{"latitude": a, "longitude": b}
                                         for a, b in batch]}).encode()
        req = urllib.request.Request(
            "https://api.open-elevation.com/api/v1/lookup", data=body,
            headers={"Content-Type": "application/json", "User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r:
            doc = json.loads(r.read().decode())
        out += [p.get("elevation") for p in doc["results"]]
        time.sleep(0.5)
    return out


# --------------------------------------------------------------------------
# Main build
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download all")
    ap.add_argument("--refresh-osm", action="store_true")
    ap.add_argument("--refresh-elev", action="store_true")
    args = ap.parse_args()

    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)

    gaps = []   # data problems worth recording in the summary

    # ---- fetch OSM ------------------------------------------------------
    elements = fetch_osm(refresh=args.refresh or args.refresh_osm)
    ways = {e["id"]: e for e in elements if e["type"] == "way"}
    nodes = {e["id"]: e for e in elements if e["type"] == "node"}
    rels = {e["id"]: e for e in elements if e["type"] == "relation"}

    # ---- origin ---------------------------------------------------------
    def wname(w):
        return w.get("tags", {}).get("name", "")

    def ways_named(name):
        return [w for w in ways.values() if wname(w) == name]

    def intersection_nodes(a, b):
        na = set()
        for w in ways_named(a):
            na |= set(w.get("nodes", []))
        hits = []
        for w in ways_named(b):
            for nid in w.get("nodes", []):
                if nid in na and nid not in hits:
                    hits.append(nid)
        return hits

    def node_latlon(nid):
        """Coordinates of a node, from the node table or any way geometry."""
        if nid in nodes:
            return nodes[nid]["lat"], nodes[nid]["lon"]
        for w in ways.values():
            if "geometry" in w and nid in w.get("nodes", []):
                i = w["nodes"].index(nid)
                g = w["geometry"][i]
                return g["lat"], g["lon"]
        return None

    hits = intersection_nodes("Church Street", "College Street")
    if ORIGIN_NODE_HINT in hits:
        origin_node = ORIGIN_NODE_HINT
    elif len(hits) == 1:
        origin_node = hits[0]
    elif hits:
        origin_node = hits[0]
        gaps.append(f"Church/College intersection ambiguous ({hits}); used {origin_node}")
    else:
        raise RuntimeError("could not find the Church St x College St node")
    olat, olon = node_latlon(origin_node)
    log(f"ORIGIN: node {origin_node} at {olat:.7f},{olon:.7f}")

    mlat = M_PER_DEG_LAT
    mlon = M_PER_DEG_LAT * math.cos(math.radians(olat))

    def proj(lat, lon):
        return ((lon - olon) * mlon, (olat - lat) * mlat)

    def unproj(x, z):
        return (olat - z / mlat, olon + x / mlon)

    def geom_pts(el):
        g = el.get("geometry")
        if not g:
            return []
        return [proj(p["lat"], p["lon"]) for p in g if p]

    # Overpass hands back the full geometry of anything touching the query
    # bbox (the Lake Champlain multipolygon is hundreds of km wide), so clip
    # everything to the area of interest plus a margin that keeps ordinary
    # edge-straddling buildings and streets intact.
    _ax, _az = proj(BBOX[0], BBOX[1])      # south-west corner
    _bx, _bz = proj(BBOX[2], BBOX[3])      # north-east corner
    CLIP = (min(_ax, _bx) - 60.0, min(_az, _bz) - 60.0,
            max(_ax, _bx) + 60.0, max(_az, _bz) + 60.0)
    log(f"CLIP box: x {CLIP[0]:.0f}..{CLIP[2]:.0f}  z {CLIP[1]:.0f}..{CLIP[3]:.0f}")

    def in_clip(x, z):
        return CLIP[0] <= x <= CLIP[2] and CLIP[1] <= z <= CLIP[3]

    def clip_ring(ring):
        if all(in_clip(x, z) for x, z in ring):
            return ring
        r = dedupe(clip_poly(ring, CLIP))
        return r if len(r) >= 3 else None

    # ---- classify -------------------------------------------------------
    buildings, roads, areas, pois, props, lines = [], [], [], [], [], []
    seen_poi = set()

    def keep_tags(t, keys):
        return {k: t[k] for k in keys if k in t}

    def parse_height(v):
        if not v:
            return None
        v = str(v).strip().lower().replace("meters", "").replace("metres", "")
        v = v.replace("m", "").strip()
        try:
            if "'" in v:  # feet/inches
                ft = v.split("'")[0]
                return float(ft) * 0.3048
            return float(v.split()[0])
        except (ValueError, IndexError):
            return None

    COMMERCIAL = {"retail", "commercial", "shop", "supermarket", "office",
                  "mixed_use", "hotel", "civic", "public", "government"}

    def build_building(el, outer, holes, tags, oid):
        t = tags
        h = parse_height(t.get("height"))
        levels = None
        if t.get("building:levels"):
            try:
                levels = float(t["building:levels"])
            except ValueError:
                levels = None
        btype = t.get("building", "yes")
        # hsrc records where h came from, so the game (and the gap report) can
        # tell a surveyed height from a guess.
        if h is not None:
            hsrc = "osm"
        elif levels:
            h = levels * 3.4 + (1.0 if btype in COMMERCIAL else 0.0)
            hsrc = "levels"
        else:
            h = 8.0 if btype in COMMERCIAL else 7.0
            hsrc = "default"
        rec = {
            "id": oid,
            "name": t.get("name"),
            "pts": outer,
            "h": h,
            "hsrc": hsrc,
            "levels": levels,
            "type": btype,
            "colour": t.get("building:colour") or t.get("building:color"),
            "material": t.get("building:material"),
            "roof": t.get("roof:shape"),
            "addr": (" ".join(x for x in [t.get("addr:housenumber"),
                                          t.get("addr:street")] if x) or None),
            "tags": keep_tags(t, BUILDING_TAG_KEEP),
        }
        if holes:
            rec["holes"] = holes
        buildings.append(rec)

    # --- ways ---
    for wid, w in ways.items():
        t = w.get("tags") or {}
        if not t:
            continue
        pts = dedupe(geom_pts(w))
        if len(pts) < 2:
            continue
        closed = (len(pts) > 3 and
                  math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 0.2)

        ring = None                      # clipped, simplified, unclosed ring
        strands = []                     # clipped open polylines
        if closed:
            ring = clip_ring(pts[:-1])
            if ring is None:
                continue
            ring = simplify(ring)
            if len(ring) < 3:
                continue
        else:
            strands = [simplify(s) for s in clip_line(pts, CLIP)]
            strands = [s for s in strands if len(s) >= 2]
            if not strands:
                continue

        def line_recs(kind, extra=None):
            for i, s in enumerate(strands if not closed else [ring + [ring[0]]]):
                rec = {"kind": kind, "pts": s,
                       "tags": keep_tags(t, LINE_TAG_KEEP)}
                if extra:
                    rec.update(extra)
                lines.append(rec)

        if "building" in t or "building:part" in t:
            if closed:
                build_building(w, ring, None, t, f"w{wid}")

        if "highway" in t:
            kind = t["highway"]
            if t.get("area") == "yes" and closed and kind in ROAD_AREA_KINDS:
                areas.append({"id": f"w{wid}", "kind": f"highway:{kind}",
                              "name": t.get("name"), "pts": ring,
                              "tags": keep_tags(t, AREA_TAG_KEEP)})
            else:
                base = {"name": t.get("name"), "kind": kind}
                for k, o in (("lanes", "lanes"), ("oneway", "oneway"),
                             ("width", "width"), ("surface", "surface"),
                             ("maxspeed", "maxspeed"), ("sidewalk", "sidewalk")):
                    if k in t:
                        base[o] = t[k]
                if "sidewalk" not in base:
                    for k in ("sidewalk:both", "sidewalk:left", "sidewalk:right"):
                        if k in t:
                            base["sidewalk"] = f"{k.split(':')[1]}={t[k]}"
                            break
                if kind == "steps":
                    for k in ("step_count", "incline", "handrail", "ramp"):
                        if k in t:
                            base[k] = t[k]
                pieces = [ring + [ring[0]]] if closed else strands
                for i, s in enumerate(pieces):
                    rec = {"id": f"w{wid}" + (f"#{i}" if i else "")}
                    rec.update(base)
                    rec["pts"] = s
                    roads.append(rec)
                if kind == "steps":
                    line_recs("steps")

        if t.get("barrier") in BARRIER_LINE_VALUES:
            line_recs(f"barrier:{t['barrier']}")
        if t.get("man_made") in ("embankment", "pier", "breakwater"):
            line_recs(f"man_made:{t['man_made']}")

        if closed and "building" not in t:
            for k, v in AREA_RULES:
                if k in t and (v is None or t[k] == v):
                    areas.append({"id": f"w{wid}", "kind": f"{k}:{t[k]}",
                                  "name": t.get("name"), "pts": ring,
                                  "tags": keep_tags(t, AREA_TAG_KEEP)})
                    break

        # POI from a way (shop in a building outline, a named park, etc.)
        if t.get("name"):
            for k in POI_KEYS:
                if k not in t:
                    continue
                if closed:
                    cx, cz = centroid(ring)
                else:
                    mid = strands[0]
                    cx, cz = mid[len(mid) // 2]
                if in_clip(cx, cz):
                    pois.append({"id": f"w{wid}", "name": t["name"],
                                 "kind": f"{k}:{t[k]}", "x": cx, "z": cz,
                                 "tags": keep_tags(t, POI_TAG_KEEP)})
                    seen_poi.add(f"w{wid}")
                break

    # --- relations (multipolygon buildings / areas) ---
    for rid, rel in rels.items():
        t = rel.get("tags") or {}
        members = rel.get("members", [])
        outers, inners = [], []
        for m in members:
            if m.get("type") != "way" or "geometry" not in m:
                continue
            pts = dedupe([proj(p["lat"], p["lon"]) for p in m["geometry"]])
            if len(pts) < 2:
                continue
            (outers if m.get("role") != "inner" else inners).append(pts)

        def chain(segs):
            """Join way fragments into closed rings."""
            rings, pool = [], list(segs)
            while pool:
                cur = pool.pop(0)
                changed = True
                while changed and math.hypot(cur[0][0] - cur[-1][0],
                                             cur[0][1] - cur[-1][1]) > 0.5:
                    changed = False
                    for i, s in enumerate(pool):
                        if math.hypot(cur[-1][0] - s[0][0], cur[-1][1] - s[0][1]) < 0.5:
                            cur = cur + s[1:]; pool.pop(i); changed = True; break
                        if math.hypot(cur[-1][0] - s[-1][0], cur[-1][1] - s[-1][1]) < 0.5:
                            cur = cur + s[::-1][1:]; pool.pop(i); changed = True; break
                        if math.hypot(cur[0][0] - s[-1][0], cur[0][1] - s[-1][1]) < 0.5:
                            cur = s[:-1] + cur; pool.pop(i); changed = True; break
                        if math.hypot(cur[0][0] - s[0][0], cur[0][1] - s[0][1]) < 0.5:
                            cur = s[::-1][:-1] + cur; pool.pop(i); changed = True; break
                r = simplify(dedupe(cur))
                if len(r) >= 3:
                    rings.append(r)
            return rings

        oring = [r for r in (clip_ring(r) for r in chain(outers)) if r]
        iring = [r for r in (clip_ring(r) for r in chain(inners)) if r]
        if not oring:
            continue
        oring.sort(key=lambda r: abs(ring_area(r)), reverse=True)
        if "building" in t:
            build_building(rel, oring[0], iring or None, t, f"r{rid}")
        else:
            for k, v in AREA_RULES:
                if k in t and (v is None or t[k] == v):
                    areas.append({"id": f"r{rid}", "kind": f"{k}:{t[k]}",
                                  "name": t.get("name"), "pts": oring[0],
                                  "tags": keep_tags(t, AREA_TAG_KEEP)})
                    break

    # --- nodes: POIs + props ---
    for nid, n in nodes.items():
        t = n.get("tags") or {}
        if not t:
            continue
        x, z = proj(n["lat"], n["lon"])
        if not in_clip(x, z):
            continue
        if t.get("name"):
            for k in POI_KEYS:
                if k in t:
                    pois.append({"id": f"n{nid}", "name": t["name"],
                                 "kind": f"{k}:{t[k]}", "x": x, "z": z,
                                 "tags": keep_tags(t, POI_TAG_KEEP)})
                    break
        for k, v in PROP_RULES:
            if k in t and (v is None or t[k] == v):
                props.append({"kind": f"{k}:{t[k]}", "x": x, "z": z,
                              "tags": keep_tags(t, PROP_TAG_KEEP)})
                break

    log(f"CLASSIFY: {len(buildings)} buildings, {len(roads)} roads, "
        f"{len(areas)} areas, {len(pois)} pois, {len(props)} props, "
        f"{len(lines)} lines")

    # ---- Church Street mall centreline ---------------------------------
    cross_nodes = {}
    for cs in CROSS_STREETS:
        hits = intersection_nodes("Church Street", f"{cs} Street")
        if not hits:
            gaps.append(f"no Church St x {cs} St shared node in OSM")
            continue
        # pick the hit closest to the mean of Church St geometry in x
        cross_nodes[cs] = hits[0]
        if len(hits) > 1:
            gaps.append(f"Church x {cs} has {len(hits)} shared nodes; used {hits[0]}")

    cross_xz = {}
    for cs, nid in cross_nodes.items():
        ll = node_latlon(nid)
        if ll:
            cross_xz[cs] = proj(*ll)

    # Chain the highway=pedestrian "Church Street" ways into one centreline.
    mall_ways = [w for w in ways.values()
                 if wname(w) == "Church Street"
                 and (w.get("tags", {}).get("highway") == "pedestrian")
                 and w.get("tags", {}).get("area") != "yes"]
    segs = [w["nodes"] for w in mall_ways if w.get("nodes")]
    adj = defaultdict(list)
    for i, s in enumerate(segs):
        adj[s[0]].append(i)
        adj[s[-1]].append(i)
    used = set()
    chains = []
    for i in range(len(segs)):
        if i in used:
            continue
        cur = list(segs[i]); used.add(i)
        changed = True
        while changed:
            changed = False
            for j, s in enumerate(segs):
                if j in used:
                    continue
                if s[0] == cur[-1]:
                    cur += s[1:]; used.add(j); changed = True
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]; used.add(j); changed = True
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur; used.add(j); changed = True
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur; used.add(j); changed = True
        chains.append(cur)
    chains.sort(key=len, reverse=True)
    mall_nodes = chains[0] if chains else []
    if len(chains) > 1:
        gaps.append(f"Church St mall geometry came in {len(chains)} disconnected "
                    f"chains; used the longest ({len(mall_nodes)} nodes)")

    centre = []
    for nid in mall_nodes:
        ll = node_latlon(nid)
        if ll:
            centre.append(proj(*ll))
    if centre and len(centre) > 1 and centre[0][1] > centre[-1][1]:
        centre.reverse()          # order north -> south (+z)
        mall_nodes = mall_nodes[::-1]

    # Trim to the Pearl..Main span if both anchors are on the chain.
    if "Pearl" in cross_nodes and "Main" in cross_nodes:
        try:
            a = mall_nodes.index(cross_nodes["Pearl"])
            b = mall_nodes.index(cross_nodes["Main"])
            lo, hi = min(a, b), max(a, b)
            centre = centre[lo:hi + 1]
        except ValueError:
            gaps.append("Pearl/Main anchor nodes not on the mall chain; "
                        "centreline not trimmed")
    # Deliberately NOT Douglas-Peucker simplified: Church Street is almost
    # dead straight, so any tolerance collapses it to its endpoints and the
    # game loses the per-block vertices it needs for orientation.
    centre = dedupe(centre, 0.5)
    log(f"CHURCH ST: centreline {len(centre)} pts, crossings {sorted(cross_xz)}")

    # ---- onChurch / side ------------------------------------------------
    if len(centre) >= 2:
        zmin = min(p[1] for p in centre) - 8
        zmax = max(p[1] for p in centre) + 8
        n_on = 0
        for b in buildings:
            bx0, bz0, bx1, bz1 = bbox_of(b["pts"])
            if bz1 < zmin or bz0 > zmax:
                continue
            if bx1 < min(p[0] for p in centre) - 60 or \
               bx0 > max(p[0] for p in centre) + 60:
                continue
            d = min(dist_to_polyline(px, pz, centre) for px, pz in b["pts"])
            if d <= ON_CHURCH_DIST:
                cx, cz = centroid(b["pts"])
                # centreline x at this z
                near = min(range(len(centre)),
                           key=lambda i: abs(centre[i][1] - cz))
                b["onChurch"] = True
                b["side"] = "E" if cx > centre[near][0] else "W"
                n_on += 1
        log(f"CHURCH ST: {n_on} buildings marked onChurch")

    # ---- POI -> building association ------------------------------------
    bidx = [(bbox_of(b["pts"]), b) for b in buildings]
    for p in pois:
        for (x0, z0, x1, z1), b in bidx:
            if x0 - 0.5 <= p["x"] <= x1 + 0.5 and z0 - 0.5 <= p["z"] <= z1 + 0.5:
                if point_in_ring(p["x"], p["z"], b["pts"]):
                    p["building"] = b["id"]
                    break

    # ---- world bbox -----------------------------------------------------
    allpts = []
    for coll in (buildings, areas):
        for o in coll:
            allpts += o["pts"]
    for coll in (roads, lines):
        for o in coll:
            allpts += o["pts"]
    for o in pois + props:
        allpts.append((o["x"], o["z"]))
    minX = min(p[0] for p in allpts); maxX = max(p[0] for p in allpts)
    minZ = min(p[1] for p in allpts); maxZ = max(p[1] for p in allpts)
    log(f"BBOX local: x {minX:.0f}..{maxX:.0f}  z {minZ:.0f}..{maxZ:.0f}")

    # ---- terrain --------------------------------------------------------
    x0 = math.floor((minX - TERRAIN_PAD) / TERRAIN_STEP) * TERRAIN_STEP
    z0 = math.floor((minZ - TERRAIN_PAD) / TERRAIN_STEP) * TERRAIN_STEP
    cols = int(math.ceil((maxX + TERRAIN_PAD - x0) / TERRAIN_STEP)) + 1
    rows = int(math.ceil((maxZ + TERRAIN_PAD - z0) / TERRAIN_STEP)) + 1
    log(f"TERRAIN: {cols} x {rows} @ {TERRAIN_STEP} m = {cols*rows} samples")

    tl_lat, tl_lon = unproj(x0, z0)
    br_lat, br_lon = unproj(x0 + (cols - 1) * TERRAIN_STEP,
                            z0 + (rows - 1) * TERRAIN_STEP)
    ebox = (min(tl_lat, br_lat) - 0.0006, min(tl_lon, br_lon) - 0.0006,
            max(tl_lat, br_lat) + 0.0006, max(tl_lon, br_lon) + 0.0006)

    sample = None
    elev_source = None
    try:
        blob = fetch_elev_tiff(ebox, ELEV_IMAGE_SIZE,
                               refresh=args.refresh or args.refresh_elev)
        grid, ulx, uly, sx, sy, nodata = read_geotiff_f32(blob)
        gh, gw = len(grid), len(grid[0])
        log(f"ELEV: grid {gw}x{gh}, ul=({uly:.5f},{ulx:.5f}) "
            f"px=({sy:.6f},{sx:.6f}) nodata={nodata}")

        def sample(lat, lon):
            fc = (lon - ulx) / sx - 0.5
            fr = (uly - lat) / sy - 0.5
            c0 = int(math.floor(fc)); r0 = int(math.floor(fr))
            tx, tz = fc - c0, fr - r0
            acc = wsum = 0.0
            for dr in (0, 1):
                for dc in (0, 1):
                    r, c = r0 + dr, c0 + dc
                    if not (0 <= r < gh and 0 <= c < gw):
                        continue
                    v = grid[r][c]
                    if v is None or v <= nodata + 1 or v < -100 or v > 3000:
                        continue
                    wgt = (tz if dr else 1 - tz) * (tx if dc else 1 - tx)
                    acc += v * wgt; wsum += wgt
            return acc / wsum if wsum > 1e-6 else None
        elev_source = "USGS 3DEP ImageServer exportImage (F32 GeoTIFF)"
    except Exception as exc:
        log(f"ELEV: exportImage path failed ({exc}); falling back to getSamples")
        gaps.append(f"3DEP exportImage failed: {exc}")

    heights = []
    if sample is not None:
        for r in range(rows):
            for c in range(cols):
                lat, lon = unproj(x0 + c * TERRAIN_STEP, z0 + r * TERRAIN_STEP)
                heights.append(sample(lat, lon))
    else:
        pts = [unproj(x0 + c * TERRAIN_STEP, z0 + r * TERRAIN_STEP)
               for r in range(rows) for c in range(cols)]
        try:
            heights = fetch_elev_getsamples(pts)
            elev_source = "USGS 3DEP ImageServer getSamples"
        except Exception as exc:
            log(f"ELEV: getSamples failed ({exc}); trying Open-Elevation")
            gaps.append(f"3DEP getSamples failed: {exc}")
            heights = fetch_elev_open_elevation(pts)
            elev_source = "Open-Elevation (SRTM) - 3DEP unreachable"

    # nearest-neighbour hole fill
    holes = [i for i, v in enumerate(heights) if v is None]
    if holes:
        log(f"ELEV: filling {len(holes)} no-data cells by nearest neighbour")
        gaps.append(f"{len(holes)} terrain cells had no elevation data; "
                    f"filled by nearest neighbour")
        known = deque(i for i, v in enumerate(heights) if v is not None)
        seenc = [v is not None for v in heights]
        while known:
            i = known.popleft()
            r, c = divmod(i, cols)
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols:
                    j = rr * cols + cc
                    if not seenc[j]:
                        seenc[j] = True
                        heights[j] = heights[i]
                        known.append(j)

    if not heights or all(h is None for h in heights):
        raise RuntimeError("no elevation data at all")

    # origin ground elevation, then convert to relative
    def terrain_abs_at(x, z):
        fc = (x - x0) / TERRAIN_STEP
        fr = (z - z0) / TERRAIN_STEP
        c0 = max(0, min(cols - 2, int(fc))); r0 = max(0, min(rows - 2, int(fr)))
        tx, tz = fc - c0, fr - r0
        h00 = heights[r0 * cols + c0]; h10 = heights[r0 * cols + c0 + 1]
        h01 = heights[(r0 + 1) * cols + c0]; h11 = heights[(r0 + 1) * cols + c0 + 1]
        return ((h00 * (1 - tx) + h10 * tx) * (1 - tz) +
                (h01 * (1 - tx) + h11 * tx) * tz)

    origin_elev = terrain_abs_at(0.0, 0.0)
    log(f"ELEV: origin ground elevation {origin_elev:.2f} m")
    lo, hi = min(heights), max(heights)
    log(f"ELEV: absolute range {lo:.1f} .. {hi:.1f} m")
    if not (20 <= lo <= 80 and 40 <= hi <= 160):
        gaps.append(f"elevation range {lo:.1f}..{hi:.1f} m looks unusual for "
                    f"downtown Burlington (expect ~29 m lake to ~110 m)")

    rel_heights = [h - origin_elev for h in heights]

    # ---- elevation sanity table ----------------------------------------
    SANITY = [("Church & Pearl", "Church Street", "Pearl Street"),
              ("Church & Cherry", "Church Street", "Cherry Street"),
              ("Church & Bank", "Church Street", "Bank Street"),
              ("Church & College", "Church Street", "College Street"),
              ("Church & Main", "Church Street", "Main Street"),
              ("St Paul & Main", "Saint Paul Street", "Main Street"),
              ("Battery & Main", "Battery Street", "Main Street"),
              ("S Winooski & Main", "South Winooski Avenue", "Main Street"),
              ("Pine & College", "Pine Street", "College Street")]
    sanity_rows = []
    for label, a, b in SANITY:
        hits = intersection_nodes(a, b)
        if not hits:
            sanity_rows.append((label, None, None, None, None, "no OSM node"))
            gaps.append(f"sanity point '{label}': no shared OSM node")
            continue
        ll = node_latlon(hits[0])
        x, z = proj(*ll)
        ab = terrain_abs_at(x, z)
        sanity_rows.append((label, x, z, ab, ab - origin_elev, ""))

    print()
    print("ELEVATION SANITY TABLE (USGS 3DEP)")
    print(f"{'intersection':<20}{'x (m E)':>10}{'z (m S)':>10}"
          f"{'abs (m)':>10}{'rel y (m)':>11}  note")
    for label, x, z, ab, rel, note in sanity_rows:
        if x is None:
            print(f"{label:<20}{'-':>10}{'-':>10}{'-':>10}{'-':>11}  {note}")
        else:
            print(f"{label:<20}{x:>10.1f}{z:>10.1f}{ab:>10.1f}{rel:>11.1f}  {note}")
    print()

    # ---- automatic gap detection ----------------------------------------
    # Record what OSM does *not* have, so the game lead knows what has to be
    # authored by hand rather than assumed present.
    from collections import Counter as _C
    pk = _C(p["kind"] for p in props)
    for kind, why in [
        ("natural:tree", "the mall's double row of street trees"),
        ("highway:street_lamp", "the mall's lamp posts"),
        ("man_made:planter", "the mall's concrete planters"),
        ("amenity:fountain", "fountains"),
    ]:
        if pk.get(kind, 0) == 0:
            gaps.append(f"OSM has ZERO {kind} nodes in this bbox - {why} "
                        f"must be placed by hand")
    if pk.get("amenity:bench", 0) < 30:
        gaps.append(f"only {pk.get('amenity:bench', 0)} amenity=bench nodes in "
                    f"the whole bbox; the real Marketplace has far more")
    n_default = sum(1 for b in buildings if b["hsrc"] == "default")
    if n_default:
        named = [b for b in buildings if b["hsrc"] == "default" and b.get("name")]
        gaps.append(f"{n_default} of {len(buildings)} buildings have neither "
                    f"height nor building:levels in OSM and use the "
                    f"7 m / 8 m fallback (hsrc:'default'); "
                    f"{len(buildings) - n_default - sum(1 for b in buildings if b['hsrc']=='levels')}"
                    f" have a surveyed height")
        for b in named[:8]:
            gaps.append(f"    guessed height: {b['name']} ({b['id']}) "
                        f"baked at {b['h']:.0f} m")
    n_anon = sum(1 for b in buildings if b.get("onChurch") and not b.get("name"))
    if n_anon:
        gaps.append(f"{n_anon} of the {sum(1 for b in buildings if b.get('onChurch'))} "
                    f"Church St mall buildings have no name tag (their "
                    f"storefronts are tagged as separate POI nodes instead)")
    for a in areas:
        if a["kind"] == "landuse:construction":
            cx, cz = centroid(a["pts"])
            gaps.append(f"active construction site "
                        f"'{a.get('name') or 'unnamed'}' at x={cx:.0f} z={cz:.0f} "
                        f"- footprints here may not match the street today")

    # ---- assemble WORLD -------------------------------------------------
    world = {
        "origin": {"lat": round(olat, 7), "lon": round(olon, 7),
                   "elev_m": round(origin_elev, 2), "osm_node": origin_node},
        "bbox": {"minX": r1(minX), "maxX": r1(maxX),
                 "minZ": r1(minZ), "maxZ": r1(maxZ)},
        "attribution": ["© OpenStreetMap contributors (ODbL)",
                        "Elevation: USGS 3DEP"],
        "terrain": {"x0": r1(x0), "z0": r1(z0), "step": TERRAIN_STEP,
                    "cols": cols, "rows": rows,
                    "heights": [r1(h) for h in rel_heights]},
        "churchStreet": {
            "centerline": [[r1(x), r1(z)] for x, z in centre],
            "crossings": {k: [r1(v[0]), r1(v[1])] for k, v in cross_xz.items()},
        },
        "roads": roads,
        "areas": areas,
        "buildings": buildings,
        "pois": pois,
        "props": props,
        "lines": lines,
    }

    # ---- write world.js (one line per top-level array) ------------------
    def arr(name, items):
        return f'"{name}":[\n' + ",\n".join(jd(i) for i in items) + "\n]"

    parts = [
        # NB: not passed through jd()/compact() - those round to 0.1, which is
        # right for metres and catastrophic for degrees of latitude.
        '"origin":' + json.dumps(world["origin"], separators=(",", ":")),
        f'"bbox":{jd(world["bbox"])}',
        f'"attribution":{jd(world["attribution"])}',
        '"terrain":{' + ",".join([
            f'"x0":{jd(world["terrain"]["x0"])}',
            f'"z0":{jd(world["terrain"]["z0"])}',
            f'"step":{jd(world["terrain"]["step"])}',
            f'"cols":{cols}', f'"rows":{rows}',
            '"heights":' + jd(world["terrain"]["heights"]),
        ]) + "}",
        f'"churchStreet":{jd(world["churchStreet"])}',
        arr("roads", roads),
        arr("areas", areas),
        arr("buildings", buildings),
        arr("pois", pois),
        arr("props", props),
        arr("lines", lines),
    ]
    body = "{\n" + ",\n".join(parts) + "\n}"
    out = os.path.join(DATA, "world.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_world.py - do not edit by hand.\n")
        f.write("// Data (c) OpenStreetMap contributors, ODbL. "
                "Elevation: USGS 3DEP (public domain).\n")
        f.write("// +x = metres east of origin, +z = metres south, "
                "+y = metres above the origin's ground level.\n")
        f.write("export const WORLD = " + body + ";\n")
        f.write("export default WORLD;\n")
    size = os.path.getsize(out)
    log(f"WROTE {out} ({size/1e6:.2f} MB)")

    # ---- summary --------------------------------------------------------
    write_summary(world, sanity_rows, elev_source, gaps, centre, cross_xz,
                  origin_node, origin_elev, size)
    return 0


def write_summary(world, sanity_rows, elev_source, gaps, centre, cross_xz,
                  origin_node, origin_elev, world_size):
    from collections import Counter
    L = []
    A = L.append
    A("church-street-skate - world.js build summary")
    A("=" * 62)
    A(f"generated : {time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    A(f"world.js  : {world_size:,} bytes ({world_size/1e6:.2f} MB)")
    A(f"origin    : OSM node {origin_node} @ "
      f"{world['origin']['lat']}, {world['origin']['lon']}  "
      f"(ground {origin_elev:.2f} m ASL = local y 0)")
    b = world["bbox"]
    A(f"local bbox: x {b['minX']} .. {b['maxX']} m east, "
      f"z {b['minZ']} .. {b['maxZ']} m south")
    t = world["terrain"]
    A(f"terrain   : {t['cols']} x {t['rows']} @ {t['step']} m "
      f"({len(t['heights']):,} samples)  source: {elev_source}")
    A("")
    A("COUNTS")
    A("-" * 62)
    for k in ("roads", "areas", "buildings", "pois", "props", "lines"):
        A(f"  {k:<12} {len(world[k]):>6}")
    A(f"  {'church ctr':<12} {len(centre):>6} points")
    A("")

    def tally(items, key, top=None):
        c = Counter(i.get(key) for i in items if i.get(key))
        return c.most_common(top)

    A("roads by highway kind")
    for k, n in tally(world["roads"], "kind"):
        A(f"    {k:<24}{n:>5}")
    A("")
    A("areas by kind")
    for k, n in tally(world["areas"], "kind"):
        A(f"    {k:<24}{n:>5}")
    A("")
    A("props by kind")
    for k, n in tally(world["props"], "kind"):
        A(f"    {k:<24}{n:>5}")
    A("")
    A("lines by kind")
    for k, n in tally(world["lines"], "kind"):
        A(f"    {k:<24}{n:>5}")
    A("")
    A("pois by kind (top 40)")
    for k, n in tally(world["pois"], "kind", 40):
        A(f"    {k:<24}{n:>5}")
    A("")
    nb = sum(1 for x in world["buildings"] if x.get("onChurch"))
    A(f"buildings on Church St mall: {nb} "
      f"(E {sum(1 for x in world['buildings'] if x.get('side')=='E')} / "
      f"W {sum(1 for x in world['buildings'] if x.get('side')=='W')})")
    A(f"buildings with a name      : "
      f"{sum(1 for x in world['buildings'] if x.get('name'))}")
    A("")
    A("ELEVATION SANITY TABLE (USGS 3DEP, metres)")
    A("-" * 62)
    A(f"{'intersection':<20}{'x (E)':>9}{'z (S)':>9}{'abs ASL':>10}{'rel y':>9}")
    for label, x, z, ab, rel, note in sanity_rows:
        if x is None:
            A(f"{label:<20}{'-':>9}{'-':>9}{'-':>10}{'-':>9}  {note}")
        else:
            A(f"{label:<20}{x:>9.1f}{z:>9.1f}{ab:>10.1f}{rel:>9.1f}")
    A("")

    # ---- Church Street POIs -------------------------------------------
    A("NAMED POIs ON THE CHURCH STREET MALL (Pearl -> Main)")
    A("-" * 62)
    A("east side first, then west side; each list ordered north -> south.")
    A("x = metres east of Church&College, z = metres south.")
    A("")
    if len(centre) >= 2:
        zmin = min(p[1] for p in centre) - 10
        zmax = max(p[1] for p in centre) + 10
        east, west = [], []
        for p in world["pois"]:
            if not (zmin <= p["z"] <= zmax):
                continue
            d = dist_to_polyline(p["x"], p["z"], centre)
            if d > 30:
                continue
            near = min(range(len(centre)), key=lambda i: abs(centre[i][1] - p["z"]))
            (east if p["x"] > centre[near][0] else west).append((p, d))
        for label, coll in (("EAST SIDE", east), ("WEST SIDE", west)):
            coll.sort(key=lambda pd: pd[0]["z"])
            A(f"{label}  ({len(coll)})")
            A(f"  {'name':<36}{'kind':<22}{'x':>8}{'z':>8}  building")
            for p, d in coll:
                A(f"  {(p['name'] or '')[:35]:<36}{p['kind'][:21]:<22}"
                  f"{p['x']:>8.1f}{p['z']:>8.1f}  {p.get('building') or ''}")
            A("")
    A("")
    A("CHURCH STREET CROSSINGS (local x, z)")
    for k in CROSS_STREETS:
        if k in cross_xz:
            A(f"  {k:<10}{cross_xz[k][0]:>9.1f}{cross_xz[k][1]:>9.1f}")
        else:
            A(f"  {k:<10}  (not found)")
    A("")
    A("KNOWN GAPS / NOTES")
    A("-" * 62)
    if gaps:
        for g in gaps:
            A(f"  - {g}")
    else:
        A("  - none recorded")
    A("")
    A("Attribution required when shipping this data:")
    for a in world["attribution"]:
        A(f"  {a}")

    out = os.path.join(DATA, "world-summary.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    log(f"WROTE {out} ({os.path.getsize(out)/1000:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
