import L from "leaflet";
import "leaflet/dist/leaflet.css";
import luck from "./_luck.ts";

const CLASSROOM: L.LatLngTuple = [36.9916, -122.0583];
const CELL_SIZE_DEG = 0.0001;
const INTERACT_RADIUS_CELLS = 3;
const LABEL_RADIUS_CELLS = 5;
const TARGET_VALUES = new Set([8, 16]);
const GAME_SEED = 12125;

const app = document.getElementById("app") ?? document.body;
const hudDiv = document.createElement("div");
hudDiv.id = "hud";
hudDiv.style.cssText =
  "position:fixed;left:12px;top:12px;z-index:1000;background:rgba(255,255,255,.9);padding:6px 10px;border-radius:8px;font-family:sans-serif;font-size:14px;";
app.appendChild(hudDiv);

const msgDiv = document.createElement("div");
msgDiv.id = "msg";
msgDiv.style.cssText =
  "position:fixed;left:50%;top:12px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:white;padding:6px 10px;border-radius:8px;font-family:sans-serif;font-size:14px;z-index:1000;opacity:0;transition:opacity .2s;";
app.appendChild(msgDiv);

const mapEl = document.getElementById("map") as HTMLElement;
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
if (mapEl) mapEl.style.height = "100%";

const map = L.map(mapEl).setView(CLASSROOM, 18);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
  minZoom: 0,
  crossOrigin: true,
  errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
}).addTo(map);

addEventListener("resize", () => map.invalidateSize());

const canvasRenderer = L.canvas();
const gridLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);

const LS_DELTA = "d3a_deltas";
const LS_INV = "d3a_inv";

type CellKey = string;
type Delta = Record<CellKey, number | null>;

function cellKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}
function worldToCell(lat: number, lng: number): [number, number] {
  const i = Math.floor((lat - CLASSROOM[0]) / CELL_SIZE_DEG);
  const j = Math.floor((lng - CLASSROOM[1]) / CELL_SIZE_DEG);
  return [i, j];
}
function cellToWorld(i: number, j: number): [number, number] {
  const lat = CLASSROOM[0] + i * CELL_SIZE_DEG;
  const lng = CLASSROOM[1] + j * CELL_SIZE_DEG;
  return [lat, lng];
}
function loadDeltas(): Delta {
  try {
    return JSON.parse(localStorage.getItem(LS_DELTA) || "{}");
  } catch {
    return {};
  }
}
function saveDeltas(d: Delta) {
  localStorage.setItem(LS_DELTA, JSON.stringify(d));
}
function loadInv(): number | null {
  const v = localStorage.getItem(LS_INV);
  return v ? Number(v) : null;
}
function saveInv(v: number | null) {
  if (v === null) localStorage.removeItem(LS_INV);
  else localStorage.setItem(LS_INV, v.toString());
}

const deltas = loadDeltas();
let held = loadInv();

function toast(t: string) {
  msgDiv.textContent = t;
  msgDiv.style.opacity = "1";
  setTimeout(() => {
    msgDiv.style.opacity = "0";
  }, 1000);
}
function setHud() {
  hudDiv.textContent = held ? `Holding: ${held}` : "Holding: (empty)";
}
setHud();

function baseValue(i: number, j: number) {
  const r = luck(`${GAME_SEED}|${i}|${j}`);
  if (r < 0.6) return null;
  if (r < 0.85) return 1;
  if (r < 0.95) return 2;
  if (r < 0.99) return 4;
  return 8;
}
function getCellValue(i: number, j: number): number | null {
  const key = cellKey(i, j);
  if (key in deltas) return deltas[key] ?? null;
  return baseValue(i, j);
}
function setCellValue(i: number, j: number, v: number | null) {
  const key = cellKey(i, j);
  deltas[key] = v;
  saveDeltas(deltas);
}
function setHeld(v: number | null) {
  held = v;
  saveInv(v);
  setHud();
}

const player = L.circleMarker(CLASSROOM, { radius: 6, color: "blue" }).addTo(
  map,
);
player.bindTooltip("You");

function inRange(i: number, j: number): boolean {
  const [pi, pj] = worldToCell(CLASSROOM[0], CLASSROOM[1]);
  return Math.abs(i - pi) <= INTERACT_RADIUS_CELLS &&
    Math.abs(j - pj) <= INTERACT_RADIUS_CELLS;
}
function nearForLabel(i: number, j: number): boolean {
  const [pi, pj] = worldToCell(CLASSROOM[0], CLASSROOM[1]);
  return Math.abs(i - pi) <= LABEL_RADIUS_CELLS &&
    Math.abs(j - pj) <= LABEL_RADIUS_CELLS;
}

function onCellClick(i: number, j: number) {
  if (!inRange(i, j)) {
    toast("Too far");
    return;
  }
  const v = getCellValue(i, j);
  if (v === null && held !== null) {
    setCellValue(i, j, held);
    setHeld(null);
    toast("Placed");
    scheduleRender();
  } else if (v !== null && held === null) {
    setCellValue(i, j, null);
    setHeld(v);
    toast(`Picked up ${v}`);
    scheduleRender();
  } else if (v !== null && held !== null) {
    if (v === held) {
      setCellValue(i, j, v * 2);
      setHeld(null);
      toast(`Crafted ${v * 2}`);
      scheduleRender();
      if (TARGET_VALUES.has(v * 2)) toast(`You made ${v * 2}!`);
    } else toast("Doesn't match");
  }
}

const rects = new Map<CellKey, L.Rectangle>();
const labels = new Map<CellKey, L.Marker>();

function styleFor(i: number, j: number, v: number | null): L.PathOptions {
  const near = inRange(i, j);
  const color = near ? "#222" : "#777";
  const fillColor = v === null
    ? "#dddddd"
    : v >= 16
    ? "#7fbf7f"
    : v >= 8
    ? "#9fd3ff"
    : v >= 4
    ? "#ffd27f"
    : v >= 2
    ? "#ffb3b3"
    : "#e8e8e8";
  return {
    color,
    weight: near ? 1 : 0.5,
    fillOpacity: v === null ? 0 : 0.12,
    fillColor,
    renderer: canvasRenderer,
  };
}

function drawOrUpdateCell(i: number, j: number) {
  const k = cellKey(i, j);
  const v = getCellValue(i, j);
  const [lat, lng] = cellToWorld(i, j);
  const bounds = [[lat, lng], [
    lat + CELL_SIZE_DEG,
    lng + CELL_SIZE_DEG,
  ]] as L.LatLngBoundsExpression;
  let r = rects.get(k);
  if (!r) {
    r = L.rectangle(bounds, styleFor(i, j, v)).addTo(gridLayer);
    r.on("click", () => onCellClick(i, j));
    rects.set(k, r);
  } else {
    r.setBounds(bounds);
    r.setStyle(styleFor(i, j, v));
  }
  const showLabel = v !== null && nearForLabel(i, j);
  let m = labels.get(k);
  if (showLabel) {
    const center = L.rectangle(bounds).getBounds().getCenter();
    const html =
      `<div style="background:rgba(255,255,255,.92);padding:2px 4px;border-radius:6px;font:600 12px/1 system-ui,sans-serif;">${v}</div>`;
    if (!m) {
      m = L.marker(center, {
        interactive: false,
        icon: L.divIcon({ className: "cell-label", html, iconSize: [24, 24] }),
      }).addTo(labelLayer);
      labels.set(k, m);
    } else {
      m.setLatLng(center);
      const el = m.getElement() as HTMLElement | null;
      if (el && el.innerHTML !== html) el.innerHTML = html;
    }
  } else if (m) {
    m.remove();
    labels.delete(k);
  }
}

function cullOffscreen(keep: Set<string>) {
  for (const k of rects.keys()) {
    if (!keep.has(k)) {
      rects.get(k)?.remove();
      rects.delete(k);
    }
  }
  for (const k of labels.keys()) {
    if (!keep.has(k)) {
      labels.get(k)?.remove();
      labels.delete(k);
    }
  }
}

function renderCells() {
  const b = map.getBounds();
  const iMin = Math.floor((b.getSouth() - CLASSROOM[0]) / CELL_SIZE_DEG);
  const iMax = Math.floor((b.getNorth() - CLASSROOM[0]) / CELL_SIZE_DEG);
  const jMin = Math.floor((b.getWest() - CLASSROOM[1]) / CELL_SIZE_DEG);
  const jMax = Math.floor((b.getEast() - CLASSROOM[1]) / CELL_SIZE_DEG);
  const keep = new Set<string>();
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      keep.add(cellKey(i, j));
      drawOrUpdateCell(i, j);
    }
  }
  cullOffscreen(keep);
}

let raf = 0;
function scheduleRender() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderCells();
  });
}

map.on("move", scheduleRender);
map.on("moveend", scheduleRender);
scheduleRender();

type G = typeof globalThis & { d3aReset: () => void };
const g = globalThis as G;
g.d3aReset = () => {
  localStorage.removeItem(LS_DELTA);
  localStorage.removeItem(LS_INV);
  location.reload();
};
