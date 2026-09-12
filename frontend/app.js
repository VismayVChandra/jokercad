import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const API_BASE = "";
const sessionId = crypto.randomUUID();

const PROVIDER_COLORS = {
  groq: "#ff8a4c",
  gemini: "#5b9bff",
  ollama: "#a78bfa",
};

const viewerEl = document.getElementById("viewer");
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
const resetViewBtn = document.getElementById("resetViewBtn");
const wireframeBtn = document.getElementById("wireframeBtn");
const downloadGlbBtn = document.getElementById("downloadGlbBtn");
const downloadStlBtn = document.getElementById("downloadStlBtn");

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
let edgeGroup = null;
let wireframeOn = false;
const loader = new GLTFLoader();

/* ---------------- camera framing (animated) ---------------- */

const desiredCamPos = camera.position.clone();
const desiredTarget = new THREE.Vector3(0, 0, 0);
let framing = false;

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  // Centre the part horizontally and rest it on the grid. Centring it on the
  // origin instead would leave it half-buried, letting nearer ground-plane
  // lines draw over the model.
  object.position.sub(center);
  object.position.y += size.y / 2;

  const dist = maxDim * 2.1;
  desiredCamPos.set(dist * 0.85, size.y / 2 + dist * 0.72, dist);
  desiredTarget.set(0, size.y / 2, 0);
  framing = true;

  // keep grid density and fog depth proportional to the part's size
  grid.scale.setScalar(Math.max(maxDim / 60, 0.06));
  const camDist = desiredCamPos.length();
  scene.fog.near = camDist * 1.05;
  scene.fog.far = camDist * 3.4;
}

function animate() {
  requestAnimationFrame(animate);

  if (framing) {
    camera.position.lerp(desiredCamPos, 0.09);
    controls.target.lerp(desiredTarget, 0.09);
    if (camera.position.distanceTo(desiredCamPos) < 0.4) framing = false;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- model loading ---------------- */

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

function loadModel(glbUrl) {
  loader.load(glbUrl, (gltf) => {
    if (currentModel) scene.remove(currentModel);
    if (edgeGroup) scene.remove(edgeGroup);

    currentModel = gltf.scene;
    // export_gltf follows the glTF spec (units = meters); build123d models are
    // authored in mm, so scale back up to keep the viewer's camera math (tuned
    // for mm-scale numbers) from clipping small parts against the near plane.
    currentModel.scale.setScalar(1000);
    currentModel.traverse((child) => {
      if (child.isMesh) child.material = modelMaterial;
    });
    scene.add(currentModel);
    frameObject(currentModel);

    currentModel.updateMatrixWorld(true);
    edgeGroup = buildEdges(currentModel);
    scene.add(edgeGroup);

    applyWireframeState();
  });
}

/* ---------------- chat log ---------------- */

const ICON_CHECK =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_ALERT =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5h.01"/></svg>';

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

function addThinkingEntry() {
  const el = document.createElement("div");
  el.className = "entry entry-status";
  el.innerHTML =
    '<span class="thinking-dots"><span></span><span></span><span></span></span><span>Generating…</span>';
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
  scrollChatToEnd();
}

function setProviderBadge(provider) {
  providerBadge.hidden = false;
  providerBadge.querySelector(".provider-label").textContent = provider;
  const color = PROVIDER_COLORS[provider] || "var(--success)";
  providerBadge.querySelector(".provider-dot").style.color = color;
  providerBadge.querySelector(".provider-dot").style.background = color;
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

let lastUrls = { glb: null, stl: null };

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if (!prompt || sendBtn.disabled) return;

  addUserEntry(prompt);
  input.value = "";
  autoResize();
  sendBtn.disabled = true;
  sendBtn.classList.add("is-loading");
  const pending = addThinkingEntry();

  // Generous ceiling: worst case is MAX_REPAIR_ATTEMPTS retries, each paying
  // both an LLM call and a build123d execution (which can itself take ~2min
  // on a machine's very first run while the OS scans the native OCP DLLs).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 480_000);

  try {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, prompt }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();

    if (data.ok) {
      const retryNote = data.attempts > 1 ? ` · self-repaired after ${data.attempts} attempts` : "";
      setEntrySuccess(pending, `Built via ${data.provider_used}${retryNote}`);
      setProviderBadge(data.provider_used);
      codeView.textContent = data.code;
      lastUrls = { glb: data.glb_url, stl: data.stl_url };
      downloadGlbBtn.disabled = false;
      downloadStlBtn.disabled = false;
      loadModel(data.glb_url);
    } else {
      setEntryError(pending, data.error);
      if (data.code) codeView.textContent = data.code;
    }
  } catch (err) {
    setEntryError(
      pending,
      err.name === "AbortError" ? "Request timed out after 8 minutes." : `Request failed: ${err.message}`
    );
  } finally {
    clearTimeout(timeoutId);
    sendBtn.disabled = false;
    sendBtn.classList.remove("is-loading");
    input.focus();
  }
});

/* ---------------- toolbar ---------------- */

resetViewBtn.addEventListener("click", () => {
  if (currentModel) frameObject(currentModel);
});

wireframeBtn.addEventListener("click", () => {
  wireframeOn = !wireframeOn;
  applyWireframeState();
});

downloadGlbBtn.addEventListener("click", () => {
  if (lastUrls.glb) triggerDownload(lastUrls.glb, "jokercad-part.glb");
});

downloadStlBtn.addEventListener("click", () => {
  if (lastUrls.stl) triggerDownload(lastUrls.stl, "jokercad-part.stl");
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
