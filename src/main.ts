import L from "leaflet";
import "leaflet/dist/leaflet.css";
import luck from "./_luck.ts";

const START_POS: L.LatLngTuple = [36.9916, -122.0583];
const CELL_SIZE_DEG = 0.0001;
const INTERACT_RADIUS_CELLS = 3;
const LABEL_RADIUS_CELLS = 8;
const VICTORY_VALUE = 32;
const GAME_SEED = 12125;

type CellKey = string;
type CellMemento = {
  value: number | null;
};

const app = document.getElementById("app") ?? document.body;

const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;left:12px;top:12px;z-index:1000;background:rgba(255,255,255,.9);padding:6px 10px;border-radius:8px;font:14px system-ui,sans-serif";
app.appendChild(hud);

const msg = document.createElement("div");
msg.style.cssText =
  "position:fixed;left:50%;top:12px;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:6px 10px;border-radius:8px;font:14px system-ui,sans-serif;z-index:1000;opacity:0;transition:opacity .2s";
app.appendChild(msg);

const controls = document.createElement("div");
controls.style.cssText =
  "position:fixed;right:12px;top:12px;z-index:1000;display:grid;grid-template-columns:repeat(3,36px);grid-auto-rows:36px;gap:6px";
app.appendChild(controls);

function mkBtn(t: string, on: () => void) {
  const b = document.createElement("button");
  b.textContent = t;
  b.style.cssText =
    "background:#fff;border:1px solid #ccc;border-radius:8px;cursor:pointer";
  b.onclick = on;
  controls.appendChild(b);
}

mkBtn("", () => {});
mkBtn("↑", () => moveBy(1, 0));
mkBtn("", () => {});
mkBtn("←", () => moveBy(0, -1));
mkBtn("•", () => centerOnPlayer());
mkBtn("→", () => moveBy(0, 1));
mkBtn("", () => {});
mkBtn("↓", () => moveBy(-1, 0));
mkBtn("", () => {});

const mapEl = document.getElementById("map") as HTMLElement;
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
if (mapEl) mapEl.style.height = "100%";

const map = L.map(mapEl).setView(START_POS, 18);

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

function cellKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}

function worldToCell(lat: number, lng: number): [number, number] {
  const i = Math.floor(lat / CELL_SIZE_DEG);
  const j = Math.floor(lng / CELL_SIZE_DEG);
  return [i, j];
}

function cellToWorld(i: number, j: number): [number, number] {
  return [i * CELL_SIZE_DEG, j * CELL_SIZE_DEG];
}

const cellStates = new Map<CellKey, CellMemento>();
let held: number | null = null;
let playerPos: L.LatLngTuple = START_POS;

function toast(t: string) {
  msg.textContent = t;
  msg.style.opacity = "1";
  setTimeout(() => {
    msg.style.opacity = "0";
  }, 1000);
}

function setHud() {
  hud.textContent = held ? `Holding: ${held}` : "Holding: (empty)";
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
  const k = cellKey(i, j);
  const m = cellStates.get(k);
  if (m) return m.value;
  return baseValue(i, j);
}

function setCellValue(i: number, j: number, v: number | null) {
  const k = cellKey(i, j);
  cellStates.set(k, { value: v });
}

const player = L.circleMarker(playerPos, { radius: 6, color: "blue" }).addTo(
  map,
);
player.bindTooltip("You");

function inRange(i: number, j: number): boolean {
  const [pi, pj] = worldToCell(playerPos[0], playerPos[1]);
  return Math.abs(i - pi) <= INTERACT_RADIUS_CELLS &&
    Math.abs(j - pj) <= INTERACT_RADIUS_CELLS;
}

function nearForLabel(i: number, j: number): boolean {
  const [pi, pj] = worldToCell(playerPos[0], playerPos[1]);
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
    held = null;
    setHud();
    toast("Placed");
    scheduleRender();
  } else if (v !== null && held === null) {
    setCellValue(i, j, null);
    held = v;
    setHud();
    toast(`Picked up ${v}`);
    scheduleRender();
  } else if (v !== null && held !== null) {
    if (v === held) {
      const nv = v * 2;
      setCellValue(i, j, nv);
      held = null;
      setHud();
      toast(`Crafted ${nv}`);
      scheduleRender();
      if (nv >= VICTORY_VALUE) toast("Victory!");
    } else {
      toast("Doesn't match");
    }
  }
}

const rects = new Map<CellKey, L.Rectangle>();
const labels = new Map<CellKey, L.Marker>();

function styleFor(i: number, j: number, v: number | null): L.PathOptions {
  const near = inRange(i, j);
  const color = near ? "#222" : "#777";
  const fillColor = v === null
    ? "#dddddd"
    : v >= 32
    ? "#7ad17a"
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
  const show = v !== null && nearForLabel(i, j);
  let m = labels.get(k);
  if (show) {
    const center = L.rectangle(bounds).getBounds().getCenter();
    const html =
      `<div style="background:rgba(255,255,255,.92);padding:2px 4px;border-radius:6px;font:600 12px/1 system-ui,sans-serif">${v}</div>`;
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
  const iMin = Math.floor(b.getSouth() / CELL_SIZE_DEG);
  const iMax = Math.floor(b.getNorth() / CELL_SIZE_DEG);
  const jMin = Math.floor(b.getWest() / CELL_SIZE_DEG);
  const jMax = Math.floor(b.getEast() / CELL_SIZE_DEG);
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

function moveBy(di: number, dj: number) {
  const [i, j] = worldToCell(playerPos[0], playerPos[1]);
  const [lat, lng] = cellToWorld(i + di, j + dj);
  playerPos = [lat + CELL_SIZE_DEG / 2, lng + CELL_SIZE_DEG / 2];
  player.setLatLng(playerPos);
  scheduleRender();
}

function centerOnPlayer() {
  map.panTo(playerPos);
}

map.on("move", scheduleRender);
map.on("moveend", scheduleRender);
scheduleRender();
