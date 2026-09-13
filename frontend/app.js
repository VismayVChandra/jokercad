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
const downloadGlbBtn = document.getElementById("downloadGlbBtn");
const downloadStlBtn = document.getElementById("downloadStlBtn");
const viewButtons = [...document.querySelectorAll(".view-btn")];
const viewerStatus = document.getElementById("viewerStatus");
const paramsCard = document.getElementById("paramsCard");
const paramsList = document.getElementById("paramsList");
const lockScreen = document.getElementById("lockScreen");
const lockForm = document.getElementById("lockForm");
const lockInput = document.getElementById("lockInput");
const lockError = document.getElementById("lockError");
const lockBtn = document.getElementById("lockBtn");

const narrowScreen = window.matchMedia("(max-width: 900px)");

/* ---------------- scene ---------------- */

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d1017, 200, 700);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 8000);
camera.position.set(90, 75, 90);

// alpha so the CSS gradient on #viewer shows through as the backdrop
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

let currentModel = null;
let exportSource = null;
let edgeGroup = null;
let wireframeOn = false;
let partInfoText = "";
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
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
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
  return { size, volume: Math.abs(volume) };
}

// Volume comes from the display mesh, which slightly undercuts curved
// surfaces (~2% on a cylinder), hence the "≈".
function describePart() {
  const { size, volume } = measure(exportRoot());
  const dims = [size.x, size.y, size.z].map((v) => v.toFixed(1)).join(" × ");
  const vol = volume >= 1000 ? `${(volume / 1000).toFixed(2)} cm³` : `${volume.toFixed(0)} mm³`;
  return `${dims} mm · ≈ ${vol}`;
}

function showModel(gltf, reframe) {
  if (currentModel) scene.remove(currentModel);
  if (edgeGroup) scene.remove(edgeGroup);

  // Untouched copy for export and measuring, taken before the viewer rescales and moves it.
  exportSource = gltf.scene.clone();

  currentModel = gltf.scene;
  // export_gltf follows the glTF spec (units = meters); build123d models are
  // authored in mm, so scale back up to keep the viewer's camera math (tuned
  // for mm-scale numbers) from clipping small parts against the near plane.
  currentModel.scale.setScalar(1000);
  currentModel.traverse((child) => {
    if (child.isMesh) child.material = modelMaterial;
  });
  scene.add(currentModel);
  placeModel(currentModel, reframe);

  currentModel.updateMatrixWorld(true);
  edgeGroup = buildEdges(currentModel);
  scene.add(edgeGroup);
  applyWireframeState();

  partInfoText = describePart();
  if (!busy) showViewerStatus(partInfoText);
}

function loadModel(glbBytes, reframe) {
  loader.parse(
    glbBytes.buffer,
    "",
    (gltf) => showModel(gltf, reframe),
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

function addVersion(entryEl, code, glbBytes, reframe) {
  versions.push({ code, glbBytes, conversation: conversation.slice(), entryEl });
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
  downloadGlbBtn.disabled = false;
  downloadStlBtn.disabled = false;
  viewButtons.forEach((btn) => (btn.disabled = false));
  renderParams(version.code);
  loadModel(version.glbBytes, reframe);
  if (narrowScreen.matches) setPanelCollapsed(true);
}

function setBusy(on, label = "") {
  busy = on;
  sendBtn.disabled = on;
  chatLog.classList.toggle("is-busy", on);
  paramsCard.classList.toggle("is-busy", on);
  paramsList.querySelectorAll("input").forEach((field) => (field.disabled = on));
  if (on) showViewerStatus(label, { loading: true });
  else if (partInfoText) showViewerStatus(partInfoText);
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
    addVersion(pending, data.code, base64ToBytes(data.glb_base64), false);
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
async function callApi(path, payload, pending) {
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
    return { data: await res.json() };
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
    input.value = chip.textContent.trim();
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
    addVersion(pending, data.code, base64ToBytes(data.glb_base64), true);
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

/* ---------------- toolbar ---------------- */

viewButtons.forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

wireframeBtn.addEventListener("click", () => {
  wireframeOn = !wireframeOn;
  applyWireframeState();
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

downloadGlbBtn.addEventListener("click", () => {
  const version = versions[activeVersion];
  if (version) downloadBlob(new Blob([version.glbBytes], { type: "model/gltf-binary" }), "jokercad-part.glb");
});

downloadStlBtn.addEventListener("click", () => {
  if (!exportSource) return;
  const stl = new STLExporter().parse(exportRoot(), { binary: true });
  downloadBlob(new Blob([stl], { type: "model/stl" }), "jokercad-part.stl");
});

codeToggleBtn.addEventListener("click", () => {
  const open = codeDrawer.classList.toggle("is-open");
  codeToggleBtn.classList.toggle("active", open);
});

closeCodeBtn.addEventListener("click", () => {
  codeDrawer.classList.remove("is-open");
  codeToggleBtn.classList.remove("active");
});

copyCodeBtn.addEventListener("click", async () => {
  if (!codeView.textContent) return;
  await navigator.clipboard.writeText(codeView.textContent);
  copyCodeBtn.textContent = "Copied";
  setTimeout(() => (copyCodeBtn.textContent = "Copy"), 1400);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && codeDrawer.classList.contains("is-open")) {
    codeDrawer.classList.remove("is-open");
    codeToggleBtn.classList.remove("active");
  }
});

input.focus();
initAccess();
