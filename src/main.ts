import L from "leaflet";
import "leaflet/dist/leaflet.css";
import luck from "./_luck.ts";

const START_POS: L.LatLngTuple = [36.9916, -122.0583];
const CELL_SIZE_DEG = 0.0001;
const INTERACT_RADIUS_CELLS = 3;
const LABEL_RADIUS_CELLS = 8;
const VICTORY_VALUE = 32;
const GAME_SEED = 12125;
const STORAGE_KEY = "cmpm121-d3-game-state";

type CellKey = string;
type CellMemento = {
  value: number | null;
};
type MovementMode = "buttons" | "geolocation";

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

const cellStates = new Map<CellKey, CellMemento>();
let held: number | null = null;
let playerPos: L.LatLngTuple = START_POS;
let movementMode: MovementMode = "buttons";

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

function loadGameState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.playerPos) && data.playerPos.length === 2) {
      playerPos = [data.playerPos[0], data.playerPos[1]];
    }
    if (typeof data.held === "number" || data.held === null) {
      held = data.held;
    }
    cellStates.clear();
    if (Array.isArray(data.cells)) {
      for (const entry of data.cells) {
        if (Array.isArray(entry) && entry.length === 2) {
          const k = String(entry[0]);
          const v = entry[1];
          if (typeof v === "number" || v === null) {
            cellStates.set(k, { value: v });
          }
        }
      }
    }
    if (
      data.movementMode === "buttons" || data.movementMode === "geolocation"
    ) {
      movementMode = data.movementMode;
    }
  } catch (err) {
    console.warn("loadGameState failed", err);
  }
}

function saveGameState() {
  try {
    const cells: [CellKey, number | null][] = [];
    cellStates.forEach((m, k) => {
      cells.push([k, m.value]);
    });
    const data = {
      playerPos,
      held,
      cells,
      movementMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("saveGameState failed", err);
  }
}

loadGameState();
setHud();

const qsMode = new URLSearchParams(location.search).get("movement");
if (qsMode === "buttons" || qsMode === "geolocation") {
  movementMode = qsMode;
}

const player = L.circleMarker(playerPos, { radius: 6, color: "blue" }).addTo(
  map,
);
player.bindTooltip("You");
map.setView(playerPos, 18);

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
    saveGameState();
  } else if (v !== null && held === null) {
    setCellValue(i, j, null);
    held = v;
    setHud();
    toast(`Picked up ${v}`);
    scheduleRender();
    saveGameState();
  } else if (v !== null && held !== null) {
    if (v === held) {
      const nv = v * 2;
      setCellValue(i, j, nv);
      held = null;
      setHud();
      toast(`Crafted ${nv}`);
      scheduleRender();
      saveGameState();
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
  map.panTo(playerPos);
  scheduleRender();
  saveGameState();
}

function centerOnPlayer() {
  map.panTo(playerPos);
}

function onGeolocationMove(lat: number, lng: number) {
  playerPos = [lat, lng];
  player.setLatLng(playerPos);
  map.panTo(playerPos);
  scheduleRender();
  saveGameState();
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

function startNewGame() {
  cellStates.clear();
  held = null;
  setHud();
  playerPos = START_POS;
  player.setLatLng(playerPos);
  map.setView(playerPos, 18);
  rects.forEach((r) => r.remove());
  rects.clear();
  labels.forEach((l) => l.remove());
  labels.clear();
  localStorage.removeItem(STORAGE_KEY);
  saveGameState();
  scheduleRender();
}

class MovementFacade {
  private mode: MovementMode;
  private geoWatchId: number | null = null;
  constructor(initialMode: MovementMode) {
    this.mode = initialMode;
    this.enableCurrent();
  }
  getMode(): MovementMode {
    return this.mode;
  }
  setMode(mode: MovementMode) {
    if (mode === this.mode) return;
    this.disableCurrent();
    this.mode = mode;
    movementMode = mode;
    this.enableCurrent();
    saveGameState();
  }
  private enableCurrent() {
    if (this.mode === "buttons") {
      controls.style.display = "grid";
    } else {
      controls.style.display = "none";
      this.enableGeolocation();
    }
  }
  private disableCurrent() {
    if (this.mode === "geolocation") {
      this.disableGeolocation();
    }
  }
  private enableGeolocation() {
    if (!("geolocation" in navigator)) {
      toast("Geolocation not available");
      this.mode = "buttons";
      movementMode = "buttons";
      controls.style.display = "grid";
      return;
    }
    this.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        onGeolocationMove(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        toast("Geolocation error");
        this.setMode("buttons");
      },
      { enableHighAccuracy: true },
    );
  }
  private disableGeolocation() {
    if (this.geoWatchId !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(this.geoWatchId);
      this.geoWatchId = null;
    }
  }
}

const movement = new MovementFacade(movementMode);

const modePanel = document.createElement("div");
modePanel.style.cssText =
  "position:fixed;right:12px;bottom:12px;z-index:1000;display:flex;gap:6px;background:rgba(255,255,255,.9);padding:4px 6px;border-radius:8px;font:12px system-ui,sans-serif";
app.appendChild(modePanel);

const btnModeButtons = document.createElement("button");
btnModeButtons.textContent = "Buttons";
btnModeButtons.style.cssText =
  "padding:2px 6px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer";

const btnModeGeo = document.createElement("button");
btnModeGeo.textContent = "GPS";
btnModeGeo.style.cssText =
  "padding:2px 6px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer";

const btnNewGame = document.createElement("button");
btnNewGame.textContent = "New Game";
btnNewGame.style.cssText =
  "padding:2px 6px;border-radius:6px;border:1px solid #e33;background:#fff;cursor:pointer";

modePanel.appendChild(btnModeButtons);
modePanel.appendChild(btnModeGeo);
modePanel.appendChild(btnNewGame);

function updateModeButtons() {
  const m = movement.getMode();
  btnModeButtons.style.fontWeight = m === "buttons" ? "700" : "400";
  btnModeGeo.style.fontWeight = m === "geolocation" ? "700" : "400";
}

btnModeButtons.onclick = () => {
  movement.setMode("buttons");
  updateModeButtons();
};

btnModeGeo.onclick = () => {
  movement.setMode("geolocation");
  updateModeButtons();
};

btnNewGame.onclick = () => {
  startNewGame();
  updateModeButtons();
};

updateModeButtons();

map.on("move", scheduleRender);
map.on("moveend", scheduleRender);
scheduleRender();
