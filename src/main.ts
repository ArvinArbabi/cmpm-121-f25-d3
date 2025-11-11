import L from "leaflet";
import "leaflet/dist/leaflet.css";
import luck from "./_luck.ts";

const CLASSROOM: L.LatLngTuple = [36.9916, -122.0583];
const CELL_SIZE_DEG = 0.0001;
const INTERACT_RADIUS_CELLS = 3;
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
    renderCells();
  } else if (v !== null && held === null) {
    setCellValue(i, j, null);
    setHeld(v);
    toast(`Picked up ${v}`);
    renderCells();
  } else if (v !== null && held !== null) {
    if (v === held) {
      setCellValue(i, j, v * 2);
      setHeld(null);
      toast(`Crafted ${v * 2}`);
      renderCells();
      if (TARGET_VALUES.has(v * 2)) toast(`You made ${v * 2}!`);
    } else {
      toast("Doesn't match");
    }
  }
}

const cellLayers: Record<CellKey, L.Rectangle> = {};

function renderCells() {
  const bounds = map.getBounds();
  const latMin = bounds.getSouth();
  const latMax = bounds.getNorth();
  const lngMin = bounds.getWest();
  const lngMax = bounds.getEast();
  const iMin = Math.floor((latMin - CLASSROOM[0]) / CELL_SIZE_DEG);
  const iMax = Math.floor((latMax - CLASSROOM[0]) / CELL_SIZE_DEG);
  const jMin = Math.floor((lngMin - CLASSROOM[1]) / CELL_SIZE_DEG);
  const jMax = Math.floor((lngMax - CLASSROOM[1]) / CELL_SIZE_DEG);
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const key = cellKey(i, j);
      let rect = cellLayers[key];
      const [lat, lng] = cellToWorld(i, j);
      const cellBounds = [
        [lat, lng],
        [lat + CELL_SIZE_DEG, lng + CELL_SIZE_DEG],
      ] as L.LatLngBoundsExpression;
      const val = getCellValue(i, j);
      const color = inRange(i, j) ? "black" : "gray";
      if (!rect) {
        rect = L.rectangle(cellBounds, {
          color,
          weight: 0.5,
          fillOpacity: 0.1,
        });
        rect.addTo(map);
        rect.on("click", () => onCellClick(i, j));
        cellLayers[key] = rect;
      } else {
        rect.setBounds(cellBounds);
      }
      const label = val === null ? "" : val.toString();
      rect.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: "cell-label",
      }).openTooltip();
    }
  }
}

map.on("moveend", renderCells);
renderCells();

type G = typeof globalThis & { d3aReset: () => void };
const g = globalThis as G;
g.d3aReset = () => {
  localStorage.removeItem(LS_DELTA);
  localStorage.removeItem(LS_INV);
  location.reload();
};
