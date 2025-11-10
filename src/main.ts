import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CLASSROOM: L.LatLngExpression = [36.9916, -122.0583];
const CELL_SIZE_DEG = 0.0001;
const INTERACT_RADIUS_CELLS = 3;
const TARGET_VALUES = new Set([8, 16]);
const GAME_SEED = 12125;

const app = document.getElementById("app") ?? document.body;
const hudDiv = document.createElement("div");
hudDiv.id = "hud";
hudDiv.style.cssText =
  "position:fixed;left:12px;top:12px;z-index:1000;background:rgba(255,255,255,.9);padding:6px 10px;border-radius:8px;font:600 14px/1.2 system-ui,sans-serif;";
app.appendChild(hudDiv);
const msgDiv = document.createElement("div");
msgDiv.id = "msg";
msgDiv.style.cssText =
  "position:fixed;left:50%;top:12px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:6px 10px;border-radius:8px;z-index:1000;opacity:0;transition:opacity .2s;font:600 13px/1 system-ui,sans-serif;";
app.appendChild(msgDiv);
const mapEl = document.getElementById("map") as HTMLDivElement;
function ensureFullScreen() {
  document.documentElement.style.height = "100%";
  document.body.style.height = "100%";
  if (mapEl) {
    mapEl.style.position = "absolute";
    mapEl.style.top = "0";
    mapEl.style.left = "0";
    mapEl.style.right = "0";
    mapEl.style.bottom = "0";
    mapEl.style.height = "100%";
    mapEl.style.width = "100%";
  }
}
ensureFullScreen();
const map = L.map(mapEl ?? document.body).setView(CLASSROOM, 18);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 20,
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
setTimeout(() => map.invalidateSize(), 0);
addEventListener("resize", () => map.invalidateSize());
const player = L.circleMarker(CLASSROOM, { radius: 6 }).addTo(map);
player.bindTooltip("You", {
  permanent: true,
  direction: "top",
  offset: [0, -8],
});

function hash32(i: number, j: number, seed = GAME_SEED): number {
  let h =
    (Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ (seed | 0)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const rng01 = (h: number) => (h >>> 0) / 4294967296;

function baseTokenForCell(i: number, j: number): number {
  const h = hash32(i, j);
  const r = rng01(h);
  if (r < 0.45) return 0;
  const bucket = rng01(hash32(i ^ 0x9e37, j ^ 0x9e37));
  if (bucket < 0.6) return 1;
  if (bucket < 0.85) return 2;
  if (bucket < 0.95) return 4;
  if (bucket < 0.99) return 8;
  return 16;
}

const LS_INV = "d3a.inv";
const LS_DELTA = "d3a.delta";
type Delta = Record<string, { v: number }>;
const loadInv = () => +(localStorage.getItem(LS_INV) ?? "0");
const saveInv = (v: number) => localStorage.setItem(LS_INV, String(v));
const loadDelta = (): Delta => {
  try {
    return JSON.parse(localStorage.getItem(LS_DELTA) ?? "{}");
  } catch {
    return {};
  }
};
const saveDelta = (d: Delta) =>
  localStorage.setItem(LS_DELTA, JSON.stringify(d));
const delta = loadDelta();

const keyOf = (i: number, j: number) => `${i},${j}`;
const getCellValue = (i: number, j: number) =>
  delta[keyOf(i, j)]?.v ?? baseTokenForCell(i, j);
const setCellValue = (i: number, j: number, v: number) => {
  delta[keyOf(i, j)] = { v };
  saveDelta(delta);
  redrawCell(i, j);
};

const latToI = (lat: number) => Math.floor(lat / CELL_SIZE_DEG);
const lngToJ = (lng: number) => Math.floor(lng / CELL_SIZE_DEG);
const ijToBounds = (
  i: number,
  j: number,
): L.LatLngBoundsExpression => [[i * CELL_SIZE_DEG, j * CELL_SIZE_DEG], [
  (i + 1) * CELL_SIZE_DEG,
  (j + 1) * CELL_SIZE_DEG,
]];
const playerId = {
  i: latToI((CLASSROOM as [number, number])[0]),
  j: lngToJ((CLASSROOM as [number, number])[1]),
};
const chebyshev = (a: { i: number; j: number }, b: { i: number; j: number }) =>
  Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));

const gridLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);
const cellToRect = new Map<string, L.Rectangle>();
const cellToLabel = new Map<string, L.Marker>();

function styleForCell(i: number, j: number): L.PathOptions {
  const v = getCellValue(i, j);
  const near = chebyshev({ i, j }, playerId) <= INTERACT_RADIUS_CELLS;
  return {
    color: near ? "#333" : "#777",
    weight: near ? 1 : 0.5,
    fill: v > 0,
    fillOpacity: v > 0 ? 0.12 : 0,
    fillColor: v >= 16
      ? "#7fbf7f"
      : v >= 8
      ? "#9fd3ff"
      : v >= 4
      ? "#ffd27f"
      : v >= 2
      ? "#ffb3b3"
      : "#dddddd",
  };
}
const labelHtml = (
  v: number,
) => (v > 0
  ? `<div class="v" style="background:rgba(255,255,255,.92);padding:2px 4px;border-radius:6px;font:600 12px/1 system-ui,sans-serif;">${v}</div>`
  : "");

function drawCell(i: number, j: number) {
  const k = keyOf(i, j);
  const bounds = ijToBounds(i, j);
  const rect = L.rectangle(bounds, styleForCell(i, j)).addTo(gridLayer);
  rect.on("click", () => onCellClick(i, j));
  cellToRect.set(k, rect);
  const center = L.rectangle(bounds).getBounds().getCenter();
  const label = L.marker(center, {
    interactive: false,
    icon: L.divIcon({
      className: "cell-label",
      html: labelHtml(getCellValue(i, j)),
      iconSize: [24, 24],
    }),
  }).addTo(labelLayer);
  cellToLabel.set(k, label);
}
function redrawCell(i: number, j: number) {
  const k = keyOf(i, j);
  const r = cellToRect.get(k);
  const m = cellToLabel.get(k);
  if (r) r.setStyle(styleForCell(i, j));
  if (m) {
    const el = m.getElement() as HTMLElement | null;
    if (el) el.innerHTML = labelHtml(getCellValue(i, j));
  }
}
function cellsInView(): Array<{ i: number; j: number }> {
  const b = map.getBounds();
  const i0 = latToI(b.getSouth()), i1 = latToI(b.getNorth());
  const j0 = lngToJ(b.getWest()), j1 = lngToJ(b.getEast());
  const ids: Array<{ i: number; j: number }> = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) ids.push({ i, j });
  }
  return ids;
}
function refreshGrid() {
  gridLayer.clearLayers();
  labelLayer.clearLayers();
  cellToRect.clear();
  cellToLabel.clear();
  for (const { i, j } of cellsInView()) drawCell(i, j);
}
map.on("moveend", refreshGrid);
refreshGrid();

let held = loadInv();
function setHeld(v: number) {
  held = v;
  saveInv(held);
  hudDiv.textContent = held > 0 ? `Holding: ${held}` : "Holding: (empty)";
  if (held > 0 && TARGET_VALUES.has(held)) toast(`You now hold ${held}`);
}
setHeld(held);

function toast(text: string) {
  msgDiv.textContent = text;
  msgDiv.style.opacity = "1";
  setTimeout(() => {
    msgDiv.style.opacity = "0";
  }, 1200);
}

function onCellClick(i: number, j: number) {
  if (chebyshev({ i, j }, playerId) > INTERACT_RADIUS_CELLS) {
    toast("Too far");
    return;
  }
  const v = getCellValue(i, j);
  if (held === 0) {
    if (v > 0) {
      setHeld(v);
      setCellValue(i, j, 0);
      toast(`Picked up ${v}`);
    } else toast("Empty");
    return;
  }
  if (v === 0) {
    setCellValue(i, j, held);
    setHeld(0);
    toast("Placed token");
    return;
  }
  if (v === held) {
    setCellValue(i, j, v * 2);
    setHeld(0);
    toast(`Crafted ${v * 2}`);
    return;
  }
  toast("Doesn't match");
}

type G = typeof globalThis & { d3aReset: () => void };
const g = globalThis as G;
g.d3aReset = () => {
  localStorage.removeItem(LS_DELTA);
  localStorage.removeItem(LS_INV);
  location.reload();
};
