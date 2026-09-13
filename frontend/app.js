import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const API_BASE = "";
// Matches the server's MAX_HISTORY_MESSAGES; it would drop older turns anyway.
const HISTORY_LIMIT = 16;
const MAX_PARAMS = 12;

const PROVIDER_COLORS = {
  groq: "#ff8a4c",
  gemini: "#5b9bff",
  ollama: "#a78bfa",
};

const viewerEl = document.getElementById("viewer");
const panel = document.getElementById("panel");
const panelHandle = document.getElementById("panelHandle");
const chatLog = document.getElementById("chatLog");
const emptyState = document.getElementById("emptyState");
const form = document.getElementById("promptForm");
const input = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const providerBadge = document.getElementById("providerBadge");
const codeView = document.getElementById("codeView");
const codeDrawer = document.getElementById("codeDrawer");
const codeToggleBtn = document.getElementById("codeToggleBtn");
const closeCodeBtn = document.getElementById("closeCodeBtn");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const wireframeBtn = document.getElementById("wireframeBtn");
const sectionBtn = document.getElementById("sectionBtn");
const measureBtn = document.getElementById("measureBtn");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");
const shareBtn = document.getElementById("shareBtn");
const sectionBar = document.getElementById("sectionBar");
const sectionSlider = document.getElementById("sectionSlider");
const sectionValue = document.getElementById("sectionValue");
const sectionFlipBtn = document.getElementById("sectionFlipBtn");
const sectionCloseBtn = document.getElementById("sectionCloseBtn");
const sectionAxisButtons = [...sectionBar.querySelectorAll(".seg-btn")];
const measureLabel = document.getElementById("measureLabel");
const toast = document.getElementById("toast");
const viewButtons = [...document.querySelectorAll(".view-btn")];
// Buttons that only make sense once there's a part.
const modelTools = [...document.querySelectorAll(".model-tool")];
const viewerStatus = document.getElementById("viewerStatus");
const paramsCard = document.getElementById("paramsCard");
const paramsList = document.getElementById("paramsList");
const partsCard = document.getElementById("partsCard");
const partsList = document.getElementById("partsList");
const lockScreen = document.getElementById("lockScreen");
const lockForm = document.getElementById("lockForm");
const lockInput = document.getElementById("lockInput");
const lockError = document.getElementById("lockError");
const lockBtn = document.getElementById("lockBtn");

const narrowScreen = window.matchMedia("(max-width: 900px)");

// Viewer directions of the part's own X, Y and Z axes: the viewer is Y-up, so
// build123d's Z (up) is the viewer's +Y and its Y is the viewer's -Z.
const PART_AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, -1),
  z: new THREE.Vector3(0, 1, 0),
};
const section = { on: false, axis: "x", fraction: 0.5, flipped: false };
const sectionPlane = new THREE.Plane();
const ruler = { on: false, points: [] };

/* ---------------- scene ---------------- */

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d1017, 200, 700);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 8000);
camera.position.set(90, 75, 90);

// alpha so the CSS gradient on #viewer shows through as the backdrop
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Lets the section view cut the part open.
renderer.localClippingEnabled = true;
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.85;

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0a0c12, 1.5));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(120, 180, 140);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8ea2ff, 0.7);
fillLight.position.set(-150, 60, -60);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xb9a6ff, 1.0);
rimLight.position.set(-60, 40, -180);
scene.add(rimLight);

const grid = new THREE.GridHelper(400, 40, 0x39405a, 0x232838);
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

const modelMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b93f0,
  metalness: 0.32,
  roughness: 0.42,
});

const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xa9b2ff, transparent: true, opacity: 0.75 });

// Inside a cut-open part the camera sees the walls' back faces; drawing them
// flat in their own colour makes the cut read as solid material.
const capMaterial = new THREE.MeshBasicMaterial({ color: 0xff9e7a, side: THREE.BackSide });

let currentModel = null;
let exportSource = null;
let edgeGroup = null;
let capGroup = null;
let wireframeOn = false;
let partInfoText = "";
// The part's bounding box in its own (build123d) coordinates, in mm.
let partBox = null;
const loader = new GLTFLoader();

/* ---------------- camera ---------------- */

const desiredCamPos = camera.position.clone();
const desiredTarget = new THREE.Vector3(0, 0, 0);
const clock = new THREE.Clock();
let framing = false;
let lastFrame = null;

function markView(name) {
  viewButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
}

// Positions are in the viewer's Y-up space, where build123d's +Z (up) is +Y
// and its +Y (away from a front-view camera) is -Z.
function setView(name) {
  if (!lastFrame) return;
  const { dist, midY } = lastFrame;
  const r = dist * 1.5;
  const positions = {
    iso: [dist * 0.85, midY + dist * 0.72, dist],
    // a hair of Z offset keeps OrbitControls from gimbal-locking straight down
    top: [0, midY + r, r * 1e-4],
    front: [0, midY, r],
    right: [r, midY, 0],
  };
  desiredCamPos.set(...positions[name]);
  desiredTarget.set(0, midY, 0);
  framing = true;
  markView(name);
}

// Rests the part on the grid and sizes the grid/fog to it. Centring it on the
// origin instead would leave it half-buried, letting nearer ground-plane lines
// draw over the model.
function placeModel(object, reframe) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  object.position.sub(center);
  object.position.y += size.y / 2;

  lastFrame = { dist: maxDim * 2.1, midY: size.y / 2 };
  grid.scale.setScalar(Math.max(maxDim / 60, 0.06));
  const isoDistance = lastFrame.dist * 1.5;
  scene.fog.near = isoDistance * 1.05;
  scene.fog.far = isoDistance * 3.4;

  if (reframe) setView("iso");
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (framing) {
    // Eased by elapsed time rather than per frame, so a camera move takes the
    // same time at any frame rate (and still finishes when frames are sparse).
    const t = 1 - Math.exp(-delta * 7);
    camera.position.lerp(desiredCamPos, t);
    controls.target.lerp(desiredTarget, t);
    if (camera.position.distanceTo(desiredCamPos) < lastFrame.dist * 0.001) {
      camera.position.copy(desiredCamPos);
      controls.target.copy(desiredTarget);
      framing = false;
    }
  }

  controls.update();
  positionMeasureLabel();
  renderer.render(scene, camera);
}
animate();

// A drag or zoom takes over from any in-progress camera move.
controls.addEventListener("start", () => {
  framing = false;
  markView(null);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- model ---------------- */

function buildEdges(model) {
  const group = new THREE.Group();
  model.traverse((child) => {
    if (!child.isMesh) return;
    // The exported mesh isn't vertex-welded, so EdgesGeometry would treat every
    // triangle side as a boundary and draw the whole triangulation. Weld on
    // position alone — including normals would keep coincident vertices apart
    // wherever a curved surface varies them, leaving tessellation seams behind.
    const posOnly = new THREE.BufferGeometry();
    posOnly.setAttribute("position", child.geometry.getAttribute("position").clone());
    if (child.geometry.index) posOnly.setIndex(child.geometry.index.clone());
    const edges = new THREE.EdgesGeometry(mergeVertices(posOnly, 1e-4), 30);
    const lines = new THREE.LineSegments(edges, edgeMaterial);
    lines.userData.source = child;
    child.getWorldPosition(lines.position);
    child.getWorldQuaternion(lines.quaternion);
    child.getWorldScale(lines.scale);
    group.add(lines);
  });
  return group;
}

function applyWireframeState() {
  if (!currentModel) return;
  currentModel.visible = !wireframeOn;
  if (edgeGroup) edgeGroup.visible = true;
  if (capGroup) capGroup.visible = section.on && !wireframeOn;
  wireframeBtn.classList.toggle("active", wireframeOn);
}

// The part as build123d made it: glTF export stored it in metres and rotated
// it to Y-up, so undo both to get millimetres and Z-up.
function exportRoot() {
  const root = new THREE.Group();
  root.add(exportSource.clone());
  root.scale.setScalar(1000);
  root.rotation.x = Math.PI / 2;
  root.updateMatrixWorld(true);
  return root;
}

function measure(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  root.traverse((child) => {
    if (!child.isMesh) return;
    const pos = child.geometry.getAttribute("position");
    const index = child.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(child.matrixWorld);
      b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(child.matrixWorld);
      c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(child.matrixWorld);
      // signed volume of the tetrahedron from the origin; sums to the enclosed volume
      volume += a.dot(b.cross(c)) / 6;
    }
  });
  return { box, size, volume: Math.abs(volume) };
}

// Volume comes from the display mesh, which slightly undercuts curved
// surfaces (~2% on a cylinder), hence the "≈".
function describePart({ size, volume }) {
  const dims = [size.x, size.y, size.z].map((v) => v.toFixed(1)).join(" × ");
  const vol = volume >= 1000 ? `${(volume / 1000).toFixed(2)} cm³` : `${volume.toFixed(0)} mm³`;
  return `${dims} mm · ≈ ${vol}`;
}

function showModel(gltf, reframe, parts) {
  if (currentModel) scene.remove(currentModel);
  if (edgeGroup) scene.remove(edgeGroup);
  if (capGroup) scene.remove(capGroup);

  // Untouched copy for export and measuring, taken before the viewer rescales and moves it.
  exportSource = gltf.scene.clone();

  currentModel = gltf.scene;
  // export_gltf follows the glTF spec (units = meters); build123d models are
  // authored in mm, so scale back up to keep the viewer's camera math (tuned
  // for mm-scale numbers) from clipping small parts against the near plane.
  currentModel.scale.setScalar(1000);
  colorParts(currentModel, parts);
  scene.add(currentModel);
  placeModel(currentModel, reframe);

  currentModel.updateMatrixWorld(true);
  edgeGroup = buildEdges(currentModel);
  scene.add(edgeGroup);
  capGroup = buildCaps(currentModel);
  scene.add(capGroup);
  applyWireframeState();

  const part = measure(exportRoot());
  partBox = part.box;
  partInfoText = describePart(part);
  // Measured points belong to the previous shape.
  clearRuler();
  if (section.on) updateSectionPlane();
  if (!busy) showViewerStatus(idleStatusText());
}

function loadModel(glbBytes, reframe, parts) {
  loader.parse(
    glbBytes.buffer,
    "",
    (gltf) => showModel(gltf, reframe, parts),
    (err) => {
      const el = document.createElement("div");
      chatLog.appendChild(el);
      setEntryError(el, `Couldn't display the model: ${err.message || err}`);
    }
  );
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

function showViewerStatus(text, { loading = false } = {}) {
  viewerStatus.hidden = false;
  viewerStatus.innerHTML = loading ? '<span class="status-spinner"></span><span></span>' : "<span></span>";
  viewerStatus.lastElementChild.textContent = text;
}

/* ---------------- chat log ---------------- */

const ICON_CHECK =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_ALERT =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5h.01"/></svg>';

// Only has a visual effect on narrow screens, where the panel is a bottom sheet.
function setPanelCollapsed(collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  panelHandle.setAttribute("aria-expanded", String(!collapsed));
}

panelHandle.addEventListener("click", () => setPanelCollapsed(!panel.classList.contains("is-collapsed")));

function scrollChatToEnd() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addUserEntry(text) {
  if (emptyState) emptyState.remove();
  const el = document.createElement("div");
  el.className = "entry entry-user";
  el.textContent = text;
  chatLog.appendChild(el);
  scrollChatToEnd();
}

function addThinkingEntry(text) {
  const el = document.createElement("div");
  el.className = "entry entry-status";
  el.innerHTML = '<span class="thinking-dots"><span></span><span></span><span></span></span><span></span>';
  el.lastElementChild.textContent = text;
  chatLog.appendChild(el);
  scrollChatToEnd();
  return el;
}

function setEntrySuccess(el, text) {
  el.className = "entry entry-status is-success";
  el.innerHTML = `${ICON_CHECK}<span></span>`;
  el.querySelector("span").textContent = text;
  scrollChatToEnd();
}

function setEntryError(el, text) {
  el.className = "entry entry-status is-error";
  el.innerHTML = `${ICON_ALERT}<span></span>`;
  el.querySelector("span").textContent = text;
  // a collapsed bottom sheet would hide the error
  setPanelCollapsed(false);
  scrollChatToEnd();
}

function setProviderBadge(provider) {
  providerBadge.hidden = false;
  providerBadge.querySelector(".provider-label").textContent = provider;
  const color = PROVIDER_COLORS[provider] || "var(--success)";
  providerBadge.querySelector(".provider-dot").style.color = color;
  providerBadge.querySelector(".provider-dot").style.background = color;
}

/* ---------------- versions ---------------- */

const conversation = [];
const versions = [];
let activeVersion = -1;
let currentCode = "";
let busy = false;

const fence = (code) => "```python\n" + code + "\n```";

function addVersion(entryEl, code, glbBytes, reframe, parts) {
  versions.push({ code, glbBytes, parts, conversation: conversation.slice(), entryEl });
  const index = versions.length - 1;

  const tag = document.createElement("span");
  tag.className = "version-tag";
  tag.textContent = `v${index + 1}`;
  entryEl.insertBefore(tag, entryEl.querySelector("span"));
  entryEl.classList.add("is-version");
  entryEl.tabIndex = 0;
  entryEl.setAttribute("role", "button");
  entryEl.title = "Restore this version";

  const restore = () => {
    if (busy || index === activeVersion) return;
    conversation.splice(0, conversation.length, ...versions[index].conversation);
    showVersion(index, true);
  };
  entryEl.addEventListener("click", restore);
  entryEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      restore();
    }
  });

  showVersion(index, reframe);
}

function showVersion(index, reframe) {
  activeVersion = index;
  versions.forEach((v, i) => v.entryEl.classList.toggle("is-active", i === index));
  const version = versions[index];
  currentCode = version.code;
  codeView.textContent = version.code;
  modelTools.forEach((btn) => (btn.disabled = false));
  renderParams(version.code);
  loadModel(version.glbBytes, reframe, version.parts);
  if (narrowScreen.matches) setPanelCollapsed(true);
}

function setBusy(on, label = "") {
  busy = on;
  sendBtn.disabled = on;
  chatLog.classList.toggle("is-busy", on);
  paramsCard.classList.toggle("is-busy", on);
  paramsList.querySelectorAll("input").forEach((field) => (field.disabled = on));
  if (on) showViewerStatus(label, { loading: true });
  else if (partInfoText) showViewerStatus(idleStatusText());
  else viewerStatus.hidden = true;
}

/* ---------------- parameters ---------------- */

// Top-level `name = <number>  # comment` lines, which the system prompt asks
// the model to use for every user-adjustable dimension.
const PARAM_LINE = /^([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:#\s*(.*))?$/;

function extractParams(code) {
  const params = [];
  code.split("\n").forEach((line, lineIndex) => {
    const match = line.match(PARAM_LINE);
    if (match && match[1] !== "result") {
      params.push({ name: match[1], value: Number(match[2]), hint: (match[3] || "").trim(), lineIndex });
    }
  });
  return params.slice(0, MAX_PARAMS);
}

function applyParam(code, param, value) {
  const lines = code.split("\n");
  lines[param.lineIndex] = lines[param.lineIndex].replace(/=\s*-?\d+(?:\.\d+)?/, `= ${value}`);
  return lines.join("\n");
}

const humanize = (name) => name.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());

function unitFor(hint) {
  if (/\bmm\b/i.test(hint)) return "mm";
  if (/deg|°/i.test(hint)) return "°";
  return "";
}

function renderParams(code) {
  const params = extractParams(code);
  paramsList.replaceChildren();
  paramsCard.hidden = params.length === 0;

  for (const param of params) {
    const row = document.createElement("label");
    row.className = "param-row";

    const name = document.createElement("span");
    name.className = "param-name";
    name.textContent = humanize(param.name);
    name.title = param.hint ? `${param.name} — ${param.hint}` : param.name;

    const wrap = document.createElement("span");
    wrap.className = "param-input-wrap";
    const field = document.createElement("input");
    field.type = "number";
    field.step = "any";
    field.value = String(param.value);
    field.disabled = busy;
    field.addEventListener("change", () => rebuildWithParam(param, field));
    wrap.append(field);

    const unit = unitFor(param.hint);
    if (unit) {
      const unitEl = document.createElement("span");
      unitEl.className = "param-unit";
      unitEl.textContent = unit;
      wrap.append(unitEl);
    }

    row.append(name, wrap);
    paramsList.append(row);
  }
}

async function rebuildWithParam(param, field) {
  const value = Number(field.value);
  if (busy || field.value.trim() === "" || !Number.isFinite(value) || value === param.value) {
    field.value = String(param.value);
    return;
  }

  const unit = unitFor(param.hint);
  const label = `${humanize(param.name)} → ${value}${unit ? ` ${unit}` : ""}`;
  const pending = addThinkingEntry(`Rebuilding: ${label}`);
  setBusy(true, "Rebuilding part…");

  const { data } = await callApi("/api/run", { code: applyParam(currentCode, param, value) }, pending);
  if (data && data.ok) {
    // Follow-up prompts should build on the tweaked design, so it replaces the
    // latest code in the conversation. A new object keeps older version
    // snapshots (which share the array's items) unchanged.
    if (conversation.length && conversation[conversation.length - 1].role === "assistant") {
      conversation[conversation.length - 1] = { role: "assistant", content: fence(data.code) };
    }
    setEntrySuccess(pending, label);
    addVersion(pending, data.code, base64ToBytes(data.glb_base64), false, data.parts);
  } else {
    if (data) setEntryError(pending, `Couldn't rebuild with ${label}: ${data.error}`);
    field.value = String(param.value);
  }
  setBusy(false);
}

/* ---------------- access password ---------------- */

const PASSWORD_KEY = "jokercad-password";
let password = "";
try {
  password = localStorage.getItem(PASSWORD_KEY) || "";
} catch {}

function rememberPassword(value) {
  password = value;
  try {
    if (value) localStorage.setItem(PASSWORD_KEY, value);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {}
}

// Encoded because header values must be Latin-1; the server decodes it.
function passwordHeader(value) {
  return value ? { "X-App-Password": encodeURIComponent(value) } : {};
}

function showLock(message = "") {
  lockError.textContent = message;
  lockError.hidden = !message;
  lockScreen.hidden = false;
  lockInput.value = "";
  lockInput.focus();
}

async function checkPassword(candidate) {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: "POST",
    headers: passwordHeader(candidate),
  });
  return res.ok;
}

lockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const candidate = lockInput.value;
  if (!candidate) return;
  lockBtn.disabled = true;
  try {
    if (await checkPassword(candidate)) {
      rememberPassword(candidate);
      lockScreen.hidden = true;
      input.focus();
    } else {
      showLock("That password didn't work. Try again.");
    }
  } catch {
    showLock("Couldn't reach the server. Try again.");
  } finally {
    lockBtn.disabled = false;
  }
});

async function initAccess() {
  try {
    const health = await (await fetch(`${API_BASE}/api/health`)).json();
    if (!health.auth_required) return;
    if (password && (await checkPassword(password))) return;
    rememberPassword("");
    showLock();
  } catch {
    // If the server can't be reached, the first generate request will say so.
  }
}

/* ---------------- requests ---------------- */

// Returns { data } on an HTTP 200, otherwise reports the problem on the
// pending chat entry and returns {} (plus unauthorized: true for a 401).
async function callApi(path, payload, pending, { asBlob = false } = {}) {
  // Generous ceiling: worst case is MAX_REPAIR_ATTEMPTS retries, each paying
  // both an LLM call and a build123d execution (which can itself take ~2min
  // on a machine's very first run while the OS scans the native OCP DLLs).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 480_000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...passwordHeader(password) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.status === 401) {
      rememberPassword("");
      setEntryError(pending, "This workspace needs the access password.");
      showLock();
      return { unauthorized: true };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setEntryError(pending, typeof body.detail === "string" ? body.detail : `Server returned ${res.status}`);
      return {};
    }
    return { data: asBlob ? await res.blob() : await res.json() };
  } catch (err) {
    setEntryError(
      pending,
      err.name === "AbortError" ? "Request timed out after 8 minutes." : `Request failed: ${err.message}`
    );
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------------- composer ---------------- */

function autoResize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

input.addEventListener("input", autoResize);

input.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    input.value = chip.dataset.prompt;
    autoResize();
    input.focus();
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || busy) return;

  addUserEntry(prompt);
  input.value = "";
  autoResize();
  sendBtn.classList.add("is-loading");
  setBusy(true, "Building part…");
  const pending = addThinkingEntry("Generating…");

  const { data, unauthorized } = await callApi("/api/generate", { prompt, history: conversation }, pending);
  if (unauthorized) {
    input.value = prompt;
    autoResize();
  }
  if (data && data.ok) {
    conversation.push({ role: "user", content: prompt }, { role: "assistant", content: fence(data.code) });
    conversation.splice(0, Math.max(0, conversation.length - HISTORY_LIMIT));

    const retryNote = data.attempts > 1 ? ` · self-repaired after ${data.attempts} attempts` : "";
    setEntrySuccess(pending, `Built via ${data.provider_used}${retryNote}`);
    setProviderBadge(data.provider_used);
    addVersion(pending, data.code, base64ToBytes(data.glb_base64), true, data.parts);
    if (data.note) {
      // The part built, but the automatic review still sees a problem.
      const noteEl = document.createElement("div");
      chatLog.appendChild(noteEl);
      setEntryError(noteEl, `Self-check: ${data.note}`);
      noteEl.classList.replace("is-error", "is-warning");
    }
  } else if (data) {
    setEntryError(pending, data.error);
    if (data.code) codeView.textContent = data.code;
  }

  sendBtn.classList.remove("is-loading");
  setBusy(false);
  if (lockScreen.hidden) input.focus();
});

/* ---------------- assemblies ---------------- */

// A colour for each part of an assembly; the first is the single-part colour.
const PART_COLORS = [0x8b93f0, 0x4fd1b0, 0xf2b35b, 0xe58fd8, 0x6cb8ff, 0xb3e06b, 0xff8f8f, 0xc8a7ff];
const partMaterials = PART_COLORS.map(
  (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.32, roughness: 0.42 })
);

// Whether an object in the model is shown, i.e. its part hasn't been hidden.
function shownInModel(object) {
  for (let o = object; o && o !== currentModel; o = o.parent) if (!o.visible) return false;
  return true;
}

// Edge lines and section caps belong to their mesh's part, so they hide with it.
function syncPartHelpers() {
  for (const group of [edgeGroup, capGroup]) {
    if (group) group.children.forEach((helper) => (helper.visible = shownInModel(helper.userData.source)));
  }
}

// parts: the assembly's part labels, from the server. glTF export names each
// part's node after its label (three.js sanitizes the name).
function colorParts(model, parts) {
  model.traverse((child) => {
    if (child.isMesh) child.material = modelMaterial;
  });
  const groups = [];
  for (const label of parts || []) {
    const name = THREE.PropertyBinding.sanitizeNodeName(label);
    if (!label || groups.some((g) => g.label === label)) continue;
    const nodes = [];
    model.traverse((o) => o.name === name && nodes.push(o));
    if (nodes.length) groups.push({ label, nodes });
  }

  partsList.replaceChildren();
  partsCard.hidden = groups.length < 2;
  if (groups.length < 2) return;

  groups.forEach((group, i) => {
    const material = partMaterials[i % partMaterials.length];
    group.nodes.forEach((node) => node.traverse((o) => o.isMesh && (o.material = material)));

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "part-chip";
    chip.title = `Show or hide the ${group.label}`;
    const dot = document.createElement("span");
    dot.className = "part-dot";
    dot.style.background = `#${material.color.getHexString()}`;
    const text = document.createElement("span");
    text.textContent = group.label;
    chip.append(dot, text);
    chip.addEventListener("click", () => {
      const hidden = chip.classList.toggle("is-hidden");
      group.nodes.forEach((node) => (node.visible = !hidden));
      syncPartHelpers();
    });
    partsList.append(chip);
  });
}

/* ---------------- section view ---------------- */

function buildCaps(model) {
  const group = new THREE.Group();
  model.traverse((child) => {
    if (!child.isMesh) return;
    const cap = new THREE.Mesh(child.geometry, capMaterial);
    cap.userData.source = child;
    child.getWorldPosition(cap.position);
    child.getWorldQuaternion(cap.quaternion);
    child.getWorldScale(cap.scale);
    group.add(cap);
  });
  return group;
}

function updateSectionPlane() {
  if (!currentModel) return;
  const axis = PART_AXES[section.axis];
  const box = new THREE.Box3().setFromObject(currentModel);
  const ends = [box.min.dot(axis), box.max.dot(axis)];
  const lo = Math.min(...ends);
  const hi = Math.max(...ends);
  const cut = lo + (hi - lo) * section.fraction;
  // three.js hides whatever lies on the plane's negative side, so this keeps
  // the half below the cut (above it when flipped).
  if (section.flipped) sectionPlane.set(axis, -cut);
  else sectionPlane.set(axis.clone().negate(), cut);
  // Shown in the part's own coordinates, the ones its code uses.
  const partMin = partBox ? partBox.min[section.axis] : lo;
  sectionValue.textContent = `${section.axis.toUpperCase()} = ${(partMin + cut - lo).toFixed(1)} mm`;
  sectionAxisButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.axis === section.axis));
}

function setSection(on) {
  section.on = on && Boolean(currentModel);
  const planes = section.on ? [sectionPlane] : null;
  for (const material of [modelMaterial, edgeMaterial, capMaterial, ...partMaterials]) {
    material.clippingPlanes = planes;
    material.needsUpdate = true;
  }
  sectionBar.hidden = !section.on;
  sectionBtn.classList.toggle("active", section.on);
  document.body.classList.toggle("section-on", section.on);
  if (section.on) updateSectionPlane();
  applyWireframeState();
}

sectionBtn.addEventListener("click", () => setSection(!section.on));
sectionCloseBtn.addEventListener("click", () => setSection(false));

sectionFlipBtn.addEventListener("click", () => {
  section.flipped = !section.flipped;
  updateSectionPlane();
});

sectionAxisButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    section.axis = btn.dataset.axis;
    updateSectionPlane();
  })
);

sectionSlider.addEventListener("input", () => {
  section.fraction = Number(sectionSlider.value) / 1000;
  updateSectionPlane();
});

/* ---------------- measuring ---------------- */

const raycaster = new THREE.Raycaster();
const rulerGroup = new THREE.Group();
scene.add(rulerGroup);
// Drawn on top of everything, so the points stay visible through the part.
const rulerPointMaterial = new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });
const rulerLineMaterial = new THREE.LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true });
const rulerPointGeometry = new THREE.SphereGeometry(1, 16, 12);
// A click this close (in pixels) to a mesh corner snaps to it, so corner-to-corner
// measurements come out exact.
const SNAP_PIXELS = 10;

function idleStatusText() {
  return ruler.on ? "Click two points on the part to measure" : partInfoText;
}

// The canvas fills the window, so window coordinates are canvas coordinates.
function toScreen(point) {
  const p = point.clone().project(camera);
  return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
}

function pickPoint(event) {
  const pointer = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  // The raycaster ignores the section plane, so skip hits on the cut-away half.
  // A cut face on screen is really the inside of the far wall (the caps' back
  // faces); the point wanted there is where the ray meets the cut itself.
  const targets = section.on && capGroup ? [currentModel, capGroup] : [currentModel];
  const hit = raycaster
    .intersectObjects(targets, true)
    .find(
      (h) =>
        shownInModel(h.object.userData.source || h.object) &&
        (!section.on || sectionPlane.distanceToPoint(h.point) >= 0)
    );
  if (!hit) return null;
  if (hit.object.material === capMaterial) return raycaster.ray.intersectPlane(sectionPlane, new THREE.Vector3());

  const positions = hit.object.geometry.getAttribute("position");
  let best = hit.point.clone();
  let bestDistance = SNAP_PIXELS;
  for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
    const corner = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(hit.object.matrixWorld);
    const s = toScreen(corner);
    const distance = Math.hypot(s.x - event.clientX, s.y - event.clientY);
    if (distance < bestDistance) {
      best = corner;
      bestDistance = distance;
    }
  }
  return best;
}

function drawRuler() {
  rulerGroup.children.forEach((child) => child.isLine && child.geometry.dispose());
  rulerGroup.clear();
  const pointSize = (lastFrame ? lastFrame.dist / 2.1 : 50) * 0.012;
  for (const point of ruler.points) {
    const dot = new THREE.Mesh(rulerPointGeometry, rulerPointMaterial);
    dot.position.copy(point);
    dot.scale.setScalar(pointSize);
    dot.renderOrder = 10;
    rulerGroup.add(dot);
  }

  measureLabel.hidden = ruler.points.length < 2;
  if (ruler.points.length < 2) return;

  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ruler.points), rulerLineMaterial);
  line.renderOrder = 10;
  rulerGroup.add(line);
  const d = ruler.points[1].clone().sub(ruler.points[0]);
  const along = (axis) => Math.abs(d.dot(PART_AXES[axis])).toFixed(1);
  measureLabel.innerHTML = `<strong>${d.length().toFixed(2)} mm</strong><span>ΔX ${along("x")} · ΔY ${along("y")} · ΔZ ${along("z")}</span>`;
  positionMeasureLabel();
}

function positionMeasureLabel() {
  if (ruler.points.length < 2) return;
  const mid = toScreen(ruler.points[0].clone().lerp(ruler.points[1], 0.5));
  measureLabel.style.transform = `translate(${mid.x}px, ${mid.y}px) translate(-50%, calc(-100% - 12px))`;
}

function clearRuler() {
  ruler.points = [];
  drawRuler();
}

function setMeasuring(on) {
  ruler.on = on && Boolean(currentModel);
  measureBtn.classList.toggle("active", ruler.on);
  renderer.domElement.style.cursor = ruler.on ? "crosshair" : "";
  if (!ruler.on) clearRuler();
  if (!busy && partInfoText) showViewerStatus(idleStatusText());
}

measureBtn.addEventListener("click", () => setMeasuring(!ruler.on));

// A click places a point; the end of an orbit drag doesn't.
let pointerDownAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => (pointerDownAt = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!ruler.on || !pointerDownAt || e.button !== 0) return;
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 5) return;
  const point = pickPoint(e);
  if (!point) return;
  if (ruler.points.length === 2) ruler.points = [];
  ruler.points.push(point);
  drawRuler();
});

/* ---------------- export ---------------- */

function downloadHref(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadHref(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// STEP keeps the exact geometry (true circles, faces other CAD tools can edit),
// so it's made on the server from the part's code rather than from the mesh.
async function exportStep() {
  if (busy) return;
  const label = `v${activeVersion + 1}`;
  const pending = addThinkingEntry(`Exporting ${label} as STEP…`);
  setBusy(true, "Exporting STEP…");
  const { data } = await callApi("/api/export/step", { code: currentCode }, pending, { asBlob: true });
  if (data) {
    downloadBlob(data, "jokercad-part.step");
    setEntrySuccess(pending, `Exported ${label} as STEP`);
  }
  setBusy(false);
}

// A transparent image of the current view, without the floor grid or measurements.
function exportPng() {
  grid.visible = false;
  rulerGroup.visible = false;
  renderer.render(scene, camera);
  // Read straight after rendering, before the browser clears the canvas.
  const url = renderer.domElement.toDataURL("image/png");
  grid.visible = true;
  rulerGroup.visible = true;
  downloadHref(url, "jokercad-part.png");
}

const EXPORTERS = {
  step: exportStep,
  stl: () => {
    const stl = new STLExporter().parse(exportRoot(), { binary: true });
    downloadBlob(new Blob([stl], { type: "model/stl" }), "jokercad-part.stl");
  },
  glb: () => {
    const version = versions[activeVersion];
    if (version) downloadBlob(new Blob([version.glbBytes], { type: "model/gltf-binary" }), "jokercad-part.glb");
  },
  png: exportPng,
};

function setExportMenu(open) {
  exportMenu.hidden = !open;
  exportBtn.setAttribute("aria-expanded", String(open));
  exportBtn.classList.toggle("active", open);
  if (!open) return;
  // Positioned by hand: inside the toolbar it would be clipped when the
  // toolbar scrolls sideways on phones.
  const r = exportBtn.getBoundingClientRect();
  const width = exportMenu.offsetWidth;
  exportMenu.style.top = `${r.bottom + 8}px`;
  exportMenu.style.left = `${Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))}px`;
  exportMenu.querySelector(".menu-item").focus();
}

exportBtn.addEventListener("click", () => setExportMenu(exportMenu.hidden));

document.addEventListener("pointerdown", (e) => {
  if (!exportMenu.hidden && !exportMenu.contains(e.target) && !exportBtn.contains(e.target)) setExportMenu(false);
});

window.addEventListener("resize", () => setExportMenu(false));

exportMenu.querySelectorAll(".menu-item").forEach((item) =>
  item.addEventListener("click", () => {
    setExportMenu(false);
    if (exportSource) EXPORTERS[item.dataset.format]();
  })
);

/* ---------------- share links ---------------- */

// A share link carries the part's code, compressed, in the URL fragment,
// which browsers never send to a server, so sharing needs no storage.
const SHARE_PREFIX = "#part=";

async function packCode(code) {
  const stream = new Blob([code]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function unpackCode(packed) {
  const bytes = base64ToBytes(packed.replace(/-/g, "+").replace(/_/g, "/"));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2800);
}

shareBtn.addEventListener("click", async () => {
  if (!currentCode) return;
  const url = `${location.origin}${location.pathname}${SHARE_PREFIX}${await packCode(currentCode)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied. It opens this exact part.");
  } catch {
    window.prompt("Copy this link to share the part:", url);
  }
});

async function buildSharedPart(code) {
  if (busy) return false;
  addUserEntry("Open the shared part");
  const pending = addThinkingEntry("Building the shared part…");
  setBusy(true, "Building part…");
  const { data } = await callApi("/api/run", { code }, pending);
  const ok = Boolean(data && data.ok);
  if (ok) {
    // Follow-up prompts then modify the shared part.
    conversation.push({ role: "user", content: "Start from this part." }, { role: "assistant", content: fence(data.code) });
    setEntrySuccess(pending, "Opened the shared part");
    addVersion(pending, data.code, base64ToBytes(data.glb_base64), true, data.parts);
  } else if (data) {
    setEntryError(pending, `Couldn't build the shared part: ${data.error}`);
  }
  setBusy(false);
  return ok;
}

// Building a shared part runs its code on the server, and a link can come from
// anyone, so it only happens when the person opening it asks, after they've
// had the chance to read the code.
async function offerSharedPart() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const packed = location.hash.slice(SHARE_PREFIX.length);
  history.replaceState(null, "", location.pathname + location.search);

  let code;
  try {
    code = await unpackCode(packed);
  } catch {
    const el = document.createElement("div");
    chatLog.appendChild(el);
    setEntryError(el, "That share link is incomplete or damaged, so the part can't be opened.");
    return;
  }

  if (emptyState) emptyState.remove();
  codeView.textContent = code;
  const card = document.createElement("div");
  card.className = "entry entry-share";
  card.innerHTML =
    '<div class="share-title">Someone shared a part with you</div>' +
    "<p>Building it runs the part's code on the server. You can read the code first.</p>" +
    '<div class="share-actions"><button type="button" class="text-btn">View code</button>' +
    '<button type="button" class="primary-btn">Build it</button></div>';
  chatLog.appendChild(card);
  const [viewBtn, buildBtn] = card.querySelectorAll("button");
  viewBtn.addEventListener("click", () => setCodeDrawer(true));
  buildBtn.addEventListener("click", async () => {
    buildBtn.disabled = true;
    if (await buildSharedPart(code)) card.remove();
    else buildBtn.disabled = false;
  });
}

/* ---------------- toolbar ---------------- */

viewButtons.forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

function toggleWireframe() {
  wireframeOn = !wireframeOn;
  applyWireframeState();
}

wireframeBtn.addEventListener("click", toggleWireframe);

function setCodeDrawer(open) {
  codeDrawer.classList.toggle("is-open", open);
  codeToggleBtn.classList.toggle("active", open);
}

codeToggleBtn.addEventListener("click", () => setCodeDrawer(!codeDrawer.classList.contains("is-open")));
closeCodeBtn.addEventListener("click", () => setCodeDrawer(false));

copyCodeBtn.addEventListener("click", async () => {
  if (!codeView.textContent) return;
  await navigator.clipboard.writeText(codeView.textContent);
  copyCodeBtn.textContent = "Copied";
  setTimeout(() => (copyCodeBtn.textContent = "Copy"), 1400);
});

const VIEW_KEYS = { 1: "iso", 2: "top", 3: "front", 4: "right" };

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Closes the most recently opened thing first.
    if (!exportMenu.hidden) setExportMenu(false);
    else if (codeDrawer.classList.contains("is-open")) setCodeDrawer(false);
    else if (ruler.on) setMeasuring(false);
    else if (section.on) setSection(false);
    return;
  }
  const typing = e.target.matches("textarea, input:not([type=range])");
  if (typing || e.metaKey || e.ctrlKey || e.altKey || !currentModel || !lockScreen.hidden) return;
  const key = e.key.toLowerCase();
  if (VIEW_KEYS[key]) setView(VIEW_KEYS[key]);
  else if (key === "w") toggleWireframe();
  else if (key === "s") setSection(!section.on);
  else if (key === "m") setMeasuring(!ruler.on);
  else return;
  e.preventDefault();
});

input.focus();
initAccess();
offerSharedPart();
// A share link pasted into a tab that's already open only changes the hash.
window.addEventListener("hashchange", offerSharedPart);
