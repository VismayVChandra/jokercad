import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { bodyLabels, makeRig, moveTo } from "./motion.js";
import { analyzePrint, bestOrientation, make3mf } from "./print.js";
import { buildDrawing, buildDxf } from "./drawing.js";
import { diffLines } from "./diff.js";
import * as cloudSync from "./sync.js";

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
const runCodeBtn = document.getElementById("runCodeBtn");
const revertCodeBtn = document.getElementById("revertCodeBtn");
const codeHint = document.getElementById("codeHint");
const codeError = document.getElementById("codeError");
const codeStartModal = document.getElementById("codeStartModal");
const codeStartCloseBtn = document.getElementById("codeStartCloseBtn");
const codeStartWhat = document.getElementById("codeStartWhat");
const codeStartPrompt = document.getElementById("codeStartPrompt");
const codeStartCopyBtn = document.getElementById("codeStartCopyBtn");
const codeStartCode = document.getElementById("codeStartCode");
const codeStartBuildBtn = document.getElementById("codeStartBuildBtn");
const codeStartError = document.getElementById("codeStartError");
const codeStartCtaBtn = document.getElementById("codeStartCtaBtn");
const wireframeBtn = document.getElementById("wireframeBtn");
const sectionBtn = document.getElementById("sectionBtn");
const organicBtn = document.getElementById("organicBtn");
const motionBtn = document.getElementById("motionBtn");
const undoEditBtn = document.getElementById("undoEditBtn");
const redoEditBtn = document.getElementById("redoEditBtn");
const measureBtn = document.getElementById("measureBtn");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");
const moreBtn = document.getElementById("moreBtn");
const moreMenu = document.getElementById("moreMenu");
const shareBtn = document.getElementById("shareBtn");
const arBtn = document.getElementById("arBtn");
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
const intentCard = document.getElementById("intentCard");
const intentVerdict = document.getElementById("intentVerdict");
const intentChecks = document.getElementById("intentChecks");
const intentLists = document.getElementById("intentLists");
const intentCodeBtn = document.getElementById("intentCodeBtn");
const geometryCard = document.getElementById("geometryCard");
const geometryVerdict = document.getElementById("geometryVerdict");
const geometryValues = document.getElementById("geometryValues");
const geometryFeatures = document.getElementById("geometryFeatures");
const partsCard = document.getElementById("partsCard");
const partsList = document.getElementById("partsList");
const lockScreen = document.getElementById("lockScreen");
const lockForm = document.getElementById("lockForm");
const lockInput = document.getElementById("lockInput");
const lockError = document.getElementById("lockError");
const lockBtn = document.getElementById("lockBtn");
const partTabs = document.getElementById("partTabs");
const projectBtn = document.getElementById("projectBtn");
const projectNameEl = document.getElementById("projectName");
const projectMenu = document.getElementById("projectMenu");
const projectList = document.getElementById("projectList");
const importInput = document.getElementById("importInput");
const assemblyPanel = document.getElementById("assemblyPanel");
const asmPartList = document.getElementById("asmPartList");
const asmInstanceList = document.getElementById("asmInstanceList");
const asmSelection = document.getElementById("asmSelection");
const asmSelName = document.getElementById("asmSelName");
const asmFields = [...asmSelection.querySelectorAll("input[data-axis]")];
const asmModeButtons = [...asmSelection.querySelectorAll("[data-mode]")];
const mateBtn = document.getElementById("mateBtn");
const undoMoveBtn = document.getElementById("undoMoveBtn");
const motionCard = document.getElementById("motionCard");
const motionSlider = document.getElementById("motionSlider");
const motionValue = document.getElementById("motionValue");
const motionHint = document.getElementById("motionHint");
const motionPlayBtn = document.getElementById("motionPlayBtn");
const motionResetBtn = document.getElementById("motionResetBtn");
const attachBtn = document.getElementById("attachBtn");
const imageInput = document.getElementById("imageInput");
const attachmentEl = document.getElementById("attachment");
const attachmentImg = document.getElementById("attachmentImg");
const attachmentClear = document.getElementById("attachmentClear");
const editBtn = document.getElementById("editBtn");
const editPopup = document.getElementById("editPopup");
const editTitle = document.getElementById("editTitle");
const editForm = document.getElementById("editForm");
const editInput = document.getElementById("editInput");
const editChips = document.getElementById("editChips");
const printBtn = document.getElementById("printBtn");
const printCard = document.getElementById("printCard");
const printCloseBtn = document.getElementById("printCloseBtn");
const printerSelect = document.getElementById("printerSelect");
const materialSelect = document.getElementById("materialSelect");
const infillSelect = document.getElementById("infillSelect");
const priceInput = document.getElementById("priceInput");
const priceLabel = document.getElementById("priceLabel");
const printChecks = document.getElementById("printChecks");
const printEstimate = document.getElementById("printEstimate");
const orientBtn = document.getElementById("orientBtn");
const orientResetBtn = document.getElementById("orientResetBtn");
const export3mfBtn = document.getElementById("export3mfBtn");
const fitSelect = document.getElementById("fitSelect");
const providerPicker = document.getElementById("providerPicker");
const providerSelect = document.getElementById("providerSelect");
const usageStat = document.getElementById("usageStat");
const drawingModal = document.getElementById("drawingModal");
const drawingPreview = document.getElementById("drawingPreview");
const drawingProjection = document.getElementById("drawingProjection");
const drawingSheet = document.getElementById("drawingSheet");
const drawingSvgBtn = document.getElementById("drawingSvgBtn");
const drawingPdfBtn = document.getElementById("drawingPdfBtn");
const drawingCloseBtn = document.getElementById("drawingCloseBtn");
const planProjectBtn = document.getElementById("planProjectBtn");
const planModal = document.getElementById("planModal");
const planCloseBtn = document.getElementById("planCloseBtn");
const planIntro = document.getElementById("planIntro");
const planInput = document.getElementById("planInput");
const planError = document.getElementById("planError");
const planGoBtn = document.getElementById("planGoBtn");
const planListSection = document.getElementById("planListSection");
const planPartsEl = document.getElementById("planParts");
const planBackBtn = document.getElementById("planBackBtn");
const planBuildBtn = document.getElementById("planBuildBtn");
const planProgress = document.getElementById("planProgress");
const planStatusList = document.getElementById("planStatusList");
const arModal = document.getElementById("arModal");
const arViewer = document.getElementById("arViewer");
const arCloseBtn = document.getElementById("arCloseBtn");
const arQrCard = document.getElementById("arQrCard");
const arQrBox = document.getElementById("arQrBox");
const arQrHint = document.getElementById("arQrHint");
const arCopyLinkBtn = document.getElementById("arCopyLinkBtn");
const compareBtn = document.getElementById("compareBtn");
const compareCard = document.getElementById("compareCard");
const compareCloseBtn = document.getElementById("compareCloseBtn");
const compareASelect = document.getElementById("compareASelect");
const compareBSelect = document.getElementById("compareBSelect");
const compareStats = document.getElementById("compareStats");
const compareDiff = document.getElementById("compareDiff");
const compareRestoreABtn = document.getElementById("compareRestoreABtn");
const compareRestoreBBtn = document.getElementById("compareRestoreBBtn");
const accountBtn = document.getElementById("accountBtn");
const accountMenu = document.getElementById("accountMenu");
const accountSignedOut = document.getElementById("accountSignedOut");
const accountSignedIn = document.getElementById("accountSignedIn");
const signInForm = document.getElementById("signInForm");
const signInEmail = document.getElementById("signInEmail");
const signInStatus = document.getElementById("signInStatus");
const accountEmail = document.getElementById("accountEmail");
const syncStatusEl = document.getElementById("syncStatus");
const signOutBtn = document.getElementById("signOutBtn");
const jointsSection = document.getElementById("jointsSection");
const asmJointList = document.getElementById("asmJointList");
const addPivotBtn = document.getElementById("addPivotBtn");
const addSlideBtn = document.getElementById("addSlideBtn");
const jointAxisPicker = document.getElementById("jointAxisPicker");
const jointHint = document.getElementById("jointHint");
const explodeSection = document.getElementById("explodeSection");
const explodeSlider = document.getElementById("explodeSlider");
const explodeValue = document.getElementById("explodeValue");
const collisionWarning = document.getElementById("collisionWarning");

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
// feature: the measured cylinder the latest click landed on, when it did.
const ruler = { on: false, points: [], feature: null };

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
// exportSource's scale to millimetres: a part's GLB is in metres; the assembly is already in mm.
let exportScale = 1000;
// Bumped whenever the viewer's content changes, so a model that finishes
// loading late can't replace what's on screen by then.
let displayToken = 0;
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
  const { dist, midY, cx = 0, cz = 0 } = lastFrame;
  const r = dist * 1.5;
  const positions = {
    iso: [dist * 0.85, midY + dist * 0.72, dist],
    // a hair of Z offset keeps OrbitControls from gimbal-locking straight down
    top: [0, midY + r, r * 1e-4],
    front: [0, midY, r],
    right: [r, midY, 0],
  };
  desiredCamPos.set(...positions[name]).add(new THREE.Vector3(cx, 0, cz));
  desiredTarget.set(cx, midY, cz);
  framing = true;
  markView(name);
}

// Rests the part on the grid and sizes the grid/fog to it. Centring it on the
// origin instead would leave it half-buried, letting nearer ground-plane lines
// draw over the model.
// With recenter false (the assembly) the object stays put: its parts are where
// the user arranged them.
function placeModel(object, reframe, recenter = true) {
  const box = new THREE.Box3().setFromObject(object);
  const empty = box.isEmpty();
  const size = empty ? new THREE.Vector3(100, 0, 100) : box.getSize(new THREE.Vector3());
  const center = empty ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  if (recenter) {
    object.position.sub(center);
    object.position.y += size.y / 2;
    lastFrame = { dist: maxDim * 2.1, midY: size.y / 2 };
  } else {
    lastFrame = { dist: maxDim * 2.1, midY: center.y, cx: center.x, cz: center.z };
  }
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

// Per mesh geometry, which the copies of a part in an assembly share.
const edgeCache = new WeakMap();

function buildEdges(model) {
  const group = new THREE.Group();
  model.traverse((child) => {
    if (!child.isMesh) return;
    let edges = edgeCache.get(child.geometry);
    if (!edges) {
      // The exported mesh isn't vertex-welded, so EdgesGeometry would treat every
      // triangle side as a boundary and draw the whole triangulation. Weld on
      // position alone — including normals would keep coincident vertices apart
      // wherever a curved surface varies them, leaving tessellation seams behind.
      const posOnly = new THREE.BufferGeometry();
      posOnly.setAttribute("position", child.geometry.getAttribute("position").clone());
      if (child.geometry.index) posOnly.setIndex(child.geometry.index.clone());
      edges = new THREE.EdgesGeometry(mergeVertices(posOnly, 1e-4), 30);
      edgeCache.set(child.geometry, edges);
    }
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

// The part (or assembly) in build123d's terms: glTF export stored parts in
// metres and rotated them to Y-up, so undo both to get millimetres and Z-up.
function exportRoot() {
  const root = new THREE.Group();
  root.add(exportSource.clone());
  root.scale.setScalar(exportScale);
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

// Makes object the model everything else works on (views, section, measuring,
// export), replacing what was on screen. source is what gets exported, at
// `scale` to millimetres.
function setCurrentObject(object, { reframe, recenter = true, source = object, scale = 1000 }) {
  displayToken++;
  removeCurrentObject();
  currentModel = object;
  exportSource = source;
  exportScale = scale;
  scene.add(object);
  placeModel(object, reframe, recenter);
  refreshHelpers();
}

function removeCurrentObject() {
  for (const object of [currentModel, edgeGroup, capGroup]) if (object) scene.remove(object);
  currentModel = edgeGroup = capGroup = exportSource = null;
}

// Rebuilds what depends on the current model's shape and placement: edge lines,
// section caps and the size readout.
function refreshHelpers() {
  if (edgeGroup) scene.remove(edgeGroup);
  if (capGroup) scene.remove(capGroup);
  currentModel.updateMatrixWorld(true);
  edgeGroup = buildEdges(currentModel);
  scene.add(edgeGroup);
  capGroup = buildCaps(currentModel);
  scene.add(capGroup);
  applyWireframeState();
  syncPartHelpers();

  const part = measure(exportRoot());
  partBox = part.box;
  partInfoText = describePart(part);
  // Measured points belong to the previous shape.
  clearRuler();
  if (section.on) updateSectionPlane();
  if (!busy) showViewerStatus(idleStatusText());
}

function showModel(gltf, reframe, parts, motionSpec) {
  // Untouched copy for export and measuring, taken before the viewer rescales and moves it.
  const source = gltf.scene.clone();
  const model = gltf.scene;
  // export_gltf follows the glTF spec (units = meters); build123d models are
  // authored in mm, so scale back up to keep the viewer's camera math (tuned
  // for mm-scale numbers) from clipping small parts against the near plane.
  model.scale.setScalar(1000);
  colorParts(model, parts);
  setCurrentObject(model, { reframe, source });
  setupMotion(model, parts, motionSpec);
  printModelChanged();
}

// An empty viewer, for a part that hasn't been built yet.
function clearViewer() {
  displayToken++;
  resetMotion();
  setPrintMode(false);
  setPicking(false);
  setCompareMode(false);
  setSection(false);
  setMeasuring(false);
  removeCurrentObject();
  partInfoText = "";
  partBox = null;
  viewerStatus.hidden = true;
  modelTools.forEach((btn) => (btn.disabled = true));
  paramsCard.hidden = true;
  partsCard.hidden = true;
  renderInsight(null);
  updateUndoButtons();
  setCodeView("");
}

function loadModel(glbBytes, reframe, parts, motionSpec) {
  const token = ++displayToken;
  loader.parse(
    glbBytes.slice().buffer,
    "",
    (gltf) => token === displayToken && showModel(gltf, reframe, parts, motionSpec),
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

function addUserEntry(text, image = null) {
  if (emptyState) emptyState.remove();
  const el = document.createElement("div");
  fillUserEntry(el, text, image);
  chatLog.appendChild(el);
  scrollChatToEnd();
}

// image: a small data: URL of a picture sent with the prompt.
function fillUserEntry(el, text, image) {
  el.className = "entry entry-user";
  // Only pictures made here: an imported project file could name anything.
  if (typeof image === "string" && image.startsWith("data:image/")) {
    const img = document.createElement("img");
    img.className = "entry-image";
    img.alt = "Attached picture";
    img.src = image;
    el.append(img);
  }
  const span = document.createElement("span");
  span.textContent = text;
  el.append(span);
}

// Counts up on whatever entry is currently pending. A build can take anywhere
// from a few seconds to a couple of minutes depending on the provider and how
// many repair attempts it needs, and a timer that is plainly still moving says
// "working" far better than three dots that look the same at 5s and at 90s.
let elapsedTimer = null;

function stopElapsed() {
  clearInterval(elapsedTimer);
  elapsedTimer = null;
}

// note: what actually happens while they wait. Said once, plainly, instead of
// pretending to know which step the server is on — it doesn't report that.
function addThinkingEntry(text, note = "") {
  const el = document.createElement("div");
  el.className = "entry entry-status";
  el.innerHTML = '<span class="thinking-dots"><span></span><span></span><span></span></span><span></span>';
  const label = el.lastElementChild;
  label.textContent = text;

  if (note) {
    const hint = document.createElement("span");
    hint.className = "entry-note";
    hint.textContent = note;
    el.append(hint);
  }

  stopElapsed();
  const started = Date.now();
  elapsedTimer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    // Only once it's long enough to be worth watching.
    if (seconds >= 3) label.textContent = `${text} ${seconds}s`;
  }, 1000);

  chatLog.appendChild(el);
  scrollChatToEnd();
  return el;
}

function setEntrySuccess(el, text) {
  stopElapsed();
  el.className = "entry entry-status is-success";
  el.innerHTML = `${ICON_CHECK}<span></span>`;
  el.querySelector("span").textContent = text;
  scrollChatToEnd();
}

// The server leads a build failure with the exception itself and puts the
// traceback after a blank line, so the first half is the bit worth reading.
function splitError(error) {
  const gap = String(error || "").indexOf("\n\n");
  if (gap === -1) return { headline: String(error || ""), detail: "" };
  return { headline: error.slice(0, gap), detail: error.slice(gap + 2) };
}

// Keeps a traceback from taking over the chat: it's still there, just folded.
function addErrorDetail(el, detail) {
  if (!detail) return;
  const wrap = document.createElement("details");
  wrap.className = "entry-detail";
  const summary = document.createElement("summary");
  summary.textContent = "Where it failed";
  const body = document.createElement("p");
  body.textContent = detail;
  wrap.append(summary, body);
  el.append(wrap);
}

function setEntryError(el, text) {
  stopElapsed();
  el.className = "entry entry-status is-error";
  el.innerHTML = `${ICON_ALERT}<span></span>`;
  el.querySelector("span").textContent = text;
  // a collapsed bottom sheet would hide the error
  setPanelCollapsed(false);
  scrollChatToEnd();
}

// A generation that gave up. The raw error is written for the model — it's the
// repair instruction that didn't work — so it goes behind a disclosure, and the
// user gets a plain reason, something to try, and a way to retry in one click.
function setGenerateFailure(el, error, retry) {
  stopElapsed();
  el.className = "entry entry-status is-error";
  el.innerHTML = `${ICON_ALERT}<span></span>`;
  el.querySelector("span").textContent = "Couldn't build that one.";

  const hint = document.createElement("span");
  hint.className = "entry-note";
  hint.textContent =
    "The AI hit the same problem three times running. Giving it exact sizes, or asking for a simpler version first and adding detail afterwards, usually gets past it.";
  el.append(hint);

  if (error) {
    const detail = document.createElement("details");
    detail.className = "entry-detail";
    const summary = document.createElement("summary");
    summary.textContent = "What it got stuck on";
    const body = document.createElement("p");
    body.textContent = error;
    detail.append(summary, body);
    el.append(detail);
  }

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "text-btn";
  again.textContent = "Try again";
  again.addEventListener("click", () => {
    if (busy) return;
    el.remove();
    retry();
  });
  actions.append(again);
  el.append(actions);

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

// The active part's conversation and versions: the part's own arrays, so what's
// added here is saved with the part.
let conversation = [];
let versions = [];
let activeVersion = -1;
let currentCode = "";
let busy = false;

const fence = (code) => "```python\n" + code + "\n```";

function addVersion(entryEl, code, glbBytes, reframe, parts, motionSpec, insight = {}) {
  versions.push({
    code,
    glbBytes,
    parts,
    motion: motionSpec,
    // What the model said it would build, what measuring the solid found, and
    // how the two compared. All optional: versions saved before these existed
    // simply carry null, and every reader has to cope with that.
    spec: insight.spec || null,
    check: insight.check || null,
    measured: insight.measured || null,
    conversation: conversation.slice(),
  });
  const index = versions.length - 1;
  decorateVersionEntry(entryEl, index);
  showVersion(index, reframe);
  return index;
}

// Records a successful build, shown on its chat entry, as a new version of the active part.
function commitVersion(entryEl, text, data, reframe) {
  setEntrySuccess(entryEl, text);
  const index = addVersion(entryEl, data.code, base64ToBytes(data.glb_base64), reframe, data.parts, data.motion, {
    spec: data.spec,
    check: data.check,
    measured: data.measured,
  });
  recordLog({ kind: "version", text, version: index });
}

// Makes a chat entry the handle for version `index`: tagged, and clickable to restore it.
function decorateVersionEntry(entryEl, index) {
  versions[index].entryEl = entryEl;

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
}

/* ---------------- undo and redo across versions ---------------- */

// Versions are only ever appended, so undo never destroys anything: it moves
// the part's "you are here" pointer back through the versions this session
// visited, and redo moves it forward again. Each part keeps its own trail, so
// switching parts doesn't tangle two histories together.
const NO_TRAIL = { back: [], forward: [] };

function trail(part) {
  // No part yet (the viewer is cleared, or projects are still loading): hand
  // back an empty trail rather than reaching into null.
  if (!part) return NO_TRAIL;
  if (!part.trail) part.trail = { back: [], forward: [] };
  return part.trail;
}

function updateUndoButtons() {
  const { back, forward } = trail(activePart);
  undoEditBtn.disabled = assembly.on || !back.length;
  redoEditBtn.disabled = assembly.on || !forward.length;
  undoEditBtn.title = back.length ? `Undo to v${back[back.length - 1] + 1} (Ctrl+Z)` : "Nothing to undo (Ctrl+Z)";
  redoEditBtn.title = forward.length
    ? `Redo to v${forward[forward.length - 1] + 1} (Ctrl+Shift+Z)`
    : "Nothing to redo (Ctrl+Shift+Z)";
}

function undoEdit() {
  const { back, forward } = trail(activePart);
  if (busy || assembly.on || !back.length) return;
  forward.push(activeVersion);
  showVersion(back.pop(), false, { track: false });
  showToast(`Back to v${activeVersion + 1}`);
}

function redoEdit() {
  const { back, forward } = trail(activePart);
  if (busy || assembly.on || !forward.length) return;
  back.push(activeVersion);
  showVersion(forward.pop(), false, { track: false });
  showToast(`Forward to v${activeVersion + 1}`);
}

undoEditBtn.addEventListener("click", undoEdit);
redoEditBtn.addEventListener("click", redoEdit);

// track: false when the move is itself an undo/redo, so stepping back and
// forward doesn't keep adding to the trail it is walking.
function showVersion(index, reframe, { track = true } = {}) {
  setCompareMode(false);
  if (track && activeVersion >= 0 && activeVersion !== index) {
    const { back, forward } = trail(activePart);
    back.push(activeVersion);
    // A new branch from here makes anything undone unreachable, as in any editor.
    forward.length = 0;
  }
  activeVersion = index;
  activePart.activeVersion = index;
  scheduleSave();
  versions.forEach((v, i) => v.entryEl?.classList.toggle("is-active", i === index));
  const version = versions[index];
  currentCode = version.code;
  setCodeView(version.code);
  modelTools.forEach((btn) => (btn.disabled = false));
  compareBtn.disabled = versions.length < 2; // nothing to compare with just one version
  updateMotionBtn();
  renderParams(version.code);
  renderInsight(version);
  updateUndoButtons();
  loadModel(version.glbBytes, reframe, version.parts, version.motion);
  if (narrowScreen.matches) setPanelCollapsed(true);
}

// Only worth offering on an assembly (several labelled parts) that doesn't
// already have a working motion rig — a plain solid has nothing to animate,
// and once motion works the Motion card's own slider takes over.
function updateMotionBtn() {
  const version = versions[activeVersion];
  const isAssembly = Boolean(version && version.parts && version.parts.length > 1);
  motionBtn.disabled = assembly.on || !isAssembly || Boolean(motion.rig);
}

function setBusy(on, label = "") {
  busy = on;
  sendBtn.disabled = on;
  chatLog.classList.toggle("is-busy", on);
  partTabs.classList.toggle("is-busy", on);
  paramsCard.classList.toggle("is-busy", on);
  paramsList.querySelectorAll("input").forEach((field) => (field.disabled = on));
  refreshCodeControls();
  refreshCodeStartBuild();
  if (on) showViewerStatus(label, { loading: true });
  else if (partInfoText) showViewerStatus(idleStatusText());
  else viewerStatus.hidden = true;
}

/* ---------------- design intent and geometry ---------------- */

// Both panels show values that came back from the server: the spec the model
// declared, and measurements taken off the built solid. Everything is written
// with textContent, never innerHTML — the spec is model-written text and is
// treated as untrusted, like any other.

const CHECK_MARKS = { pass: "✓", fail: "✕", skipped: "–" };

function addRow(parent, className, ...cells) {
  const row = document.createElement("div");
  row.className = className;
  for (const cell of cells) {
    if (cell === null || cell === undefined) continue;
    const el = document.createElement("span");
    el.className = cell.className;
    el.textContent = cell.text;
    row.append(el);
  }
  parent.append(row);
  return row;
}

function renderIntentCard(version) {
  const spec = version && version.spec;
  const check = version && version.check;
  if (!spec && !check) {
    intentCard.hidden = true;
    return;
  }

  intentChecks.replaceChildren();
  intentLists.replaceChildren();

  if (check) {
    const failed = (check.checks || []).filter((c) => c.status === "fail").length;
    const confidence = check.confidence === null || check.confidence === undefined ? null : Math.round(check.confidence * 100);
    intentVerdict.textContent = failed
      ? `${failed} check${failed === 1 ? "" : "s"} failed`
      : `${check.checked}/${check.checked} checked${confidence === null ? "" : ` · ${confidence}%`}`;
    intentVerdict.className = `insight-verdict ${failed ? "is-fail" : "is-pass"}`;

    for (const item of check.checks || []) {
      const row = addRow(
        intentChecks,
        `insight-check is-${item.status}`,
        { className: "check-mark", text: CHECK_MARKS[item.status] || "?" },
        { className: "check-name", text: item.name }
      );
      const detail = [item.expected && `wanted ${item.expected}`, item.actual && `built ${item.actual}`]
        .filter(Boolean)
        .join(" · ");
      const note = detail || item.detail;
      if (note) {
        const el = document.createElement("span");
        el.className = "check-detail";
        el.textContent = note;
        row.append(el);
      }
    }
    if (check.skipped) {
      const el = document.createElement("p");
      el.className = "params-hint";
      el.textContent =
        check.skipped === 1
          ? "1 thing couldn't be measured, and wasn't counted either way."
          : `${check.skipped} things couldn't be measured, and weren't counted either way.`;
      intentChecks.append(el);
    }
  } else {
    intentVerdict.textContent = "not checked";
    intentVerdict.className = "insight-verdict";
  }

  // What the user actually asked for, kept apart from what the AI decided for them.
  for (const [key, title] of [["explicit", "You asked for"], ["assumptions", "The AI assumed"]]) {
    const items = spec && Array.isArray(spec[key]) ? spec[key].filter((v) => typeof v === "string") : [];
    if (!items.length) continue;
    const section = document.createElement("div");
    section.className = `insight-list is-${key}`;
    const heading = document.createElement("div");
    heading.className = "insight-list-title";
    heading.textContent = title;
    section.append(heading);
    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    section.append(list);
    intentLists.append(section);
  }

  intentCard.hidden = false;
}

const MM3_PER_CM3 = 1000;

function renderGeometryCard(version) {
  const measured = version && version.measured;
  if (!measured) {
    geometryCard.hidden = true;
    return;
  }

  const healthy = measured.valid && !measured.degenerate_faces;
  geometryVerdict.textContent = healthy ? "valid solid" : "check geometry";
  geometryVerdict.className = `insight-verdict ${healthy ? "is-pass" : "is-fail"}`;

  const size = measured.size || [];
  const rows = [
    ["Bounding box", size.length === 3 ? `${size.map((v) => v.toFixed(2)).join(" × ")} mm` : null],
    ["Volume", measured.volume ? `${(measured.volume / MM3_PER_CM3).toFixed(3)} cm³` : null],
    ["Surface area", measured.area ? `${(measured.area / 100).toFixed(2)} cm²` : null],
    ["Faces", measured.faces],
    ["Edges", measured.edges],
    ["Vertices", measured.vertices],
    ["Shells", measured.shells],
    ["Valid solid", measured.valid === undefined ? null : measured.valid ? "yes" : "no"],
    ["Zero-area faces", measured.degenerate_faces === undefined ? null : measured.degenerate_faces],
  ];

  geometryValues.replaceChildren();
  for (const [label, value] of rows) {
    if (value === null || value === undefined) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    geometryValues.append(dt, dd);
  }

  geometryFeatures.replaceChildren();
  const features = Array.isArray(measured.holes) ? measured.holes : [];
  if (features.length) {
    const heading = document.createElement("div");
    heading.className = "insight-list-title";
    heading.textContent = "Round features";
    geometryFeatures.append(heading);
    for (const feature of features.slice(0, 12)) {
      const at = (feature.at || []).map((v) => v.toFixed(1)).join(", ");
      addRow(
        geometryFeatures,
        "geometry-feature",
        { className: "feature-kind", text: feature.kind === "boss" ? "boss" : "hole" },
        { className: "feature-size", text: `Ø${feature.diameter} × ${feature.height} mm` },
        { className: "feature-at", text: at ? `at ${at}` : "" }
      );
    }
    if (features.length > 12) {
      const more = document.createElement("p");
      more.className = "params-hint";
      more.textContent = `…and ${features.length - 12} more.`;
      geometryFeatures.append(more);
    }
  }

  geometryCard.hidden = false;
}

function renderInsight(version) {
  renderIntentCard(version);
  renderGeometryCard(version);
}

// The other half of the same transparency surface: the checks and confidence
// live here, the code they were run against is one click away.
intentCodeBtn.addEventListener("click", () => setCodeDrawer(true));

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

  // The intent goes with the rebuild, so a tweaked value is measured against
  // the same spec the part was built to. Nothing is repaired: the user asked
  // for this number, so a mismatch is reported rather than corrected.
  const intent = versions[activeVersion] ? versions[activeVersion].spec : null;
  const payload = { code: applyParam(currentCode, param, value), ...(intent ? { spec: intent } : {}) };
  const { data } = await callApi("/api/run", payload, pending);
  if (data && data.ok) {
    if (intent && !data.spec) data.spec = intent;
    // Follow-up prompts should build on the tweaked design, so it replaces the
    // latest code in the conversation. A new object keeps older version
    // snapshots (which share the array's items) unchanged.
    if (conversation.length && conversation[conversation.length - 1].role === "assistant") {
      conversation[conversation.length - 1] = { role: "assistant", content: fence(data.code) };
    }
    commitVersion(pending, label, data, false);
  } else {
    if (data) {
      const { headline, detail } = splitError(data.error);
      setEntryError(pending, `Couldn't rebuild with ${label}. ${headline}`);
      addErrorDetail(pending, detail);
    }
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

async function fetchHealth() {
  try {
    return await (await fetch(`${API_BASE}/api/health`)).json();
  } catch {
    return null;
  }
}

const PROVIDER_LABELS = { gemini: "Gemini", groq: "Groq", ollama: "Ollama" };
const PROVIDER_KEY = "jokercad-provider";
let preferredProvider = "";
try {
  preferredProvider = localStorage.getItem(PROVIDER_KEY) || "";
} catch {}

// Only worth a picker once there's a real choice; with one provider, "Auto" is it.
function populateProviderOptions(configured) {
  if (!configured || configured.length < 2) {
    providerPicker.hidden = true;
    return;
  }
  if (preferredProvider && !configured.includes(preferredProvider)) preferredProvider = "";
  providerSelect.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Auto";
  providerSelect.appendChild(auto);
  configured.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = PROVIDER_LABELS[name] || name;
    providerSelect.appendChild(opt);
  });
  providerSelect.value = preferredProvider;
  providerPicker.hidden = false;
}

providerSelect.addEventListener("change", () => {
  preferredProvider = providerSelect.value;
  try {
    if (preferredProvider) localStorage.setItem(PROVIDER_KEY, preferredProvider);
    else localStorage.removeItem(PROVIDER_KEY);
  } catch {}
});

// generations: { used, limit } from /api/health, or null when the server has no cap.
function renderUsageStat(generations) {
  if (!generations) {
    usageStat.hidden = true;
    return;
  }
  usageStat.textContent = `${generations.used}/${generations.limit} this hour`;
  usageStat.hidden = false;
}

// Refreshes the usage count after a generation — cheap, unauthenticated, and
// shared across everyone on this deployment (there's no per-visitor account
// to meter separately), so it's re-read rather than guessed at client-side.
async function refreshUsage() {
  const health = await fetchHealth();
  if (health) renderUsageStat(health.generations || null);
}

async function initAccess() {
  const health = await fetchHealth();
  if (!health) return; // If the server can't be reached, the first generate request will say so.
  populateProviderOptions(health.providers_configured);
  renderUsageStat(health.generations || null);
  if (!health.auth_required) return;
  if (password && (await checkPassword(password))) return;
  rememberPassword("");
  showLock();
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

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const prompt = input.value.trim();
  if ((!prompt && !attachment) || busy) return;
  const picture = attachment;
  input.value = "";
  autoResize();
  setAttachment(null);
  runPrompt(prompt, prompt || "Build this from the picture", { picture });
});

// Asked of the model by the Organic button; the chat shows ORGANIC_LABEL instead.
const ORGANIC_PROMPT =
  "Make this part organic. Keep every feature, hole, bore, pivot and mounting face where it is, and keep " +
  "the main dimensions, but give it a smooth, sculpted form: replace flat slabs and hard boxes with curved " +
  "profiles (arcs, splines, ellipses), taper or loft sections where it suits the part, blend where pieces " +
  "meet, and finish with result = soften(result, fillet_radius), with fillet_radius as a top-level parameter.";
const ORGANIC_LABEL = "✨ Make it organic";

organicBtn.addEventListener("click", () => {
  if (!busy && !assembly.on && versions.length) runPrompt(ORGANIC_PROMPT, ORGANIC_LABEL);
});

// Asked of the model by the Motion button, for an assembly that doesn't yet
// have a working `motion` dict — same one-click idea as Organic, so the user
// never has to type this out by hand.
const MOTION_PROMPT =
  "Add a `motion` dict so this can be animated with the app's Motion slider. Pick the part that stays " +
  "fixed as the ground, and add one joint per part that should move: its pivot point (or slide axis and " +
  "direction) and a drive value, so dragging the slider moves every joint together — the same shape as the " +
  "clamp example (ground, joints with parts/pivot/drive, attached, range). Every part meant to move needs " +
  "its own joint, or the slider won't move it. Keep every part, dimension and feature exactly as it is now; " +
  "only add the motion dict, and any solids it needs (like pins) that aren't already there.";
const MOTION_LABEL = "🔩 Add motion";

motionBtn.addEventListener("click", () => {
  if (!busy && !assembly.on && versions.length) runPrompt(MOTION_PROMPT, MOTION_LABEL);
});

// shownAs: what the chat shows for the prompt, when not the prompt itself.
// picture: a photo or sketch to build from, { base64, thumb }.
async function runPrompt(prompt, shownAs = prompt, { picture = null } = {}) {
  addUserEntry(shownAs, picture && picture.thumb);
  recordLog({ kind: "user", text: shownAs, ...(picture ? { image: picture.thumb } : {}) });
  sendBtn.classList.add("is-loading");
  setBusy(true, "Building part…");
  const pending = addThinkingEntry("Generating…", "The AI writes the code, the server builds the solid, then it's measured and checked against your request.");

  // The current part's intent rides along, so a follow-up ("make it 120 mm
  // long") is applied to known state rather than re-derived from the chat.
  const intent = versions[activeVersion] ? versions[activeVersion].spec : null;
  const payload = {
    prompt,
    history: conversation,
    fit: fitSelect.value,
    ...(picture ? { image: picture.base64 } : {}),
    ...(preferredProvider ? { provider: preferredProvider } : {}),
    ...(intent ? { spec: intent } : {}),
  };
  const { data, unauthorized } = await callApi("/api/generate", payload, pending);
  refreshUsage();
  if (unauthorized && shownAs === prompt) {
    input.value = prompt;
    autoResize();
  }
  if (unauthorized && picture) setAttachment(picture);
  if (data && data.ok) {
    // Later turns go by the code, so the picture itself isn't sent again.
    const asked = picture ? `(with a reference picture) ${prompt || "Build the object in the picture."}` : prompt;
    conversation.push({ role: "user", content: asked }, { role: "assistant", content: fence(data.code) });
    conversation.splice(0, Math.max(0, conversation.length - HISTORY_LIMIT));

    const retryNote = data.attempts > 1 ? ` · self-repaired after ${data.attempts} attempts` : "";
    setProviderBadge(data.provider_used);
    // A new part is named after its first successful prompt, unless renamed.
    if (activePart.autoName && !versions.length) {
      activePart.name = nameFromPrompt(prompt || "Part from a picture");
      activePart.autoName = false;
      renderPartTabs();
    }
    commitVersion(pending, `Built via ${data.provider_used}${retryNote}`, data, true);
    if (data.note) {
      // The part built, but the automatic review still sees a problem.
      const noteEl = document.createElement("div");
      chatLog.appendChild(noteEl);
      setEntryError(noteEl, `Self-check: ${data.note}`);
      noteEl.classList.replace("is-error", "is-warning");
      recordLog({ kind: "warning", text: `Self-check: ${data.note}` });
    }
  } else if (data) {
    setGenerateFailure(pending, data.error, () => runPrompt(prompt, shownAs, { picture }));
    recordLog({ kind: "error", text: data.error });
    if (data.code) setCodeView(data.code);
  }

  sendBtn.classList.remove("is-loading");
  setBusy(false);
  if (lockScreen.hidden) input.focus();
}

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
  if (on && compareState.on) setCompareMode(false);
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
  if (picker.on) return "Click a face or a hole to change it";
  if (ruler.on) return "Click a hole for its exact diameter, or two points to measure between them";
  if (assembly.mating) return assembly.mateFirst ? "Now click the face it should sit against" : "Click a flat face on the part to move";
  if (assembly.on) {
    const count = assembly.root ? assembly.root.children.length : 0;
    return count ? `${count} part${count === 1 ? "" : "s"} · ${partInfoText}` : "Insert parts from the panel to start";
  }
  return partInfoText;
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

/* Kernel-backed picking for the measure tool.

   The mesh on screen is a triangulation, so a point picked off it is only as
   exact as the tessellation. The server also sends the real cylinders it found
   (centre, axis and diameter, straight from OpenCascade), so a click near one
   is answered with that exact diameter and snapped to the true axis rather
   than to the nearest triangle corner. */

// Part coordinates (mm, Z up) to world, the same mapping the motion rig uses.
function partToWorld() {
  if (!currentModel) return null;
  return currentModel.matrixWorld.clone().multiply(MODEL_TO_GLTF);
}

function measuredFeatures() {
  const version = versions[activeVersion];
  const features = version && version.measured && version.measured.holes;
  return Array.isArray(features) ? features : [];
}

// The measured cylinder the click is aimed down, if any.
//
// This tests the ray rather than the surface point it hit, because the natural
// gesture — clicking the middle of a hole — hits nothing at all: looking down a
// through hole, the wall is edge-on and the middle is empty space. Aiming
// anywhere across the hole's mouth counts as picking it.
function featureAlongRay(event) {
  const toWorld = partToWorld();
  if (!toWorld) return null;

  // A collapsed viewport (a hidden pane) leaves the camera unprojectable, and
  // every comparison below would then be against NaN, which passes silently.
  if (!window.innerWidth || !window.innerHeight) return null;
  const pointer = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const { origin: eye, direction: look } = raycaster.ray;
  if (!Number.isFinite(eye.x) || !Number.isFinite(look.x)) return null;

  // Measurements are in millimetres but the model is displayed scaled, so a
  // radius has to be converted before comparing it with a world distance.
  const perMm = new THREE.Vector3().setFromMatrixScale(toWorld).x;
  if (!Number.isFinite(perMm) || perMm <= 0) return null;

  let best = null;
  for (const feature of measuredFeatures()) {
    if (!Array.isArray(feature.at) || !Array.isArray(feature.axis) || !feature.diameter) continue;
    const base = new THREE.Vector3(...feature.at).applyMatrix4(toWorld);
    const axis = new THREE.Vector3(...feature.axis).transformDirection(toWorld).normalize();
    if (!Number.isFinite(base.x) || !Number.isFinite(axis.x)) continue;

    // Closest approach between the view ray and the feature's axis.
    const between = base.clone().sub(eye);
    const lookDotAxis = look.dot(axis);
    const denominator = 1 - lookDotAxis * lookDotAxis;
    // Looking straight down the axis: the ray meets it, so take the aim as dead on.
    const alongRay =
      denominator < 1e-6
        ? between.dot(look)
        : (between.dot(look) - lookDotAxis * between.dot(axis)) / denominator;
    if (!Number.isFinite(alongRay) || alongRay <= 0) continue; // behind the camera, or unusable
    const onRay = eye.clone().addScaledVector(look, alongRay);
    const onAxis = base.clone().addScaledVector(axis, onRay.clone().sub(base).dot(axis));
    const missBy = onRay.distanceTo(onAxis);
    if (!Number.isFinite(missBy)) continue;

    // Anywhere across the mouth of the feature, with a little room at the rim.
    if (missBy > (feature.diameter / 2) * perMm * 1.15) continue;
    // Snap to the axis's own reference point rather than to wherever along it
    // this particular click happened to aim: two holes then measure exactly
    // centre to centre, instead of picking up a difference in depth.
    if (!best || alongRay < best.alongRay) best = { feature, alongRay, onAxis: base };
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

  // One click on a cylinder already has something exact to say.
  if (ruler.points.length === 1 && ruler.feature) {
    const { feature } = ruler;
    measureLabel.replaceChildren();
    const size = document.createElement("strong");
    size.textContent = `Ø${feature.diameter} mm`;
    const detail = document.createElement("span");
    detail.textContent = `${feature.kind} · ${feature.height} mm deep · measured, not from the mesh`;
    measureLabel.append(size, detail);
    measureLabel.hidden = false;
    positionMeasureLabel();
    return;
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
  if (!ruler.points.length) return;
  // Over the midpoint of a span, or over the feature itself for a single pick.
  const at =
    ruler.points.length < 2 ? ruler.points[0] : ruler.points[0].clone().lerp(ruler.points[1], 0.5);
  const point = toScreen(at);
  measureLabel.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, calc(-100% - 12px))`;
}

function clearRuler() {
  ruler.points = [];
  ruler.feature = null;
  drawRuler();
}

function setMeasuring(on) {
  if (on && assembly.mating) setMating(false);
  if (on) setPicking(false);
  if (on && compareState.on) setCompareMode(false);
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
  // A hole or boss is answered from the measured geometry, so its diameter is
  // the kernel's and the point sits on the true axis — which makes a following
  // click a real centre-to-centre span. Otherwise fall back to the mesh pick.
  const found = featureAlongRay(e);
  const point = found ? found.onAxis : pickPoint(e);
  if (!point) return;
  if (ruler.points.length === 2) ruler.points = [];
  ruler.feature = found ? found.feature : null;
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
    downloadBlob(data, `${exportName()}.step`);
    setEntrySuccess(pending, `Exported ${label} as STEP`);
  }
  setBusy(false);
}

// A transparent image of the current view, without the floor grid or measurements.
function exportPng() {
  const helpers = [grid, rulerGroup, transformHelper, mateGroup];
  const shown = helpers.map((helper) => helper.visible);
  helpers.forEach((helper) => (helper.visible = false));
  withExplodedOff(() => renderer.render(scene, camera));
  // Read straight after rendering, before the browser clears the canvas.
  const url = renderer.domElement.toDataURL("image/png");
  helpers.forEach((helper, i) => (helper.visible = shown[i]));
  downloadHref(url, `${exportName()}.png`);
}

// The active model as a GLB blob: written straight from the viewer's scene
// for an assembly (in metres, like any glTF), or the active version's
// already-built bytes for a single part. Shared by GLB export and AR.
async function currentGlbBlob() {
  if (assembly.on) {
    const glb = await withExplodedOff(() => {
      const root = new THREE.Group();
      root.add(assembly.root.clone());
      root.scale.setScalar(0.001);
      return new GLTFExporter().parseAsync(root, { binary: true });
    });
    return new Blob([glb], { type: "model/gltf-binary" });
  }
  const version = versions[activeVersion];
  return version ? new Blob([version.glbBytes], { type: "model/gltf-binary" }) : null;
}

const EXPORTERS = {
  step: exportStep,
  drawing: openDrawing,
  stl: () => {
    const stl = withExplodedOff(() => new STLExporter().parse(exportRoot(), { binary: true }));
    downloadBlob(new Blob([stl], { type: "model/stl" }), `${exportName()}.stl`);
  },
  glb: async () => {
    const blob = await currentGlbBlob();
    if (blob) downloadBlob(blob, `${exportName()}.glb`);
  },
  obj: () => {
    const obj = withExplodedOff(() => new OBJExporter().parse(exportRoot()));
    downloadBlob(new Blob([obj], { type: "text/plain" }), `${exportName()}.obj`);
  },
  dxf: () => {
    try {
      const info = withExplodedOff(() => buildDxf(exportRoot(), { renderer, view: currentViewName() }));
      downloadBlob(new Blob([info.dxf], { type: "application/dxf" }), `${exportName()}.dxf`);
    } catch (err) {
      showToast(err.message);
    }
  },
  png: exportPng,
};

// Whichever camera view button is active (Iso/Top/Front/Right), for DXF's
// "cut from this side" default; a free-orbited view or Iso falls back to Top,
// the usual way a flat part sits for cutting.
function currentViewName() {
  const active = viewButtons.find((btn) => btn.classList.contains("active"));
  const name = active ? active.dataset.view : "top";
  return name === "iso" ? "top" : name;
}

function setExportMenu(open) {
  exportMenu.hidden = !open;
  exportBtn.setAttribute("aria-expanded", String(open));
  exportBtn.classList.toggle("active", open);
  if (!open) return;
  // Exports the active version as shown normally, not the comparison overlay.
  if (compareState.on) setCompareMode(false);
  // STEP is rebuilt from a part's code; an assembly has no single script.
  exportMenu.querySelector('[data-format="step"]').hidden = assembly.on;
  // Positioned by hand: inside the toolbar it would be clipped when the
  // toolbar scrolls sideways on phones.
  const r = exportBtn.getBoundingClientRect();
  const width = exportMenu.offsetWidth;
  exportMenu.style.top = `${r.bottom + 8}px`;
  exportMenu.style.left = `${Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))}px`;
  exportMenu.querySelector(".menu-item").focus();
}

exportBtn.addEventListener("click", () => setExportMenu(exportMenu.hidden));

/* ---------------- the More menu ---------------- */

// The tools in here are the same buttons they always were, so nothing about
// how they work changes; this only opens and closes the thing they sit in.
function setMoreMenu(open) {
  moreMenu.hidden = !open;
  moreBtn.setAttribute("aria-expanded", String(open));
  moreBtn.classList.toggle("active", open);
  if (!open) return;
  if (!exportMenu.hidden) setExportMenu(false);
  const r = moreBtn.getBoundingClientRect();
  const width = moreMenu.offsetWidth;
  moreMenu.style.top = `${r.bottom + 8}px`;
  moreMenu.style.left = `${Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))}px`;
}

moreBtn.addEventListener("click", () => setMoreMenu(moreMenu.hidden));

// Picking a tool closes the menu, so the part isn't left behind a panel.
moreMenu.addEventListener("click", (e) => {
  const tool = e.target.closest(".tool-btn");
  if (tool && !tool.disabled) setMoreMenu(false);
});

document.addEventListener("pointerdown", (e) => {
  if (!moreMenu.hidden && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) setMoreMenu(false);
});

window.addEventListener("resize", () => setMoreMenu(false));

// Section, Measure, Compare and Wireframe stay on after the menu closes, and
// the only sign of that would otherwise be hidden inside it. Watching the
// buttons' own classes keeps the dot right without every mode having to
// remember to update it.
new MutationObserver(() => {
  moreBtn.classList.toggle("has-active", Boolean(moreMenu.querySelector(".tool-btn.active")));
}).observe(moreMenu, { subtree: true, attributes: true, attributeFilter: ["class"] });

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
  // A shared part gets a part of its own in the project, unless this one is still empty.
  if (versions.length || assembly.on) selectPart(addPart("Shared part"));
  addUserEntry("Open the shared part");
  recordLog({ kind: "user", text: "Open the shared part" });
  const pending = addThinkingEntry("Building the shared part…");
  setBusy(true, "Building part…");
  const { data } = await callApi("/api/run", { code }, pending);
  const ok = Boolean(data && data.ok);
  if (ok) {
    // Follow-up prompts then modify the shared part.
    conversation.push({ role: "user", content: "Start from this part." }, { role: "assistant", content: fence(data.code) });
    commitVersion(pending, "Opened the shared part", data, true);
  } else if (data) {
    const { headline, detail } = splitError(data.error);
    setEntryError(pending, `Couldn't build the shared part. ${headline}`);
    addErrorDetail(pending, detail);
  }
  setBusy(false);
  return ok;
}

// Building a shared part runs its code on the server, and a link can come from
// anyone, so it only happens when the person opening it asks, after they've
// had the chance to read the code. A link from the AR button's QR code adds
// ?ar=1, so building it drops straight into AR instead of the normal chat.
async function offerSharedPart() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const packed = location.hash.slice(SHARE_PREFIX.length);
  const wantsAr = new URLSearchParams(location.search).get("ar") === "1";
  history.replaceState(null, "", location.pathname);

  let code;
  try {
    code = await unpackCode(packed);
  } catch {
    const el = document.createElement("div");
    chatLog.appendChild(el);
    setEntryError(el, "That share link is incomplete or damaged, so the part can't be opened.");
    return;
  }

  if (assembly.on) selectPart(activePart);
  if (emptyState) emptyState.remove();
  setCodeView(code);
  const card = document.createElement("div");
  card.className = "entry entry-share";
  card.innerHTML = wantsAr
    ? '<div class="share-title">View this part in AR</div>' +
      "<p>Building it runs the part's code on the server, then opens it in AR. You can read the code first.</p>" +
      '<div class="share-actions"><button type="button" class="text-btn">View code</button>' +
      '<button type="button" class="primary-btn">View in AR</button></div>'
    : '<div class="share-title">Someone shared a part with you</div>' +
      "<p>Building it runs the part's code on the server. You can read the code first.</p>" +
      '<div class="share-actions"><button type="button" class="text-btn">View code</button>' +
      '<button type="button" class="primary-btn">Build it</button></div>';
  chatLog.appendChild(card);
  const [viewBtn, buildBtn] = card.querySelectorAll("button");
  viewBtn.addEventListener("click", () => setCodeDrawer(true));
  buildBtn.addEventListener("click", async () => {
    buildBtn.disabled = true;
    const ok = await buildSharedPart(code);
    if (!ok) {
      buildBtn.disabled = false;
      return;
    }
    card.remove();
    if (wantsAr) {
      const blob = await currentGlbBlob();
      if (blob) openArModal(blob, { shareable: false });
    }
  });
}

/* ---------------- view in AR ---------------- */

let modelViewerReady = null;
function ensureModelViewer() {
  if (!modelViewerReady) {
    modelViewerReady = new Promise((resolve, reject) => {
      if (customElements.get("model-viewer")) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load the AR viewer."));
      document.head.appendChild(script);
    });
  }
  return modelViewerReady;
}

let qrLibReady = null;
function ensureQrLib() {
  if (!qrLibReady) {
    qrLibReady = new Promise((resolve, reject) => {
      if (window.qrcode) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Couldn't load the QR code."));
      document.head.appendChild(script);
    });
  }
  return qrLibReady;
}

function isHandheld() {
  return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
}

let arBlobUrl = null;

// shareable: whether this part has a single script a QR code can carry (not
// an assembly), so a desktop viewer can offer "scan to view on your phone".
async function openArModal(blob, { shareable }) {
  try {
    await ensureModelViewer();
  } catch (err) {
    showToast(err.message);
    return;
  }
  if (arBlobUrl) URL.revokeObjectURL(arBlobUrl);
  arBlobUrl = URL.createObjectURL(blob);
  arViewer.setAttribute("src", arBlobUrl);
  arModal.hidden = false;
  arQrCard.hidden = true;
  if (!isHandheld()) {
    if (shareable) {
      arCopyLinkBtn.hidden = false;
      buildArQr().catch(() => {});
    } else {
      arCopyLinkBtn.hidden = true;
      arQrHint.textContent = "Open jokercad on your phone to view this in AR.";
      arQrBox.replaceChildren();
      arQrCard.hidden = false;
    }
  }
}

function closeArModal() {
  arModal.hidden = true;
  arViewer.removeAttribute("src");
  if (arBlobUrl) {
    URL.revokeObjectURL(arBlobUrl);
    arBlobUrl = null;
  }
}

async function buildArQr() {
  const url = `${location.origin}${location.pathname}?ar=1${SHARE_PREFIX}${await packCode(currentCode)}`;
  try {
    await ensureQrLib();
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    arQrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
  } catch {
    arQrBox.textContent = url;
  }
  arQrHint.textContent = "Scan with your phone's camera to view this in AR.";
  arQrCard.hidden = false;
}

arBtn.addEventListener("click", async () => {
  const blob = await currentGlbBlob();
  if (!blob) return;
  openArModal(blob, { shareable: !assembly.on && Boolean(currentCode) });
});

arCloseBtn.addEventListener("click", closeArModal);
arModal.addEventListener("click", (e) => {
  if (e.target === arModal) closeArModal();
});

arCopyLinkBtn.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?ar=1${SHARE_PREFIX}${await packCode(currentCode)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("AR link copied.");
  } catch {
    window.prompt("Copy this link to view the part in AR:", url);
  }
});

/* ---------------- whole-project planning ---------------- */

// Same shape as callApi, but not tied to a chat entry: planning happens
// before any part (or its chat log) exists yet.
async function planApi(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 480_000);
  try {
    const res = await fetch(`${API_BASE}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...passwordHeader(password) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.status === 401) {
      rememberPassword("");
      showLock();
      return { error: "This workspace needs the access password." };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: typeof body.detail === "string" ? body.detail : `Server returned ${res.status}` };
    }
    return { data: await res.json() };
  } catch (err) {
    return {
      error: err.name === "AbortError" ? "Request timed out after 8 minutes." : `Request failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

let plannedParts = [];

function openPlanModal() {
  if (busy) {
    showToast("Wait for the current build to finish.");
    return;
  }
  planModal.hidden = false;
  planIntro.hidden = false;
  planListSection.hidden = true;
  planProgress.hidden = true;
  planError.hidden = true;
  planInput.value = "";
  planInput.focus();
}

function closePlanModal() {
  planModal.hidden = true;
}

planProjectBtn.addEventListener("click", openPlanModal);
planCloseBtn.addEventListener("click", closePlanModal);
planModal.addEventListener("click", (e) => {
  if (e.target === planModal) closePlanModal();
});

function renderPlanParts() {
  planPartsEl.replaceChildren();
  plannedParts.forEach((p, i) => {
    const row = document.createElement("label");
    row.className = "plan-part-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.index = String(i);
    const name = document.createElement("span");
    name.className = "plan-part-name";
    name.textContent = p.name;
    const desc = document.createElement("span");
    desc.className = "plan-part-desc";
    desc.textContent = p.prompt;
    row.append(checkbox, name, desc);
    planPartsEl.appendChild(row);
  });
}

planGoBtn.addEventListener("click", async () => {
  const prompt = planInput.value.trim();
  if (!prompt) return;
  planGoBtn.disabled = true;
  planGoBtn.textContent = "Planning…";
  planError.hidden = true;
  const { data, error } = await planApi({ prompt, ...(preferredProvider ? { provider: preferredProvider } : {}) });
  refreshUsage();
  planGoBtn.disabled = false;
  planGoBtn.textContent = "Plan the parts";
  if (error || !data || !data.ok) {
    planError.textContent = (data && data.error) || error || "Couldn't plan that project.";
    planError.hidden = false;
    return;
  }
  plannedParts = data.parts;
  renderPlanParts();
  planIntro.hidden = true;
  planListSection.hidden = false;
});

planBackBtn.addEventListener("click", () => {
  planListSection.hidden = true;
  planIntro.hidden = false;
});

// Builds each chosen part exactly as if the user had created a part and typed
// its prompt by hand (same /api/generate call, same commitVersion), one at a
// time so each can see the UI update; then inserts the ones that built into
// the assembly, reusing insertPart's own non-overlapping placement.
planBuildBtn.addEventListener("click", async () => {
  const boxes = [...planPartsEl.querySelectorAll("input[type=checkbox]")];
  const chosen = boxes.filter((cb) => cb.checked).map((cb) => plannedParts[Number(cb.dataset.index)]);
  if (!chosen.length) return;
  planListSection.hidden = true;
  planProgress.hidden = false;
  planStatusList.replaceChildren();
  const rows = chosen.map((p) => {
    const li = document.createElement("li");
    li.className = "plan-status-row";
    li.textContent = `${p.name} — waiting…`;
    planStatusList.appendChild(li);
    return li;
  });

  const built = [];
  for (let i = 0; i < chosen.length; i++) {
    const planned = chosen[i];
    rows[i].textContent = `${planned.name} — building…`;
    rows[i].classList.add("is-building");
    const part = addPart(planned.name);
    selectPart(part);
    addUserEntry(planned.prompt);
    recordLog({ kind: "user", text: planned.prompt });
    setBusy(true, `Building ${planned.name}…`);
    const pending = addThinkingEntry("Generating…", "The AI writes the code, the server builds the solid, then it's measured and checked against your request.");
    const genPayload = {
      prompt: planned.prompt,
      history: [],
      fit: fitSelect.value,
      ...(preferredProvider ? { provider: preferredProvider } : {}),
    };
    const { data } = await callApi("/api/generate", genPayload, pending);
    refreshUsage();
    if (data && data.ok) {
      conversation.push({ role: "user", content: planned.prompt }, { role: "assistant", content: fence(data.code) });
      commitVersion(pending, `Built via ${data.provider_used}`, data, true);
      setProviderBadge(data.provider_used);
      built.push(part);
      rows[i].textContent = `${planned.name} — built`;
      rows[i].classList.remove("is-building");
      rows[i].classList.add("is-ok");
    } else {
      rows[i].textContent = `${planned.name} — failed: ${(data && data.error) || "couldn't reach the server"}`;
      rows[i].classList.remove("is-building");
      rows[i].classList.add("is-error");
    }
    setBusy(false);
  }

  if (built.length) {
    // enterAssembly checks `busy` itself, so it has to run before setBusy(true).
    if (!assembly.on) await enterAssembly();
    setBusy(true, "Assembling…");
    for (const part of built) await insertPart(part);
    setBusy(false);
  }

  closePlanModal();
  if (built.length === chosen.length) showToast(`Built and assembled ${built.length} part${built.length === 1 ? "" : "s"}.`);
  else if (built.length) showToast(`Built ${built.length} of ${chosen.length} parts and assembled them — see the chat for what failed.`);
  else showToast("None of the parts built. See the chat for details.");
});

/* ---------------- pictures ---------------- */

// A photo or sketch to send with the next prompt: { base64, thumb } (JPEGs).
let attachment = null;

// The picture redrawn at most `max` pixels across, on white (sketches often
// have transparent backgrounds), as a JPEG data: URL.
function shrinkPicture(bitmap, max, quality) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function attachPicture(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("That isn't a picture. Attach a photo or a sketch.");
    return;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    showToast("Couldn't open that picture.");
    return;
  }
  const full = shrinkPicture(bitmap, 1280, 0.85);
  setAttachment({ base64: full.split(",")[1], thumb: shrinkPicture(bitmap, 240, 0.7) });
  input.focus();
}

function setAttachment(value) {
  attachment = value;
  attachmentEl.hidden = !value;
  if (value) attachmentImg.src = value.thumb;
  else attachmentImg.removeAttribute("src");
  input.placeholder = value ? "What is it? Add sizes if you know them (optional)" : "Describe a part…";
}

attachBtn.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => {
  attachPicture(imageInput.files[0]);
  imageInput.value = "";
});
attachmentClear.addEventListener("click", () => setAttachment(null));

input.addEventListener("paste", (e) => {
  const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  e.preventDefault();
  attachPicture(item.getAsFile());
});

panel.addEventListener("dragover", (e) => {
  if (![...e.dataTransfer.items].some((item) => item.kind === "file")) return;
  e.preventDefault();
  panel.classList.add("is-dropping");
});
panel.addEventListener("dragleave", (e) => {
  if (!panel.contains(e.relatedTarget)) panel.classList.remove("is-dropping");
});
panel.addEventListener("drop", (e) => {
  e.preventDefault();
  panel.classList.remove("is-dropping");
  if (e.dataTransfer.files[0]) attachPicture(e.dataTransfer.files[0]);
});

/* ---------------- click to edit ---------------- */

const picker = { on: false, feature: null };
const pickGroup = new THREE.Group();
scene.add(pickGroup);
const pickMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd166,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

// Quick changes offered for each kind of picked feature.
const EDIT_CHIPS = {
  flat: ["Make it 2 mm thicker", "Round its edges", "Add a hole in the middle", "Remove it"],
  hole: ["Make it 2 mm wider", "Give it a sliding fit", "Countersink it for a screw", "Fill it in"],
  round: ["Make it 5 mm taller", "Make it 2 mm wider", "Round its top edge", "Remove it"],
  curved: ["Make it smoother", "Make it flatter", "Remove it"],
};

function setPicking(on) {
  picker.on = on && Boolean(currentModel) && !assembly.on;
  if (picker.on) {
    setMeasuring(false);
    setPrintMode(false);
    if (compareState.on) setCompareMode(false);
  }
  editBtn.classList.toggle("active", picker.on);
  renderer.domElement.style.cursor = picker.on ? "crosshair" : ruler.on ? "crosshair" : "";
  if (!picker.on) closeEditPopup();
  if (!busy && partInfoText) showViewerStatus(idleStatusText());
}

editBtn.addEventListener("click", () => setPicking(!picker.on));

function clearPickHighlight() {
  pickGroup.children.forEach((child) => child.geometry.dispose());
  pickGroup.clear();
}

const AXES = [
  [[1, 0, 0], "Right", "the right (+X)"],
  [[-1, 0, 0], "Left", "the left (−X)"],
  [[0, 1, 0], "Back", "the back (+Y)"],
  [[0, -1, 0], "Front", "the front (−Y)"],
  [[0, 0, 1], "Top", "up (+Z, the top)"],
  [[0, 0, -1], "Bottom", "down (−Z, the bottom)"],
];

// The nearest axis direction a (model-space) vector points in.
function facing(n) {
  const [axis, short, long] = AXES.reduce((best, a) =>
    n.x * a[0][0] + n.y * a[0][1] + n.z * a[0][2] > n.x * best[0][0] + n.y * best[0][1] + n.z * best[0][2] ? a : best
  );
  const aligned = n.x * axis[0] + n.y * axis[1] + n.z * axis[2] > 0.95;
  const vector = `(${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)})`;
  return aligned ? { short, long } : { short: "Sloped", long: `mostly ${long}, along ${vector}` };
}

function axisName(a) {
  const [x, y, z] = [Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)];
  if (z > 0.95) return "the Z axis (vertical)";
  if (x > 0.95) return "the X axis";
  if (y > 0.95) return "the Y axis";
  return `the direction (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)})`;
}

// What the user clicked, for the AI: the smooth surface around the clicked
// triangle (it grows across the part until a sharp edge), described in the
// part's own coordinates (mm, Z up) as a flat face, a round hole, a round
// outside surface, or a curved surface.
function describeFeature(hit) {
  const mesh = hit.object;
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.index;
  const count = (index ? index.count : position.count) / 3;
  const corner = (t, k) =>
    new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(3 * t + k) : 3 * t + k).applyMatrix4(mesh.matrixWorld);
  const triangle = new THREE.Triangle();
  const corners = [];
  const normals = [];
  const areas = [];
  for (let t = 0; t < count; t++) {
    const c = [corner(t, 0), corner(t, 1), corner(t, 2)];
    triangle.set(...c);
    corners.push(c);
    areas.push(triangle.getArea());
    normals.push(triangle.getNormal(new THREE.Vector3()));
  }
  // Corners closer than 0.01 mm count as the same point: the mesh isn't welded.
  const key = (v) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
  const byCorner = new Map();
  corners.forEach((c, t) =>
    c.forEach((v) => {
      const k = key(v);
      if (!byCorner.has(k)) byCorner.set(k, []);
      byCorner.get(k).push(t);
    })
  );
  const smooth = Math.cos(THREE.MathUtils.degToRad(25));
  const region = new Set([hit.faceIndex]);
  const queue = [hit.faceIndex];
  while (queue.length && region.size < 50000) {
    const t = queue.pop();
    for (const v of corners[t]) {
      for (const u of byCorner.get(key(v))) {
        if (!region.has(u) && areas[u] > 0 && normals[u].dot(normals[t]) > smooth) {
          region.add(u);
          queue.push(u);
        }
      }
    }
  }

  // Into the part's own frame (build123d: mm, Z up).
  const toModel = currentModel.matrixWorld.clone().multiply(MODEL_TO_GLTF).invert();
  const turn = new THREE.Matrix3().setFromMatrix4(toModel);
  const points = [];
  const pointNormals = [];
  const highlight = [];
  const modelCorners = [];
  const centre = new THREE.Vector3();
  const meanNormal = new THREE.Vector3();
  let area = 0;
  for (const t of region) {
    const middle = corners[t][0].clone().add(corners[t][1]).add(corners[t][2]).divideScalar(3).applyMatrix4(toModel);
    const normal = normals[t].clone().applyMatrix3(turn).normalize();
    points.push(middle);
    pointNormals.push(normal);
    centre.addScaledVector(middle, areas[t]);
    meanNormal.addScaledVector(normal, areas[t]);
    area += areas[t];
    highlight.push(...corners[t]);
    modelCorners.push(...corners[t].map((v) => v.clone().applyMatrix4(toModel)));
  }
  centre.divideScalar(area || 1);
  meanNormal.normalize();
  const mm = (v) => v.toFixed(1);
  const at = (v) => `(${mm(v.x)}, ${mm(v.y)}, ${mm(v.z)})`;

  // Which labelled part of an assembly it's on, if any.
  const labels = (versions[activeVersion] && versions[activeVersion].parts) || [];
  let partName = null;
  for (let o = mesh; o && o !== currentModel && !partName; o = o.parent) {
    partName = labels.find((label) => THREE.PropertyBinding.sanitizeNodeName(label) === o.name) || null;
  }
  const finish = (feature) => ({
    ...feature,
    label: partName ? `${partName}: ${feature.label}` : feature.label,
    description: partName ? `${feature.description}, on the part labelled "${partName}"` : feature.description,
    points: highlight,
  });

  if (pointNormals.every((n) => n.dot(meanNormal) > 0.999)) {
    const u = new THREE.Vector3().crossVectors(meanNormal, Math.abs(meanNormal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(meanNormal, u);
    const spread = (axis) => {
      const values = modelCorners.map((p) => p.dot(axis));
      return Math.max(...values) - Math.min(...values);
    };
    const side = facing(meanNormal);
    return finish({
      kind: "flat",
      label: `${side.short} face`,
      description: `the flat face facing ${side.long}, centred at ${at(centre)} mm, about ${mm(spread(u))} × ${mm(spread(w))} mm`,
    });
  }

  // A round surface's normals are all square to its axis, so every cross
  // product of two of them lies along it. Summing them (turned to agree)
  // gives the axis; a single pair can't, as opposite normals cross to nothing.
  const sample = pointNormals.filter((_, i) => i % Math.ceil(pointNormals.length / 200) === 0);
  const axis = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      cross.crossVectors(sample[i], sample[j]);
      axis.addScaledVector(cross, cross.dot(axis) < 0 ? -1 : 1);
    }
  }
  if (axis.length() > 1e-6) {
    axis.normalize();
    if (pointNormals.every((n) => Math.abs(n.dot(axis)) < 0.2)) {
      const flatten = (v) => v.clone().addScaledVector(axis, -v.dot(axis));
      const p = points.map(flatten);
      const n = pointNormals.map((v) => flatten(v).normalize());
      const meanP = p.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(p.length);
      const meanN = n.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(n.length);
      let top = 0;
      let bottom = 0;
      p.forEach((v, i) => {
        const dn = n[i].clone().sub(meanN);
        top += v.clone().sub(meanP).dot(dn);
        bottom += dn.lengthSq();
      });
      // Each point sits `radius` out along its normal from the axis; a hole's
      // normals point in, towards the axis, which makes the fit negative.
      const radius = bottom > 1e-9 ? top / bottom : 0;
      const along = modelCorners.map((v) => v.dot(axis));
      const length = Math.max(...along) - Math.min(...along);
      const through = meanP.clone().addScaledVector(meanN, -radius).addScaledVector(axis, (Math.max(...along) + Math.min(...along)) / 2);
      const diameter = mm(2 * Math.abs(radius));
      if (radius < 0) {
        return finish({
          kind: "hole",
          label: `Ø${diameter} hole`,
          description: `the round hole of diameter ${diameter} mm, its axis along ${axisName(axis)} through ${at(through)} mm, ${mm(length)} mm long`,
        });
      }
      return finish({
        kind: "round",
        label: `Ø${diameter} round surface`,
        description: `the round outside surface (a cylinder or boss) of diameter ${diameter} mm, its axis along ${axisName(axis)} through ${at(through)} mm, ${mm(length)} mm long`,
      });
    }
  }
  const side = facing(meanNormal);
  return finish({
    kind: "curved",
    label: "Curved surface",
    description: `the curved surface around ${at(centre)} mm, facing ${side.long}`,
  });
}

function openEditPopup(feature, x, y) {
  editTitle.textContent = `✏️ ${feature.label}`;
  editChips.replaceChildren(
    ...EDIT_CHIPS[feature.kind].map((text) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "edit-chip";
      chip.textContent = text;
      chip.addEventListener("click", () => submitEdit(text));
      return chip;
    })
  );
  editInput.value = "";
  editPopup.hidden = false;
  const left = Math.min(Math.max(12, x + 14), window.innerWidth - editPopup.offsetWidth - 12);
  const top = Math.min(Math.max(70, y + 14), window.innerHeight - editPopup.offsetHeight - 12);
  editPopup.style.left = `${left}px`;
  editPopup.style.top = `${top}px`;
  editInput.focus();
}

function closeEditPopup() {
  editPopup.hidden = true;
  picker.feature = null;
  clearPickHighlight();
}

function submitEdit(text) {
  const feature = picker.feature;
  if (!text || !feature || busy) return;
  setPicking(false);
  runPrompt(
    `Change only the feature I picked on the current part, ${feature.description}: ${text}. Keep everything else exactly as it is.`,
    `✏️ ${feature.label}: ${text}`
  );
}

editForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitEdit(editInput.value.trim());
});

// A click (not the end of an orbit drag) picks what's under the pointer.
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!picker.on || assembly.on || ruler.on || !pointerDownAt || e.button !== 0) return;
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 5) return;
  const hit = modelHitAt(e);
  if (!hit) {
    closeEditPopup();
    return;
  }
  const feature = describeFeature(hit);
  picker.feature = feature;
  clearPickHighlight();
  pickGroup.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(feature.points), pickMaterial));
  openEditPopup(feature, e.clientX, e.clientY);
});

/* ---------------- 3D print check ---------------- */

const PRINTERS = [
  { name: "Bambu Lab X1 / P1 / A1", bed: [256, 256, 256] },
  { name: "Bambu Lab A1 mini", bed: [180, 180, 180] },
  { name: "Prusa MK4", bed: [250, 210, 220] },
  { name: "Creality Ender-3", bed: [220, 220, 250] },
  { name: "Elegoo Neptune 4", bed: [225, 225, 265] },
];
const MATERIALS = [
  { name: "PLA", density: 1.24 },
  { name: "PETG", density: 1.27 },
  { name: "ABS", density: 1.04 },
  { name: "ASA", density: 1.07 },
  { name: "TPU", density: 1.21 },
  { name: "Nylon", density: 1.14 },
];
const INFILLS = [10, 15, 20, 30, 50, 100];

// The viewer's currency, with a typical price for 1 kg of filament in it.
const CURRENCY = (() => {
  const region = ((navigator.language || "").split("-")[1] || "").toUpperCase();
  if (region === "IN") return { code: "INR", price: 1200 };
  if (region === "GB") return { code: "GBP", price: 18 };
  if (["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR"].includes(region)) return { code: "EUR", price: 20 };
  return { code: "USD", price: 20 };
})();

const PRINT_SETTINGS_KEY = "jokercad-print";
const printSettings = (() => {
  const defaults = { printer: 0, material: 0, infill: 15, price: CURRENCY.price };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
})();

PRINTERS.forEach((p, i) => printerSelect.add(new Option(`${p.name} (${p.bed.join(" × ")} mm)`, String(i))));
MATERIALS.forEach((m, i) => materialSelect.add(new Option(m.name, String(i))));
INFILLS.forEach((v) => infillSelect.add(new Option(`${v}%`, String(v))));
printerSelect.value = String(printSettings.printer);
materialSelect.value = String(printSettings.material);
infillSelect.value = String(printSettings.infill);
priceInput.value = String(printSettings.price);
priceLabel.textContent = `Filament price (${CURRENCY.code} per kg)`;

for (const control of [printerSelect, materialSelect, infillSelect, priceInput]) {
  control.addEventListener("change", () => {
    printSettings.printer = Number(printerSelect.value);
    printSettings.material = Number(materialSelect.value);
    printSettings.infill = Number(infillSelect.value);
    printSettings.price = Math.max(0, Number(priceInput.value) || 0);
    try {
      localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(printSettings));
    } catch {}
    renderPrintReport();
  });
}

const printState = { on: false, rest: null, report: null };
const printOverlay = new THREE.Group();
scene.add(printOverlay);
const overhangMaterial = new THREE.MeshBasicMaterial({
  color: 0xff5a6e,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const thinMaterial = new THREE.MeshBasicMaterial({ color: 0xffa94d, depthTest: false, transparent: true });
const thinGeometry = new THREE.SphereGeometry(1, 10, 8);
// Print frame (mm, Z up) to the viewer's (Y up): the same turn as MODEL_TO_GLTF, without its scale.
const PRINT_TO_VIEWER = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

// The model as it sits in the viewer, in print terms: mm, Z up.
function printTriangles() {
  currentModel.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  currentModel.traverse((child) => {
    if (!child.isMesh || !shownInModel(child)) return;
    const position = child.geometry.getAttribute("position");
    const index = child.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(child.matrixWorld);
      out.push(v.x, -v.z, v.y);
    }
  });
  return Float32Array.from(out);
}

function setPrintMode(on) {
  on = on && Boolean(currentModel) && !assembly.on;
  if (on === printState.on) return;
  printState.on = on;
  printBtn.classList.toggle("active", on);
  printCard.hidden = !on;
  if (on) {
    setPicking(false);
    if (compareState.on) setCompareMode(false);
    // The check is for the part as designed, not part-way through its motion.
    if (motion.rig) {
      stopMotion(false);
      if (motion.rig.value) {
        setMotionValue(0);
        settleMotion();
      }
      motionCard.hidden = true;
    }
    printState.rest = currentModel.quaternion.clone();
    updatePrintCheck();
  } else {
    clearPrintOverlay();
    if (currentModel && printState.rest && !currentModel.quaternion.equals(printState.rest)) {
      currentModel.quaternion.copy(printState.rest);
      placeModel(currentModel, false);
      refreshHelpers();
    }
    printState.rest = null;
    printState.report = null;
    if (motion.rig) motionCard.hidden = false;
  }
}

// A new model while the check is open: check that one instead.
function printModelChanged() {
  if (!printState.on) return;
  printState.rest = currentModel.quaternion.clone();
  if (motion.rig) motionCard.hidden = true;
  updatePrintCheck();
}

function updatePrintCheck() {
  if (!printState.on || !currentModel) return;
  const tris = printTriangles();
  printState.report = analyzePrint(tris);
  drawPrintOverlay(tris, printState.report);
  renderPrintReport();
}

function clearPrintOverlay() {
  printOverlay.children.forEach((child) => child.geometry !== thinGeometry && child.geometry.dispose());
  printOverlay.clear();
}

// Red faces needing support and orange dots at thin walls, back in the viewer's frame.
function drawPrintOverlay(tris, report) {
  clearPrintOverlay();
  if (report.overhang.length) {
    const positions = new Float32Array(report.overhang.length * 9);
    report.overhang.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const o = 9 * t + 3 * k;
        positions.set([tris[o], tris[o + 2], -tris[o + 1]], 9 * i + 3 * k);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    printOverlay.add(new THREE.Mesh(geometry, overhangMaterial));
  }
  const size = (lastFrame ? lastFrame.dist / 2.1 : 50) * 0.01;
  for (const { point } of report.thin.slice(0, 200)) {
    const dot = new THREE.Mesh(thinGeometry, thinMaterial);
    dot.position.set(point[0], point[2], -point[1]);
    dot.scale.setScalar(size);
    dot.renderOrder = 9;
    printOverlay.add(dot);
  }
}

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${Math.round(minutes - hours * 60)} min`;
}

function renderPrintReport() {
  const report = printState.report;
  if (!report) return;
  const printer = PRINTERS[printSettings.printer] || PRINTERS[0];
  const material = MATERIALS[printSettings.material] || MATERIALS[0];
  const [sx, sy, sz] = report.size;
  const [bx, by, bz] = printer.bed;
  const fits = sz <= bz && ((sx <= bx && sy <= by) || (sx <= by && sy <= bx));

  const checks = [
    fits
      ? ["ok", `Fits the bed (${sx.toFixed(0)} × ${sy.toFixed(0)} × ${sz.toFixed(0)} mm)`]
      : ["bad", `Too big for this printer: ${sx.toFixed(0)} × ${sy.toFixed(0)} × ${sz.toFixed(0)} mm`],
  ];
  const supportArea = report.overhangArea / 100;
  checks.push(
    supportArea < 0.5 ? ["ok", "No supports needed"] : ["warn", `Needs supports under ${supportArea.toFixed(1)} cm² (red)`]
  );
  if (report.thin.length) {
    checks.push([
      "warn",
      `Walls thinner than 0.8 mm in ${report.thin.length} spot${report.thin.length === 1 ? "" : "s"} (orange); thinnest ≈ ${report.thinnest.toFixed(2)} mm`,
    ]);
  } else if (Number.isFinite(report.thinnest)) {
    checks.push(["ok", `Walls thick enough (thinnest ≈ ${report.thinnest.toFixed(1)} mm)`]);
  }
  if (report.contactArea < 25) checks.push(["warn", "Very little of it touches the bed: try Auto-orient, or add a brim"]);
  printChecks.replaceChildren(
    ...checks.map(([level, text]) => {
      const item = document.createElement("li");
      item.className = `check-${level}`;
      item.textContent = text;
      return item;
    })
  );

  // Rough slicer maths: walls and top/bottom as a 0.9 mm shell, infill inside
  // it, sparse supports under the overhangs, 1.75 mm filament.
  const shell = Math.min(report.volume, report.area * 0.9);
  const infill = (report.volume - shell) * (printSettings.infill / 100);
  const support = report.overhangArea * report.overhangHeight * 0.12;
  const extruded = shell + infill + support;
  const grams = (extruded / 1000) * material.density;
  const metres = extruded / (Math.PI * 0.875 * 0.875) / 1000;
  const minutes = (extruded / 10) * 1.25 / 60 + (sz / 0.2) * 2 / 60;
  const cost = (grams / 1000) * printSettings.price;
  const money = new Intl.NumberFormat(navigator.language, {
    style: "currency",
    currency: CURRENCY.code,
    maximumFractionDigits: cost < 10 ? 2 : 0,
  }).format(cost);
  printEstimate.textContent = `≈ ${grams.toFixed(0)} g of ${material.name} · ${metres.toFixed(1)} m · ${money} · about ${formatDuration(minutes)}`;
}

function autoOrient() {
  if (!printState.on) return;
  const { rotation } = bestOrientation(printTriangles());
  const [a, b, c, d, e, f, g, h, i] = rotation;
  const turn = new THREE.Matrix4().set(a, b, c, 0, d, e, f, 0, g, h, i, 0, 0, 0, 0, 1);
  // The rotation is in print terms; turn it into the viewer's.
  const inViewer = PRINT_TO_VIEWER.clone().multiply(turn).multiply(PRINT_TO_VIEWER.clone().invert());
  currentModel.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(inViewer));
  placeModel(currentModel, true);
  refreshHelpers();
  updatePrintCheck();
}

function orientAsDesigned() {
  if (!printState.on || !printState.rest) return;
  currentModel.quaternion.copy(printState.rest);
  placeModel(currentModel, true);
  refreshHelpers();
  updatePrintCheck();
}

function export3mf() {
  if (!printState.on) return;
  const printer = PRINTERS[printSettings.printer] || PRINTERS[0];
  const file = make3mf(printTriangles(), [printer.bed[0] / 2, printer.bed[1] / 2]);
  downloadBlob(new Blob([file], { type: "model/3mf" }), `${exportName()}.3mf`);
}

printBtn.addEventListener("click", () => setPrintMode(!printState.on));
printCloseBtn.addEventListener("click", () => setPrintMode(false));
orientBtn.addEventListener("click", autoOrient);
orientResetBtn.addEventListener("click", orientAsDesigned);
export3mfBtn.addEventListener("click", export3mf);

/* ---------------- fit ---------------- */

const FIT_KEY = "jokercad-fit";
try {
  const saved = localStorage.getItem(FIT_KEY);
  if (saved && [...fitSelect.options].some((o) => o.value === saved)) fitSelect.value = saved;
  else fitSelect.value = "print:sliding";
} catch {
  fitSelect.value = "print:sliding";
}
fitSelect.addEventListener("change", () => {
  try {
    localStorage.setItem(FIT_KEY, fitSelect.value);
  } catch {}
});

/* ---------------- engineering drawing ---------------- */

const DRAWING_KEY = "jokercad-drawing";
const drawingSettings = (() => {
  const region = ((navigator.language || "").split("-")[1] || "").toUpperCase();
  const defaults = { projection: region === "US" ? "third" : "first", sheet: "A4" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(DRAWING_KEY) || "{}") };
  } catch {
    return defaults;
  }
})();
drawingProjection.value = drawingSettings.projection;
drawingSheet.value = drawingSettings.sheet;
let drawingSvg = "";

function openDrawing() {
  if (!exportSource) return;
  drawingModal.hidden = false;
  renderDrawing();
}

function renderDrawing() {
  drawingSvg = "";
  drawingPreview.innerHTML = '<p class="drawing-wait">Drawing the views…</p>';
  // Lets the message show before the work, which can take a second or two.
  setTimeout(() => {
    try {
      const params = assembly.on
        ? []
        : extractParams(currentCode).map((p) => ({ name: humanize(p.name), value: p.value, unit: unitFor(p.hint) }));
      drawingSvg = withExplodedOff(() =>
        buildDrawing(exportRoot(), {
          renderer,
          title: assembly.on ? `${project.name} assembly` : activePart.name,
          project: project.name,
          material: (MATERIALS[printSettings.material] || MATERIALS[0]).name,
          params,
          projection: drawingSettings.projection,
          sheet: drawingSettings.sheet,
        }).svg
      );
      drawingPreview.innerHTML = drawingSvg;
    } catch (err) {
      drawingPreview.innerHTML = "";
      const message = document.createElement("p");
      message.className = "drawing-wait";
      message.textContent = `Couldn't draw this part: ${err.message}`;
      drawingPreview.append(message);
    }
  }, 40);
}

for (const control of [drawingProjection, drawingSheet]) {
  control.addEventListener("change", () => {
    drawingSettings.projection = drawingProjection.value;
    drawingSettings.sheet = drawingSheet.value;
    try {
      localStorage.setItem(DRAWING_KEY, JSON.stringify(drawingSettings));
    } catch {}
    renderDrawing();
  });
}

drawingSvgBtn.addEventListener("click", () => {
  if (drawingSvg) downloadBlob(new Blob([drawingSvg], { type: "image/svg+xml" }), `${exportName()}-drawing.svg`);
});

// Prints the sheet at its real size, so "Save as PDF" in the print dialog
// gives a PDF that's true to scale.
drawingPdfBtn.addEventListener("click", () => {
  if (!drawingSvg) return;
  const [width, height] = drawingSettings.sheet === "A3" ? [420, 297] : [297, 210];
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc =
    `<!doctype html><html><head><title>${exportName()}-drawing</title><style>@page{size:${width}mm ${height}mm;margin:0}` +
    `html,body{margin:0}svg{display:block;width:${width}mm;height:${height}mm}</style></head><body>${drawingSvg}</body></html>`;
  frame.addEventListener("load", () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  });
  document.body.appendChild(frame);
});

drawingCloseBtn.addEventListener("click", () => (drawingModal.hidden = true));
drawingModal.addEventListener("click", (e) => {
  if (e.target === drawingModal) drawingModal.hidden = true;
});

/* ---------------- compare versions ---------------- */

const compareState = { on: false, groupA: null, groupB: null };
const compareMaterialA = new THREE.MeshStandardMaterial({
  color: 0x5b9bff, transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.5, depthWrite: false,
});
const compareMaterialB = new THREE.MeshStandardMaterial({
  color: 0xffa94d, transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.5, depthWrite: false,
});

function setCompareMode(on) {
  on = on && Boolean(currentModel) && !assembly.on && versions.length > 1;
  if (on === compareState.on) return;
  compareState.on = on;
  compareBtn.classList.toggle("active", on);
  compareCard.hidden = !on;
  if (on) {
    setPicking(false);
    setPrintMode(false);
    setMeasuring(false);
    setSection(false);
    if (motion.rig) {
      stopMotion(false);
      motionCard.hidden = true;
    }
    currentModel.visible = false;
    if (edgeGroup) edgeGroup.visible = false;
    if (capGroup) capGroup.visible = false;
    populateCompareSelects();
    renderCompare();
  } else {
    clearCompareGroups();
    applyWireframeState(); // restores currentModel/edgeGroup/capGroup visibility
    if (motion.rig) motionCard.hidden = false;
  }
}

compareBtn.addEventListener("click", () => setCompareMode(!compareState.on));
compareCloseBtn.addEventListener("click", () => setCompareMode(false));

function populateCompareSelects() {
  const options = versions.map((_, i) => `<option value="${i}">v${i + 1}</option>`).join("");
  compareASelect.innerHTML = options;
  compareBSelect.innerHTML = options;
  // Defaults to the two most recent versions: "what did the last change do".
  compareASelect.value = String(Math.max(0, versions.length - 2));
  compareBSelect.value = String(versions.length - 1);
}

function clearCompareGroups() {
  if (compareState.groupA) scene.remove(compareState.groupA);
  if (compareState.groupB) scene.remove(compareState.groupB);
  compareState.groupA = compareState.groupB = null;
}

// The parsed model of one of the active part's own versions, cached the same
// way partScene() caches an assembly instance's.
function loadVersionModel(index) {
  const version = versions[index];
  version.scene ||= new Promise((resolve, reject) =>
    loader.parse(version.glbBytes.slice().buffer, "", (gltf) => resolve(gltf.scene), reject)
  );
  return version.scene;
}

// A coloured, translucent copy of a version's model, resting on the grid and
// centred on the origin — the same anchor for every version compared, so a
// local change stays visually aligned with the rest of the part.
function buildCompareGroup(sourceScene, material) {
  const model = sourceScene.clone();
  model.scale.setScalar(1000);
  model.traverse((o) => o.isMesh && (o.material = material));
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

async function renderCompare() {
  if (!compareState.on) return;
  const a = Number(compareASelect.value);
  const b = Number(compareBSelect.value);
  const token = ++displayToken;
  let sceneA, sceneB;
  try {
    [sceneA, sceneB] = await Promise.all([loadVersionModel(a), loadVersionModel(b)]);
  } catch (err) {
    showToast(`Couldn't load a version to compare: ${err.message || err}`);
    return;
  }
  if (token !== displayToken || !compareState.on) return;

  clearCompareGroups();
  compareState.groupA = buildCompareGroup(sceneA, compareMaterialA);
  compareState.groupB = buildCompareGroup(sceneB, compareMaterialB);
  scene.add(compareState.groupA, compareState.groupB);

  const box = new THREE.Box3().setFromObject(compareState.groupA).union(new THREE.Box3().setFromObject(compareState.groupB));
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  lastFrame = { dist: maxDim * 2.1, midY: size.y / 2 };
  grid.scale.setScalar(Math.max(maxDim / 60, 0.06));
  setView("iso");

  renderCompareStats(compareState.groupA, compareState.groupB);
  renderCompareDiff(versions[a].code, versions[b].code);
}

compareASelect.addEventListener("change", renderCompare);
compareBSelect.addEventListener("change", renderCompare);
compareRestoreABtn.addEventListener("click", () => showVersion(Number(compareASelect.value), true));
compareRestoreBBtn.addEventListener("click", () => showVersion(Number(compareBSelect.value), true));

function renderCompareStats(groupA, groupB) {
  const mA = measure(groupA);
  const mB = measure(groupB);
  // Swapped to match the app's usual X x Y x Z (build123d, Z up) labelling,
  // since these groups are still in the viewer's own Y-up frame.
  const sizeStr = (m) => `${m.size.x.toFixed(1)} × ${m.size.z.toFixed(1)} × ${m.size.y.toFixed(1)} mm`;
  const volStr = (m) => (m.volume >= 1000 ? `${(m.volume / 1000).toFixed(2)} cm³` : `${m.volume.toFixed(0)} mm³`);
  const cell = (text, changed) => {
    const span = document.createElement("span");
    if (changed) span.className = "stat-changed";
    span.textContent = text;
    return span;
  };
  const label = (text) => {
    const span = document.createElement("span");
    span.className = "stat-label";
    span.textContent = text;
    return span;
  };
  const sizeChanged = sizeStr(mA) !== sizeStr(mB);
  const volChanged = Math.abs(mA.volume - mB.volume) > 0.5;
  compareStats.replaceChildren(
    label("Size"), cell(sizeStr(mA), sizeChanged), cell(sizeStr(mB), sizeChanged),
    label("Volume"), cell(volStr(mA), volChanged), cell(volStr(mB), volChanged)
  );
}

function renderCompareDiff(codeA, codeB) {
  const frag = document.createDocumentFragment();
  for (const op of diffLines(codeA, codeB)) {
    const line = document.createElement("div");
    line.className = `diff-${op.type}`;
    line.textContent = op.line || " ";
    frag.append(line);
  }
  compareDiff.replaceChildren(frag);
}

/* ---------------- motion ---------------- */

// The model's own frame (build123d: mm, Z up) expressed in the glTF scene's
// (metres, Y up), the same mapping exportRoot() undoes.
const MODEL_TO_GLTF = new THREE.Matrix4()
  .set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1)
  .multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001));
const MOTION_HINT = "Drag to move the mechanism; every link follows its pins.";
const motion = { rig: null, bodies: [], toWorld: null, fromWorld: null, playing: false, frame: 0 };

function resetMotion() {
  stopMotion(false);
  motion.rig = null;
  motionCard.hidden = true;
  updateMotionBtn();
}

// spec: the `motion` dict from the part's code, as the server passed it on.
function setupMotion(model, parts, spec) {
  resetMotion();
  const rig = makeRig(spec, parts);
  if (!rig) return;
  model.updateMatrixWorld(true);
  motion.toWorld = model.matrixWorld.clone().multiply(MODEL_TO_GLTF);
  motion.fromWorld = motion.toWorld.clone().invert();
  // Each moving body's nodes, with where they sat as built.
  motion.bodies = rig.bodies.map((_, k) => {
    const nodes = [];
    for (const label of bodyLabels(rig, k)) {
      const name = THREE.PropertyBinding.sanitizeNodeName(label);
      model.traverse((o) => o.name === name && nodes.push({ node: o, rest: o.matrixWorld.clone() }));
    }
    return nodes;
  });
  motion.rig = rig;
  motionSlider.min = String(rig.range[0]);
  motionSlider.max = String(rig.range[1]);
  motionSlider.step = String((rig.range[1] - rig.range[0]) / 500);
  motionSlider.value = "0";
  motionHint.textContent = MOTION_HINT;
  showMotionValue();
  motionCard.hidden = false;
  updateMotionBtn();
}

function showMotionValue() {
  motionValue.textContent = `${motion.rig.value.toFixed(1)}${motion.rig.unit}`;
}

// Puts each moving part where the rig's pose says, relative to where it was built.
function applyMotion() {
  const { rig } = motion;
  rig.bodies.forEach((_, k) => {
    const [theta, dx, dy] = rig.pose.subarray(3 * k, 3 * k + 3);
    const move = new THREE.Matrix4().makeRotationZ(theta).setPosition(dx, dy, 0);
    const world = motion.toWorld.clone().multiply(move).multiply(motion.fromWorld);
    for (const { node, rest } of motion.bodies[k]) {
      const local = node.parent.matrixWorld.clone().invert().multiply(world.clone().multiply(rest));
      local.decompose(node.position, node.quaternion, node.scale);
    }
  });
  // Edge lines and section caps are redrawn once the motion stops.
  if (edgeGroup) edgeGroup.visible = false;
  if (capGroup) capGroup.visible = false;
}

function setMotionValue(target) {
  const reached = moveTo(motion.rig, target);
  applyMotion();
  motionSlider.value = String(motion.rig.value);
  showMotionValue();
  motionHint.textContent = reached
    ? MOTION_HINT
    : "That's as far as it goes: any further and the parts would come apart at a joint.";
}

function settleMotion() {
  if (currentModel) refreshHelpers();
}

function playMotion() {
  const { rig } = motion;
  const [low, high] = rig.range;
  const middle = (low + high) / 2;
  const swing = (high - low) / 2 || 1;
  // Starts from the slider's position, then sweeps the whole range back and forth.
  let phase = Math.asin(Math.max(-1, Math.min(1, (rig.value - middle) / swing)));
  let last = performance.now();
  motion.playing = true;
  motionPlayBtn.classList.add("is-playing");
  motionPlayBtn.title = "Pause";
  const tick = (now) => {
    if (!motion.playing) return;
    phase += ((now - last) / 3200) * 2 * Math.PI;
    last = now;
    setMotionValue(middle + swing * Math.sin(phase));
    motion.frame = requestAnimationFrame(tick);
  };
  motion.frame = requestAnimationFrame(tick);
}

function stopMotion(settle = true) {
  if (!motion.playing) return;
  motion.playing = false;
  cancelAnimationFrame(motion.frame);
  motionPlayBtn.classList.remove("is-playing");
  motionPlayBtn.title = "Play the motion";
  if (settle) settleMotion();
}

motionPlayBtn.addEventListener("click", () => {
  if (motion.playing) stopMotion();
  else if (motion.rig) playMotion();
});

motionSlider.addEventListener("input", () => {
  stopMotion(false);
  setMotionValue(Number(motionSlider.value));
});
motionSlider.addEventListener("change", settleMotion);

motionResetBtn.addEventListener("click", () => {
  if (!motion.rig) return;
  stopMotion(false);
  setMotionValue(0);
  settleMotion();
});

/* ---------------- projects ---------------- */

// Projects live in this browser (IndexedDB), so they need no server or account.
// "Export project file" writes one out, to keep a backup or move it elsewhere.
const DB_NAME = "jokercad";
const DB_STORE = "projects";
const LAST_PROJECT_KEY = "jokercad-last-project";

let projects = [];
let project = null;
let activePart = null;
let saveTimer = null;
let pendingSave = null;
let storageWarned = false;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let dbPromise = null;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function dbRequest(mode, makeRequest) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const request = makeRequest(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function newPart(name) {
  return { id: uid(), name, autoName: true, conversation: [], versions: [], activeVersion: -1, log: [] };
}

function newProject(name) {
  const created = { id: uid(), name, updatedAt: Date.now(), parts: [], assembly: { instances: [], joints: [] }, activePartId: null };
  created.parts.push(newPart("Part 1"));
  return created;
}

// Only what's needed to show and rebuild each version is kept; chat elements
// and parsed models are recreated after loading.
function serializeProject(p) {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    activePartId: p.activePartId,
    assembly: {
      instances: p.assembly.instances.map(({ id, partId, position, quaternion }) => ({ id, partId, position, quaternion })),
      joints: p.assembly.joints.map(
        ({ id, parent, child, kind, point, axis, restPosition, restQuaternion, range, value }) => ({
          id, parent, child, kind, point, axis, restPosition, restQuaternion, range, value,
        })
      ),
    },
    parts: p.parts.map((part) => ({
      id: part.id,
      name: part.name,
      autoName: part.autoName,
      conversation: part.conversation,
      activeVersion: part.activeVersion,
      log: part.log,
      versions: part.versions.map(({ code, glbBytes, parts, motion: motionSpec, spec, check, measured, conversation }) => ({
        code,
        glbBytes,
        parts: parts || null,
        motion: motionSpec || null,
        spec: spec || null,
        check: check || null,
        measured: measured || null,
        conversation,
      })),
    })),
  };
}

function hydrateProject(stored) {
  const p = { ...stored, assembly: { instances: [], joints: [], ...stored.assembly } };
  p.parts = (stored.parts || []).map((part) => ({ ...newPart(part.name), ...part }));
  if (!p.parts.length) p.parts.push(newPart("Part 1"));
  return p;
}

function scheduleSave() {
  if (!project) return;
  project.updatedAt = Date.now();
  if (pendingSave && pendingSave !== project) saveProject(pendingSave);
  pendingSave = project;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (pendingSave) saveProject(pendingSave);
  pendingSave = null;
}

async function saveProject(p) {
  try {
    await dbRequest("readwrite", (store) => store.put(serializeProject(p)));
  } catch {
    if (!storageWarned) showToast("This browser didn't save the project. Export it to keep a copy.");
    storageWarned = true;
  }
  // The local save above always happens first and independently: if sync is
  // off, unreachable, or fails, the project is still safe in this browser.
  pushToCloud(p);
}

window.addEventListener("pagehide", flushSave);

async function initProjects() {
  try {
    projects = (await dbRequest("readonly", (store) => store.getAll())).map(hydrateProject);
  } catch {
    projects = [];
  }
  if (!projects.length) projects.push(newProject("My first project"));
  let lastId = null;
  try {
    lastId = localStorage.getItem(LAST_PROJECT_KEY);
  } catch {}
  openProject(projects.find((p) => p.id === lastId) || mostRecentProject());
}

const mostRecentProject = () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];

function openProject(p) {
  if (busy) return;
  flushSave();
  if (assembly.on) leaveAssembly();
  project = p;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, p.id);
  } catch {}
  showProjectName();
  selectPart(p.parts.find((part) => part.id === p.activePartId) || p.parts[0]);
}

function showProjectName() {
  projectNameEl.textContent = project.name;
  document.title = `${project.name} · jokercad`;
}

function selectPart(part) {
  if (busy) return;
  if (assembly.on) leaveAssembly();
  activePart = part;
  project.activePartId = part.id;
  conversation = part.conversation;
  versions = part.versions;
  activeVersion = -1;
  currentCode = "";
  renderPartTabs();
  renderPartLog(part);
  if (versions.length) {
    const saved = part.activeVersion;
    // Switching parts isn't an edit, so it doesn't add to this part's trail.
    showVersion(saved >= 0 && saved < versions.length ? saved : versions.length - 1, true, { track: false });
  } else {
    clearViewer();
  }
}

function addPart(name) {
  const part = newPart(name || `Part ${project.parts.length + 1}`);
  if (name) part.autoName = false;
  project.parts.push(part);
  scheduleSave();
  return part;
}

function renamePart(part) {
  const name = window.prompt("Rename this part", part.name);
  if (!name || !name.trim()) return;
  part.name = name.trim().slice(0, 60);
  part.autoName = false;
  renderPartTabs();
  renderAssemblyPanel();
  scheduleSave();
}

function deletePart(part) {
  if (busy || project.parts.length < 2) return;
  if (!window.confirm(`Delete "${part.name}" and all its versions? This can't be undone.`)) return;
  project.parts = project.parts.filter((p) => p !== part);
  project.assembly.instances = project.assembly.instances.filter((i) => i.partId !== part.id);
  scheduleSave();
  selectPart(project.parts[0]);
}

// A short name from a part's first prompt: "a spur gear with 24 teeth" -> "Spur gear".
function nameFromPrompt(prompt) {
  const text = prompt
    .replace(/^\s*(please\s+)?((create|make|design|build|generate|model|draw)\s+)?(me\s+)?((a|an|the)\s+)?/i, "")
    .split(/[,.;:()]|\s(?:with|that|which|for|having|where|so)\s/i)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
  return text ? text[0].toUpperCase() + text.slice(1) : "Part";
}

function recordLog(entry) {
  activePart.log.push(entry);
  scheduleSave();
}

// Recreates a part's chat from its saved log.
function renderPartLog(part) {
  chatLog.replaceChildren();
  if (!part.log.length) {
    chatLog.append(emptyState);
    return;
  }
  for (const entry of part.log) {
    const el = document.createElement("div");
    chatLog.append(el);
    if (entry.kind === "user") {
      fillUserEntry(el, entry.text, entry.image);
    } else if (entry.kind === "version" && versions[entry.version]) {
      setEntrySuccess(el, entry.text);
      decorateVersionEntry(el, entry.version);
    } else if (entry.kind === "warning") {
      setEntryError(el, entry.text);
      el.classList.replace("is-error", "is-warning");
    } else {
      setEntryError(el, entry.text);
    }
  }
  scrollChatToEnd();
}

const ICON_ASSEMBLY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';

function renderPartTabs() {
  partTabs.replaceChildren();

  const asmTab = document.createElement("button");
  asmTab.type = "button";
  asmTab.className = "part-tab tab-assembly";
  asmTab.classList.toggle("active", assembly.on);
  asmTab.title = "Put this project's parts together";
  asmTab.innerHTML = `${ICON_ASSEMBLY}<span>Assembly</span>`;
  asmTab.addEventListener("click", () => enterAssembly());

  const addTab = document.createElement("button");
  addTab.type = "button";
  addTab.className = "part-tab tab-add";
  addTab.title = "Start a new part in this project";
  addTab.textContent = "+ New part";
  addTab.addEventListener("click", () => !busy && selectPart(addPart()));
  partTabs.append(asmTab, addTab);

  for (const part of project.parts) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "part-tab";
    const current = !assembly.on && part === activePart;
    tab.classList.toggle("active", current);
    tab.title = "Double-click to rename";
    const label = document.createElement("span");
    label.textContent = part.name;
    tab.append(label);
    if (current && project.parts.length > 1) {
      const close = document.createElement("span");
      close.className = "tab-close";
      close.title = "Delete this part";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePart(part);
      });
      tab.append(close);
    }
    tab.addEventListener("click", () => !current && selectPart(part));
    tab.addEventListener("dblclick", () => renamePart(part));
    partTabs.append(tab);
    if (current) requestAnimationFrame(() => tab.scrollIntoView({ block: "nearest" }));
  }
}

function setProjectMenu(open) {
  projectMenu.hidden = !open;
  projectBtn.setAttribute("aria-expanded", String(open));
  if (!open) return;
  projectList.replaceChildren();
  for (const p of [...projects].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "project-row";
    row.classList.toggle("active", p === project);
    const name = document.createElement("span");
    name.className = "project-row-name";
    name.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "project-row-meta";
    meta.textContent = `${p.parts.length} part${p.parts.length === 1 ? "" : "s"}`;
    row.append(name, meta);
    row.addEventListener("click", () => {
      setProjectMenu(false);
      if (p !== project) openProject(p);
    });
    projectList.append(row);
  }
  const r = projectBtn.getBoundingClientRect();
  projectMenu.style.top = `${r.bottom + 8}px`;
  projectMenu.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - projectMenu.offsetWidth - 12))}px`;
}

projectBtn.addEventListener("click", () => setProjectMenu(projectMenu.hidden));

document.addEventListener("pointerdown", (e) => {
  if (!projectMenu.hidden && !projectMenu.contains(e.target) && !projectBtn.contains(e.target)) setProjectMenu(false);
});

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jokercad";

function exportName() {
  return slug(assembly.on ? `${project.name} assembly` : activePart.name);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const PROJECT_ACTIONS = {
  plan() {
    openPlanModal();
  },
  fromcode() {
    openCodeStartModal();
  },
  new() {
    const name = window.prompt("Name the new project", "Untitled project");
    if (!name || !name.trim()) return;
    const created = newProject(name.trim().slice(0, 60));
    projects.push(created);
    openProject(created);
    scheduleSave();
  },
  rename() {
    const name = window.prompt("Rename this project", project.name);
    if (!name || !name.trim()) return;
    project.name = name.trim().slice(0, 60);
    showProjectName();
    scheduleSave();
  },
  export() {
    const data = serializeProject(project);
    data.parts.forEach((part) => part.versions.forEach((v) => (v.glbBytes = bytesToBase64(v.glbBytes))));
    const file = JSON.stringify({ format: "jokercad-project", version: 1, project: data });
    downloadBlob(new Blob([file], { type: "application/json" }), `${slug(project.name)}.jokercad.json`);
  },
  import() {
    importInput.click();
  },
  async delete() {
    if (!window.confirm(`Delete the project "${project.name}" and all its parts? This can't be undone.`)) return;
    const doomed = project;
    if (pendingSave === doomed) {
      clearTimeout(saveTimer);
      pendingSave = null;
    }
    projects = projects.filter((p) => p !== doomed);
    try {
      await dbRequest("readwrite", (store) => store.delete(doomed.id));
    } catch {}
    cloudSync.deleteProject(doomed.id).catch(() => {});
    if (!projects.length) projects.push(newProject("My first project"));
    openProject(mostRecentProject());
    scheduleSave();
  },
};

projectMenu.querySelectorAll("[data-action]").forEach((item) =>
  item.addEventListener("click", () => {
    setProjectMenu(false);
    if (busy) showToast("Wait for the current build to finish.");
    else PROJECT_ACTIONS[item.dataset.action]();
  })
);

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const stored = parsed && parsed.project;
    if (parsed.format !== "jokercad-project" || !stored || !Array.isArray(stored.parts)) {
      throw new Error("it isn't a jokercad project file");
    }
    for (const part of stored.parts) {
      part.versions = (part.versions || []).map((v) => ({ ...v, glbBytes: base64ToBytes(v.glbBytes) }));
    }
    // A new id, so importing the same file twice gives two projects.
    const imported = hydrateProject({ ...stored, id: uid(), updatedAt: Date.now() });
    projects.push(imported);
    openProject(imported);
    scheduleSave();
    showToast(`Imported "${imported.name}"`);
  } catch (err) {
    showToast(`Couldn't import that file: ${err.message}`);
  }
});

/* ---------------- cloud sync ---------------- */
// Entirely optional (see README): the project URL and key live in the
// site's own environment variables, fetched once from /api/health, never
// asked of a visitor. With none set there, sync.js's init() finds nothing,
// accountBtn stays hidden, and the app works exactly as it does with only
// this browser's local storage.

let wasSignedIn = false;

async function initCloudSync() {
  cloudSync.onChange(({ configured, user }) => {
    accountBtn.hidden = !configured;
    accountBtn.classList.toggle("is-synced", configured && Boolean(user));
    if (!configured) return;
    accountEmail.textContent = user ? user.email : "";
    accountSignedOut.hidden = Boolean(user);
    accountSignedIn.hidden = !user;
    if (user && !wasSignedIn) {
      wasSignedIn = true;
      mergeCloudProjects();
    } else if (!user) {
      wasSignedIn = false;
    }
  });
  await cloudSync.init();
}

function setAccountMenu(open) {
  accountMenu.hidden = !open;
  accountBtn.setAttribute("aria-expanded", String(open));
  if (!open) return;
  const signedIn = Boolean(cloudSync.currentUserOrNull());
  accountSignedOut.hidden = signedIn;
  accountSignedIn.hidden = !signedIn;
  if (signedIn) syncStatusEl.textContent = "Up to date";
  const r = accountBtn.getBoundingClientRect();
  const width = accountMenu.offsetWidth;
  accountMenu.style.top = `${r.bottom + 8}px`;
  accountMenu.style.left = `${Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))}px`;
  (signedIn ? signOutBtn : signInEmail).focus();
}

accountBtn.addEventListener("click", () => setAccountMenu(accountMenu.hidden));
document.addEventListener("pointerdown", (e) => {
  if (!accountMenu.hidden && !accountMenu.contains(e.target) && !accountBtn.contains(e.target)) setAccountMenu(false);
});

function setStatus(el, text, kind) {
  el.textContent = text;
  el.hidden = !text;
  el.className = `account-status${kind ? ` is-${kind}` : ""}`;
}

signInForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = signInEmail.value.trim();
  if (!email) return;
  const button = document.getElementById("signInBtn");
  button.disabled = true;
  try {
    await cloudSync.signInWithEmail(email);
    setStatus(signInStatus, `Check ${email} for a sign-in link.`, "ok");
  } catch (err) {
    setStatus(signInStatus, err.message || String(err), "error");
  } finally {
    button.disabled = false;
  }
});

signOutBtn.addEventListener("click", () => cloudSync.signOut());

// A project as a JSON-safe row (GLBs base64-encoded), for the cloud table.
function projectToRow(p) {
  const data = serializeProject(p);
  data.parts.forEach((part) => part.versions.forEach((v) => (v.glbBytes = bytesToBase64(v.glbBytes))));
  return data;
}

// The reverse: a cloud row back into a hydrated project.
function rowToProject(row) {
  const data = row.data;
  const parts = (data.parts || []).map((part) => ({
    ...part,
    versions: (part.versions || []).map((v) => ({ ...v, glbBytes: base64ToBytes(v.glbBytes) })),
  }));
  return hydrateProject({ ...data, parts });
}

async function pushToCloud(p) {
  if (!cloudSync.isConfigured() || !cloudSync.currentUserOrNull()) return;
  try {
    await cloudSync.pushProject(p.id, p.name, p.updatedAt, projectToRow(p));
    if (!accountMenu.hidden) setStatus(syncStatusEl, "Up to date", null);
  } catch (err) {
    if (!accountMenu.hidden) setStatus(syncStatusEl, `Couldn't sync: ${err.message || err}`, "error");
  }
}

// Runs once right after signing in: pulls in anything newer in the cloud,
// pushes up anything newer (or only) here. Ties (equal timestamps) are left
// alone. Editing the same project on two devices at the same moment isn't
// merged field-by-field — whichever side saved most recently wins outright.
async function mergeCloudProjects() {
  let rows;
  try {
    rows = await cloudSync.pullProjects();
  } catch (err) {
    showToast(`Couldn't reach sync: ${err.message || err}`);
    return;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const row of rows) {
    const local = projects.find((p) => p.id === row.id);
    if (local && local.updatedAt >= row.updatedAt) continue;
    const hydrated = rowToProject(row);
    const index = projects.findIndex((p) => p.id === row.id);
    if (index >= 0) projects[index] = hydrated;
    else projects.push(hydrated);
    await dbRequest("readwrite", (store) => store.put(serializeProject(hydrated))).catch(() => {});
    if (project && project.id === row.id) openProject(hydrated);
  }
  for (const p of projects) {
    const row = byId.get(p.id);
    if (!row || p.updatedAt > row.updatedAt) await pushToCloud(p);
  }
  if (project) renderPartTabs();
  showToast("Synced your projects.");
}

/* ---------------- assembly ---------------- */

const assembly = {
  on: false,
  root: null,
  selected: null,
  mating: false,
  mateFirst: null,
  undo: [],
  // Picking flow for joint creation: { kind: 'pivot'|'slide', first: {group, round?} | null, second? }.
  jointing: null,
  explode: 0,
  colliding: new Set(),
};

const transform = new TransformControls(camera, renderer.domElement);
// three.js r169 puts the handles in a separate helper object; older releases
// made the controls themselves the object to add.
const transformHelper = transform.getHelper ? transform.getHelper() : transform;
transform.setTranslationSnap(1);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
transform.setSize(0.8);
scene.add(transformHelper);

// Highlights the face picked for snapping.
const mateGroup = new THREE.Group();
scene.add(mateGroup);
const mateMaterial = new THREE.MeshBasicMaterial({
  color: 0x3ddc97,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

// Tints a part red when it overlaps another part.
const collisionMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b4e, metalness: 0.32, roughness: 0.42 });

const instanceGroups = () => (assembly.root ? assembly.root.children : []);
const selectedGroup = () => instanceGroups().find((g) => g.userData.instance.id === assembly.selected) || null;

function instanceGroupOf(object) {
  for (let o = object; o; o = o.parent) if (o.userData.instance) return o;
  return null;
}

// The parsed model of a part's current version, shared by all its copies.
function partScene(part) {
  const version = part.versions[part.activeVersion >= 0 ? part.activeVersion : part.versions.length - 1];
  if (!version) return Promise.resolve(null);
  version.scene ||= new Promise((resolve, reject) =>
    loader.parse(version.glbBytes.slice().buffer, "", (gltf) => resolve(gltf.scene), reject)
  );
  return version.scene;
}

async function enterAssembly() {
  if (busy || assembly.on) return;
  setSection(false);
  setMeasuring(false);
  setCodeDrawer(false);
  setExportMenu(false);
  resetMotion();
  setPrintMode(false);
  setPicking(false);
  setCompareMode(false);
  assembly.on = true;
  assembly.explode = 0;
  explodeSlider.value = "0";
  explodeValue.textContent = "0 mm";
  document.body.classList.add("assembly-mode");
  assemblyPanel.hidden = false;
  codeToggleBtn.disabled = true;
  setTransformMode(transform.getMode());
  renderPartTabs();
  renderAssemblyPanel();
  await rebuildAssembly(true);
}

function leaveAssembly() {
  assembly.on = false;
  setMating(false);
  cancelJointing();
  transform.detach();
  Object.assign(assembly, { root: null, selected: null, undo: [], explode: 0, colliding: new Set() });
  undoMoveBtn.disabled = true;
  document.body.classList.remove("assembly-mode");
  assemblyPanel.hidden = true;
  codeToggleBtn.disabled = false;
  collisionWarning.hidden = true;
  setSection(false);
  setMeasuring(false);
}

// Builds the assembly from the project: a copy of each inserted part's current
// version, in the part's colour, where the user placed it.
async function rebuildAssembly(reframe) {
  const token = ++displayToken;
  const root = new THREE.Group();
  root.name = project.name;
  for (const inst of project.assembly.instances) {
    const partIndex = project.parts.findIndex((p) => p.id === inst.partId);
    const part = project.parts[partIndex];
    const source = part && (await partScene(part).catch(() => null));
    if (!source) continue;
    const group = new THREE.Group();
    group.name = part.name;
    group.userData.instance = inst;
    const model = source.clone();
    model.scale.setScalar(1000);
    const material = partMaterials[partIndex % partMaterials.length];
    model.traverse((o) => {
      if (o.isMesh) {
        o.userData.baseMaterial = material;
        o.material = material;
      }
    });
    // A separate wrapper the explode view can offset without touching the
    // group's own transform, which joints, dragging and export all rely on.
    group.userData.model = model;
    group.add(model);
    group.position.fromArray(inst.position);
    group.quaternion.fromArray(inst.quaternion);
    root.add(group);
  }
  if (token !== displayToken || !assembly.on) return;
  transform.detach();
  assembly.root = root;
  setCurrentObject(root, { reframe, recenter: false, scale: 1 });
  modelTools.forEach((btn) => (btn.disabled = !root.children.length));
  shareBtn.disabled = true;
  // Part-only tools: they work on one part's code.
  editBtn.disabled = printBtn.disabled = organicBtn.disabled = compareBtn.disabled = motionBtn.disabled = true;
  paramsCard.hidden = true;
  partsCard.hidden = true;
  applyJoints();
  applyExplode();
  checkCollisions();
  // selectInstance re-renders the panel, picking up the joints/collisions above.
  selectInstance(assembly.selected);
}

function renderAssemblyPanel() {
  if (!assembly.on) return;
  asmPartList.replaceChildren();
  project.parts.forEach((part, i) => {
    const row = document.createElement("div");
    row.className = "asm-part";
    const dot = document.createElement("span");
    dot.className = "part-dot";
    dot.style.background = `#${partMaterials[i % partMaterials.length].color.getHexString()}`;
    const name = document.createElement("span");
    name.className = "asm-name";
    name.textContent = part.name;
    const insert = document.createElement("button");
    insert.type = "button";
    insert.className = "text-btn";
    insert.textContent = "Insert";
    insert.disabled = !part.versions.length;
    insert.title = part.versions.length ? `Add a copy of ${part.name}` : "Build this part first";
    insert.addEventListener("click", () => insertPart(part));
    row.append(dot, name, insert);
    asmPartList.append(row);
  });

  asmInstanceList.replaceChildren();
  const counts = new Map();
  let selectedLabel = "";
  for (const inst of project.assembly.instances) {
    const i = project.parts.findIndex((p) => p.id === inst.partId);
    if (i < 0) continue;
    counts.set(inst.partId, (counts.get(inst.partId) || 0) + 1);
    const label = `${project.parts[i].name} #${counts.get(inst.partId)}`;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "asm-instance";
    row.classList.toggle("active", inst.id === assembly.selected);
    const dot = document.createElement("span");
    dot.className = "part-dot";
    dot.style.background = `#${partMaterials[i % partMaterials.length].color.getHexString()}`;
    const text = document.createElement("span");
    text.textContent = label;
    row.append(dot, text);
    row.addEventListener("click", () => selectInstance(inst.id));
    asmInstanceList.append(row);
    if (inst.id === assembly.selected) selectedLabel = label;
  }
  if (!asmInstanceList.children.length) {
    asmInstanceList.innerHTML = '<p class="asm-empty">Nothing here yet. Insert a part above.</p>';
  }

  const multiple = instanceGroups().length > 1;
  jointsSection.hidden = !multiple;
  explodeSection.hidden = !multiple;
  renderJointsList();

  asmSelection.hidden = !selectedGroup();
  asmSelName.textContent = selectedLabel;
  updateSelectionFields();
}

// The name shown for an instance in the joints list: its part's name (copies
// of the same part aren't told apart here, which only matters if you joint
// two copies of one part to each other — rare enough to not be worth solving).
function instanceLabel(id) {
  const group = instanceGroups().find((g) => g.userData.instance.id === id);
  if (!group) return "(removed)";
  const part = project.parts.find((p) => p.id === group.userData.instance.partId);
  return part ? part.name : "?";
}

function renderJointsList() {
  asmJointList.replaceChildren();
  for (const joint of project.assembly.joints) {
    const row = document.createElement("div");
    row.className = "asm-joint";

    const head = document.createElement("div");
    head.className = "asm-joint-head";
    const kind = document.createElement("span");
    kind.className = "asm-joint-kind";
    kind.textContent = joint.kind;
    const name = document.createElement("span");
    name.className = "asm-name";
    name.textContent = `${instanceLabel(joint.parent)} ↔ ${instanceLabel(joint.child)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "asm-joint-remove";
    remove.title = "Remove this joint";
    remove.textContent = "×";
    remove.addEventListener("click", () => removeJoint(joint.id));
    head.append(kind, name, remove);

    const sliderRow = document.createElement("div");
    sliderRow.className = "asm-joint-row";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(joint.range[0]);
    slider.max = String(joint.range[1]);
    slider.step = "0.5";
    slider.value = String(joint.value);
    slider.setAttribute("aria-label", `${instanceLabel(joint.child)} ${joint.kind === "pivot" ? "angle" : "slide"}`);
    const unit = joint.kind === "pivot" ? "°" : " mm";
    const value = document.createElement("span");
    value.className = "motion-value";
    value.textContent = `${joint.value.toFixed(1)}${unit}`;
    slider.addEventListener("input", () => {
      joint.value = Number(slider.value);
      value.textContent = `${joint.value.toFixed(1)}${unit}`;
      applyJoints();
      applyExplode();
      refreshHelpers();
    });
    slider.addEventListener("change", () => {
      scheduleSave();
      checkCollisions();
    });
    sliderRow.append(slider, value);

    row.append(head, sliderRow);
    asmJointList.append(row);
  }
  if (!project.assembly.joints.length) {
    asmJointList.innerHTML = '<p class="asm-empty">No joints yet. Add one below.</p>';
  }
}

function selectInstance(id) {
  assembly.selected = id;
  const group = assembly.mating ? null : selectedGroup();
  if (group) transform.attach(group);
  else transform.detach();
  if (!selectedGroup()) assembly.selected = null;
  renderAssemblyPanel();
}

function setTransformMode(mode) {
  transform.setMode(mode);
  asmModeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
}

// Position fields use the part's own axes (Z up), like the code does.
function updateSelectionFields() {
  const group = selectedGroup();
  if (!group) return;
  const values = { x: group.position.x, y: -group.position.z, z: group.position.y };
  asmFields.forEach((field) => {
    if (document.activeElement !== field) field.value = values[field.dataset.axis].toFixed(1);
  });
}

function pushUndo(group) {
  assembly.undo.push({ id: group.userData.instance.id, position: group.position.toArray(), quaternion: group.quaternion.toArray() });
  if (assembly.undo.length > 50) assembly.undo.shift();
  undoMoveBtn.disabled = false;
}

// Saves a moved copy's placement and redraws what depends on it.
function commitInstance(group) {
  const inst = group.userData.instance;
  inst.position = group.position.toArray();
  inst.quaternion = group.quaternion.toArray();
  rebakeJointIfChild(group);
  applyJoints();
  scheduleSave();
  refreshHelpers();
  updateSelectionFields();
  checkCollisions();
}

function undoMove() {
  const step = assembly.undo.pop();
  undoMoveBtn.disabled = !assembly.undo.length;
  if (!step) return;
  const group = instanceGroups().find((g) => g.userData.instance.id === step.id);
  // A copy that's since been removed: undo the step before instead.
  if (!group) return undoMove();
  group.position.fromArray(step.position);
  group.quaternion.fromArray(step.quaternion);
  commitInstance(group);
  selectInstance(step.id);
}

async function insertPart(part) {
  const source = await partScene(part);
  if (!source || !assembly.on) return;
  const model = source.clone();
  model.scale.setScalar(1000);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const existing = instanceGroups().length ? new THREE.Box3().setFromObject(assembly.root) : null;
  // Placed on the floor, beside what's already there.
  const x = existing ? existing.max.x + 10 - box.min.x : -(box.min.x + box.max.x) / 2;
  const inst = { id: uid(), partId: part.id, position: [x, -box.min.y, -(box.min.z + box.max.z) / 2], quaternion: [0, 0, 0, 1] };
  project.assembly.instances.push(inst);
  assembly.selected = inst.id;
  scheduleSave();
  await rebuildAssembly(true);
}

async function duplicateSelected() {
  const group = selectedGroup();
  if (!group) return;
  const inst = group.userData.instance;
  const width = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).x;
  const copy = { id: uid(), partId: inst.partId, position: [inst.position[0] + width + 10, inst.position[1], inst.position[2]], quaternion: [...inst.quaternion] };
  project.assembly.instances.push(copy);
  assembly.selected = copy.id;
  scheduleSave();
  await rebuildAssembly(false);
}

function removeInstance(id) {
  project.assembly.instances = project.assembly.instances.filter((i) => i.id !== id);
  project.assembly.joints = project.assembly.joints.filter((j) => j.parent !== id && j.child !== id);
  if (assembly.selected === id) assembly.selected = null;
  scheduleSave();
  rebuildAssembly(false);
}

function turnSelected(axis) {
  const group = selectedGroup();
  if (!group) return;
  pushUndo(group);
  group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(PART_AXES[axis], Math.PI / 2));
  commitInstance(group);
}

function dropSelectedToFloor() {
  const group = selectedGroup();
  if (!group) return;
  pushUndo(group);
  group.position.y -= new THREE.Box3().setFromObject(group).min.y;
  commitInstance(group);
}

transform.addEventListener("dragging-changed", (e) => {
  controls.enabled = !e.value;
  const group = selectedGroup();
  if (!group) return;
  if (e.value) {
    pushUndo(group);
    // The edge lines and caps are redrawn once the move ends.
    if (edgeGroup) edgeGroup.visible = false;
    if (capGroup) capGroup.visible = false;
  } else {
    commitInstance(group);
  }
});
transform.addEventListener("objectChange", updateSelectionFields);

asmFields.forEach((field) =>
  field.addEventListener("change", () => {
    const group = selectedGroup();
    const value = Number(field.value);
    if (!group || field.value.trim() === "" || !Number.isFinite(value)) return updateSelectionFields();
    pushUndo(group);
    if (field.dataset.axis === "x") group.position.x = value;
    else if (field.dataset.axis === "y") group.position.z = -value;
    else group.position.y = value;
    commitInstance(group);
  })
);

asmModeButtons.forEach((btn) => btn.addEventListener("click", () => setTransformMode(btn.dataset.mode)));
asmSelection.querySelectorAll("[data-turn]").forEach((btn) => btn.addEventListener("click", () => turnSelected(btn.dataset.turn)));
asmSelection.querySelector('[data-action="floor"]').addEventListener("click", dropSelectedToFloor);
asmSelection.querySelector('[data-action="duplicate"]').addEventListener("click", duplicateSelected);
asmSelection.querySelector('[data-action="remove"]').addEventListener("click", () => assembly.selected && removeInstance(assembly.selected));
undoMoveBtn.addEventListener("click", undoMove);

/* ---------------- snapping faces ---------------- */

function setMating(on) {
  if (on && instanceGroups().length < 2) {
    showToast("Insert at least two parts to snap them together.");
    return;
  }
  assembly.mating = on && assembly.on;
  assembly.mateFirst = null;
  clearMateHighlight();
  mateBtn.classList.toggle("active", assembly.mating);
  mateBtn.textContent = assembly.mating ? "Cancel snapping" : "Snap faces together";
  if (assembly.mating) setMeasuring(false);
  selectInstance(assembly.selected);
  renderer.domElement.style.cursor = assembly.mating ? "crosshair" : "";
  if (!busy && partInfoText) showViewerStatus(idleStatusText());
}

mateBtn.addEventListener("click", () => setMating(!assembly.mating));

function clearMateHighlight() {
  mateGroup.children.forEach((child) => child.geometry.dispose());
  mateGroup.clear();
}

// The first visible point of the model under the pointer.
function modelHitAt(event) {
  const pointer = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  return (
    raycaster
      .intersectObject(currentModel, true)
      .find((h) => shownInModel(h.object) && (!section.on || sectionPlane.distanceToPoint(h.point) >= 0)) || null
  );
}

// The flat face around a clicked triangle: every coplanar triangle connected
// to it. Snapping lines up its area-weighted centre, so the ring around a hole
// and the end of a pin both snap by their centres.
function planarFace(hit) {
  const mesh = hit.object;
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.index;
  const triangleCount = (index ? index.count : position.count) / 3;
  const corner = (t, k) =>
    new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(3 * t + k) : 3 * t + k).applyMatrix4(mesh.matrixWorld);
  const triangle = new THREE.Triangle();
  const scratch = new THREE.Vector3();
  const normal = new THREE.Triangle(corner(hit.faceIndex, 0), corner(hit.faceIndex, 1), corner(hit.faceIndex, 2)).getNormal(
    new THREE.Vector3()
  );
  const planeOffset = normal.dot(corner(hit.faceIndex, 0));
  // Corners closer than 0.01 mm count as the same point: the mesh isn't welded.
  const key = (v) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;

  const coplanar = new Map();
  const byCorner = new Map();
  for (let t = 0; t < triangleCount; t++) {
    const corners = [corner(t, 0), corner(t, 1), corner(t, 2)];
    triangle.set(...corners);
    if (triangle.getArea() < 1e-9) continue;
    if (triangle.getNormal(scratch).dot(normal) < 0.9995) continue;
    if (Math.abs(normal.dot(corners[0]) - planeOffset) > 0.02) continue;
    coplanar.set(t, corners);
    for (const c of corners) {
      const k = key(c);
      if (!byCorner.has(k)) byCorner.set(k, []);
      byCorner.get(k).push(t);
    }
  }

  const face = new Set([hit.faceIndex]);
  const queue = [hit.faceIndex];
  while (queue.length) {
    for (const c of coplanar.get(queue.pop()) || []) {
      for (const other of byCorner.get(key(c))) {
        if (!face.has(other)) {
          face.add(other);
          queue.push(other);
        }
      }
    }
  }

  const center = new THREE.Vector3();
  const points = [];
  let area = 0;
  for (const t of face) {
    const corners = coplanar.get(t);
    if (!corners) continue;
    triangle.set(...corners);
    const a = triangle.getArea();
    center.addScaledVector(triangle.getMidpoint(scratch), a);
    area += a;
    points.push(...corners);
  }
  if (area > 0) center.divideScalar(area);
  else center.copy(hit.point);
  return { normal, center, points };
}

// Turns the moving copy so its face points straight at the target face, then
// slides it until the two faces' centres meet.
function snapFaces(moving, target) {
  const group = moving.group;
  pushUndo(group);
  const turn = new THREE.Quaternion().setFromUnitVectors(moving.normal, target.normal.clone().negate());
  const offset = moving.center.clone().sub(group.position).applyQuaternion(turn);
  group.quaternion.premultiply(turn);
  group.position.copy(target.center).sub(offset);
  commitInstance(group);
}

function handleMateClick(event) {
  const hit = modelHitAt(event);
  const group = hit && instanceGroupOf(hit.object);
  if (!group) return;
  const face = { group, ...planarFace(hit) };
  if (!assembly.mateFirst) {
    assembly.mateFirst = face;
    clearMateHighlight();
    mateGroup.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(face.points), mateMaterial));
    showViewerStatus(idleStatusText());
    return;
  }
  if (group === assembly.mateFirst.group) {
    showToast("Pick a face on a different part.");
    return;
  }
  const moving = assembly.mateFirst;
  snapFaces(moving, face);
  setMating(false);
  selectInstance(moving.group.userData.instance.id);
  showToast("Snapped. Ctrl+Z undoes it.");
}

// A click (not the end of an orbit drag) selects a copy, or picks a face to snap.
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!assembly.on || ruler.on || !pointerDownAt || e.button !== 0) return;
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 5) return;
  if (transform.dragging || transform.axis) return;
  if (assembly.jointing) {
    handleJointClick(e);
    return;
  }
  if (assembly.mating) {
    handleMateClick(e);
    return;
  }
  const group = modelHitAt(e) && instanceGroupOf(modelHitAt(e).object);
  selectInstance(group ? group.userData.instance.id : null);
});

/* ---------------- assembly joints ---------------- */

// The axis and centre of the round surface (a hole or a pin/shaft) around a
// clicked triangle, in world coordinates — the same smooth-region-growing and
// axis-fitting approach as the click-to-edit feature picker, but working
// directly in world space (assembly instances already sit there) instead of
// a single part's own coordinates. Returns null off a flat or free-form surface.
function pickRoundAxis(hit) {
  const mesh = hit.object;
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.index;
  const count = (index ? index.count : position.count) / 3;
  const corner = (t, k) =>
    new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(3 * t + k) : 3 * t + k).applyMatrix4(mesh.matrixWorld);
  const triangle = new THREE.Triangle();
  const corners = [];
  const normals = [];
  const areas = [];
  for (let t = 0; t < count; t++) {
    const c = [corner(t, 0), corner(t, 1), corner(t, 2)];
    triangle.set(...c);
    corners.push(c);
    areas.push(triangle.getArea());
    normals.push(triangle.getNormal(new THREE.Vector3()));
  }
  // Corners closer than 0.01 mm count as the same point: the mesh isn't welded.
  const key = (v) => `${Math.round(v.x * 100)},${Math.round(v.y * 100)},${Math.round(v.z * 100)}`;
  const byCorner = new Map();
  corners.forEach((c, t) =>
    c.forEach((v) => {
      const k = key(v);
      if (!byCorner.has(k)) byCorner.set(k, []);
      byCorner.get(k).push(t);
    })
  );

  const smooth = Math.cos(THREE.MathUtils.degToRad(25));
  const region = new Set([hit.faceIndex]);
  const queue = [hit.faceIndex];
  while (queue.length && region.size < 20000) {
    const t = queue.pop();
    for (const v of corners[t]) {
      for (const u of byCorner.get(key(v))) {
        if (!region.has(u) && areas[u] > 0 && normals[u].dot(normals[t]) > smooth) {
          region.add(u);
          queue.push(u);
        }
      }
    }
  }
  const list = [...region];
  const regionNormals = list.map((t) => normals[t]);
  if (regionNormals.length < 8) return null;

  // Every cross product of two normals on a cylinder lies along its axis;
  // summing them (turned to agree) gives the axis direction.
  const step = Math.max(1, Math.ceil(regionNormals.length / 200));
  const sample = regionNormals.filter((_, i) => i % step === 0);
  const axis = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      cross.crossVectors(sample[i], sample[j]);
      axis.addScaledVector(cross, cross.dot(axis) < 0 ? -1 : 1);
    }
  }
  if (axis.length() < 1e-6) return null;
  axis.normalize();
  if (!regionNormals.every((n) => Math.abs(n.dot(axis)) < 0.2)) return null;

  // Fit the axis's radius and position: each face centre sits `radius` out
  // along its (axis-flattened) normal from the axis line.
  const flatten = (v) => v.clone().addScaledVector(axis, -v.dot(axis));
  const points = list.map((t) => corners[t][0].clone().add(corners[t][1]).add(corners[t][2]).divideScalar(3));
  const p = points.map(flatten);
  const n = regionNormals.map((v) => flatten(v).normalize());
  const mean = (arr) => arr.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(arr.length);
  const meanP = mean(p);
  const meanN = mean(n);
  let top = 0;
  let bottom = 0;
  p.forEach((v, i) => {
    const dn = n[i].clone().sub(meanN);
    top += v.clone().sub(meanP).dot(dn);
    bottom += dn.lengthSq();
  });
  const radius = bottom > 1e-9 ? top / bottom : 0;
  if (Math.abs(radius) < 0.1) return null; // too flat to trust as a cylinder
  const along = list.flatMap((t) => corners[t].map((c) => c.dot(axis)));
  const middle = (Math.max(...along) + Math.min(...along)) / 2;
  const centre = meanP.clone().addScaledVector(meanN, -radius).addScaledVector(axis, middle);
  return { axis, centre, radius: Math.abs(radius) };
}

// A translucent marker at a picked pivot axis, reusing the snap-face colour.
function axisHighlight(round) {
  const height = Math.max(round.radius * 0.6, 1);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(round.radius, round.radius, height, 40, 1, true), mateMaterial);
  mesh.position.copy(round.centre);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), round.axis);
  return mesh;
}

function setJointing(kind) {
  if (assembly.jointing && assembly.jointing.kind === kind) {
    cancelJointing();
    return;
  }
  if (instanceGroups().length < 2) {
    showToast("Insert at least two parts to add a joint.");
    return;
  }
  setMating(false);
  setMeasuring(false);
  selectInstance(null);
  assembly.jointing = { kind, first: null };
  addPivotBtn.classList.toggle("active", kind === "pivot");
  addSlideBtn.classList.toggle("active", kind === "slide");
  jointAxisPicker.hidden = true;
  jointHint.hidden = false;
  jointHint.textContent =
    kind === "pivot" ? "Click a round hole or pin on the first part." : "Click the first part.";
  if (!busy && partInfoText) showViewerStatus(idleStatusText());
}

function cancelJointing() {
  if (!assembly.jointing) return;
  assembly.jointing = null;
  addPivotBtn.classList.remove("active");
  addSlideBtn.classList.remove("active");
  jointAxisPicker.hidden = true;
  jointHint.hidden = true;
  clearMateHighlight();
  if (!busy && partInfoText) showViewerStatus(idleStatusText());
}

addPivotBtn.addEventListener("click", () => setJointing("pivot"));
addSlideBtn.addEventListener("click", () => setJointing("slide"));

// Whether making `parentId` the parent of `childId` would close a loop of joints.
function wouldCycle(parentId, childId) {
  const byChild = new Map(project.assembly.joints.map((j) => [j.child, j]));
  let id = parentId;
  const seen = new Set();
  while (byChild.has(id) && !seen.has(id)) {
    seen.add(id);
    id = byChild.get(id).parent;
    if (id === childId) return true;
  }
  return false;
}

const existingParentJoint = (childId) => project.assembly.joints.find((j) => j.child === childId);

function localPoint(group, worldPoint) {
  return worldPoint.clone().applyMatrix4(group.matrixWorld.clone().invert());
}

function localDirection(group, worldDirection) {
  const rotation = new THREE.Quaternion();
  group.getWorldQuaternion(rotation);
  return worldDirection.clone().applyQuaternion(rotation.invert()).normalize();
}

// A new joint's shared fields: which instance becomes the parent and child,
// and the child's current pose expressed relative to the parent (its "rest"
// offset, restored whenever the joint's slider is back at zero).
function baseJoint(parentGroup, childGroup, kind) {
  const parentId = parentGroup.userData.instance.id;
  const childId = childGroup.userData.instance.id;
  if (parentId === childId) return null;
  if (existingParentJoint(childId)) {
    showToast("That part already has a joint. Remove it first.");
    return null;
  }
  if (wouldCycle(parentId, childId)) {
    showToast("That would make a loop of joints.");
    return null;
  }
  parentGroup.updateMatrixWorld(true);
  childGroup.updateMatrixWorld(true);
  const restLocal = parentGroup.matrixWorld.clone().invert().multiply(childGroup.matrixWorld);
  const restPosition = new THREE.Vector3();
  const restQuaternion = new THREE.Quaternion();
  const scratch = new THREE.Vector3();
  restLocal.decompose(restPosition, restQuaternion, scratch);
  return {
    id: uid(),
    parent: parentId,
    child: childId,
    kind,
    restPosition: restPosition.toArray(),
    restQuaternion: restQuaternion.toArray(),
    range: kind === "pivot" ? [-180, 180] : [-50, 50],
    value: 0,
  };
}

function createPivotJoint(parentGroup, parentRound, childGroup, childRound) {
  const joint = baseJoint(parentGroup, childGroup, "pivot");
  if (!joint) return;
  const centreWorld = parentRound.centre.clone().add(childRound.centre).multiplyScalar(0.5);
  joint.point = localPoint(parentGroup, centreWorld).toArray();
  joint.axis = localDirection(parentGroup, parentRound.axis).toArray();
  project.assembly.joints.push(joint);
  finishJointCreation();
}

function createSlideJoint(parentGroup, childGroup, worldAxis) {
  const joint = baseJoint(parentGroup, childGroup, "slide");
  if (!joint) return;
  joint.point = [0, 0, 0];
  joint.axis = localDirection(parentGroup, worldAxis).toArray();
  project.assembly.joints.push(joint);
  finishJointCreation();
}

function finishJointCreation() {
  scheduleSave();
  applyJoints();
  checkCollisions();
  renderAssemblyPanel();
  showToast("Joint added. Drag its slider to move it.");
}

function removeJoint(id) {
  // Keep the joint's last computed position as the child's new resting pose.
  const joint = project.assembly.joints.find((j) => j.id === id);
  const group = joint && instanceGroups().find((g) => g.userData.instance.id === joint.child);
  if (group) {
    group.userData.instance.position = group.position.toArray();
    group.userData.instance.quaternion = group.quaternion.toArray();
  }
  project.assembly.joints = project.assembly.joints.filter((j) => j.id !== id);
  scheduleSave();
  renderAssemblyPanel();
}

// If the user manually drags a part that has a joint to a parent, treat where
// they dropped it as the joint's new zero position instead of snapping back
// to wherever the joint's current value says it should be.
function rebakeJointIfChild(childGroup) {
  const joint = existingParentJoint(childGroup.userData.instance.id);
  if (!joint) return;
  const parentGroup = instanceGroups().find((g) => g.userData.instance.id === joint.parent);
  if (!parentGroup) return;
  parentGroup.updateMatrixWorld(true);
  childGroup.updateMatrixWorld(true);
  const restLocal = parentGroup.matrixWorld.clone().invert().multiply(childGroup.matrixWorld);
  const restPosition = new THREE.Vector3();
  const restQuaternion = new THREE.Quaternion();
  const scratch = new THREE.Vector3();
  restLocal.decompose(restPosition, restQuaternion, scratch);
  joint.restPosition = restPosition.toArray();
  joint.restQuaternion = restQuaternion.toArray();
  joint.value = 0;
}

// Recomputes every jointed instance's position from its parent's current
// transform, the joint's rest offset, and its slider value — forward
// kinematics down the tree of joints (parents always computed before children).
function applyJoints() {
  const joints = project.assembly.joints;
  if (!joints.length) return;
  const groupsById = new Map(instanceGroups().map((g) => [g.userData.instance.id, g]));
  const byChild = new Map(joints.map((j) => [j.child, j]));
  const ordered = [];
  const done = new Set();
  let guard = joints.length + 1;
  while (ordered.length < joints.length && guard-- > 0) {
    for (const j of joints) {
      if (done.has(j.id)) continue;
      const parentJoint = byChild.get(j.parent);
      if (!parentJoint || done.has(parentJoint.id)) {
        ordered.push(j);
        done.add(j.id);
      }
    }
  }

  const world = new THREE.Matrix4();
  const rest = new THREE.Matrix4();
  const delta = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (const j of ordered) {
    const parentGroup = groupsById.get(j.parent);
    const childGroup = groupsById.get(j.child);
    if (!parentGroup || !childGroup) continue;
    parentGroup.updateMatrixWorld(true);
    rest.compose(new THREE.Vector3().fromArray(j.restPosition), new THREE.Quaternion().fromArray(j.restQuaternion), one);
    const axis = new THREE.Vector3().fromArray(j.axis).normalize();
    if (j.kind === "pivot") {
      const point = new THREE.Vector3().fromArray(j.point);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(j.value));
      delta.compose(point.clone().sub(point.clone().applyQuaternion(q)), q, one);
    } else {
      delta.identity().setPosition(axis.multiplyScalar(j.value));
    }
    world.copy(parentGroup.matrixWorld).multiply(delta).multiply(rest);
    world.decompose(pos, quat, scl);
    childGroup.position.copy(pos);
    childGroup.quaternion.copy(quat);
    childGroup.updateMatrixWorld(true);
  }
}

function handleJointClick(event) {
  const hit = modelHitAt(event);
  const group = hit && instanceGroupOf(hit.object);
  if (!group) return;
  const jointing = assembly.jointing;

  if (jointing.kind === "pivot") {
    const round = pickRoundAxis(hit);
    if (!round) {
      showToast("Click a round hole or pin surface for the pivot axis.");
      return;
    }
    if (!jointing.first) {
      jointing.first = { group, round };
      clearMateHighlight();
      mateGroup.add(axisHighlight(round));
      jointHint.textContent = "Now click the matching hole or pin on the second part.";
      return;
    }
    if (group === jointing.first.group) {
      showToast("Pick a feature on a different part.");
      return;
    }
    createPivotJoint(jointing.first.group, jointing.first.round, group, round);
    cancelJointing();
    return;
  }

  // Slide joint: pick the two parts, then an axis via the on-screen buttons.
  if (!jointing.first) {
    jointing.first = { group };
    jointHint.textContent = "Now click the second part.";
    return;
  }
  if (group === jointing.first.group) {
    showToast("Pick a different part.");
    return;
  }
  jointing.second = group;
  jointHint.textContent = "Pick the slide direction.";
  jointAxisPicker.hidden = false;
}

jointAxisPicker.querySelectorAll("[data-joint-axis]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const jointing = assembly.jointing;
    if (!jointing || jointing.kind !== "slide" || !jointing.second) return;
    // The same X/Y/Z convention as the position fields and Turn 90°, so the
    // assembly panel's axes always mean the same thing.
    createSlideJoint(jointing.first.group, jointing.second, PART_AXES[btn.dataset.jointAxis].clone());
    cancelJointing();
  })
);

/* ---------------- exploded view ---------------- */

// Offsets each instance outward from the assembly's centre — applied to the
// instance's inner model, not the instance group itself, so it's purely
// visual and never touches the position joints, dragging and export rely on.
function applyExplode() {
  const groups = instanceGroups();
  if (!groups.length) return;
  const amount = assembly.explode;
  if (amount <= 0) {
    for (const g of groups) g.userData.model.position.set(0, 0, 0);
    return;
  }
  const centre = new THREE.Vector3();
  const centres = groups.map((g) => {
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    centre.add(c);
    return c;
  });
  centre.divideScalar(groups.length);
  const rotation = new THREE.Quaternion();
  groups.forEach((g, i) => {
    const direction = centres[i].clone().sub(centre);
    if (direction.lengthSq() < 1) direction.set(0, 1, 0); // concentric parts: pull straight up
    direction.normalize().multiplyScalar(amount);
    g.getWorldQuaternion(rotation);
    g.userData.model.position.copy(direction.applyQuaternion(rotation.invert()));
  });
}

explodeSlider.addEventListener("input", () => {
  assembly.explode = Number(explodeSlider.value);
  explodeValue.textContent = `${assembly.explode} mm`;
  applyExplode();
});
explodeSlider.addEventListener("change", () => checkCollisions());

// Runs fn with any exploded view temporarily collapsed, e.g. for an export
// that must reflect the assembly as designed rather than pulled apart. fn may
// return a promise (an async export); the explode view is restored only once
// it settles, not before it's actually finished reading the geometry.
function withExplodedOff(fn) {
  const amount = assembly.explode;
  if (amount > 0) {
    assembly.explode = 0;
    applyExplode();
  }
  const restore = () => {
    if (amount > 0) {
      assembly.explode = amount;
      applyExplode();
    }
  };
  let result;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

/* ---------------- collision check ---------------- */

// A ray/triangle hit test (Möller–Trumbore), the same approach print.js uses
// for wall thickness, adapted to take explicit points instead of typed arrays.
function rayHitsTriangle(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return false;
  const inv = 1 / det;
  const sx = ox - ax, sy = oy - ay, sz = oz - az;
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4;
}

// World-space triangle corners of a group's meshes, flattened to 9 numbers each.
function groupTriangles(group) {
  const out = [];
  group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  group.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.getAttribute("position");
    const index = child.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(child.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return Float32Array.from(out);
}

// An arbitrary fixed direction, not axis-aligned, so a test ray never grazes
// along a flat face of an axis-aligned part.
const COLLISION_RAY = [0.5773, 0.5774, 0.5773];
// Vertices sampled per part when testing whether it pokes into another; keeps
// the check quick even for a detailed mesh.
const COLLISION_SAMPLE_CAP = 300;

function pointInsideTriangles(px, py, pz, tris) {
  let crossings = 0;
  for (let i = 0; i < tris.length; i += 9) {
    if (
      rayHitsTriangle(
        px, py, pz, COLLISION_RAY[0], COLLISION_RAY[1], COLLISION_RAY[2],
        tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5], tris[i + 6], tris[i + 7], tris[i + 8]
      )
    ) {
      crossings++;
    }
  }
  return crossings % 2 === 1;
}

// Whether a sample of one mesh's vertices lie inside another (a vertex ray
// crosses the other mesh's surface an odd number of times). Catches the
// common cases — a boss or pin pushed too far into its mate — though two
// paper-thin shells crossing with no vertex inside either can slip past.
function anyVertexInside(tris, otherTris) {
  const step = Math.max(1, Math.floor(tris.length / 3 / COLLISION_SAMPLE_CAP));
  for (let i = 0; i < tris.length; i += 3 * step) {
    if (pointInsideTriangles(tris[i], tris[i + 1], tris[i + 2], otherTris)) return true;
  }
  return false;
}

// Tints any instance that overlaps another red, and shows the warning line.
function checkCollisions() {
  const groups = instanceGroups();
  const colliding = new Set();
  if (groups.length > 1) {
    const boxes = groups.map((g) => new THREE.Box3().setFromObject(g));
    const trisCache = new Map();
    const trisOf = (g) => {
      if (!trisCache.has(g)) trisCache.set(g, groupTriangles(g));
      return trisCache.get(g);
    };
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const overlap = boxes[i].clone().intersect(boxes[j]);
        if (overlap.isEmpty()) continue;
        const size = overlap.getSize(new THREE.Vector3());
        if (size.x < 0.1 || size.y < 0.1 || size.z < 0.1) continue; // touching, not overlapping
        const trisA = trisOf(groups[i]);
        const trisB = trisOf(groups[j]);
        if (anyVertexInside(trisA, trisB) || anyVertexInside(trisB, trisA)) {
          colliding.add(groups[i].userData.instance.id);
          colliding.add(groups[j].userData.instance.id);
        }
      }
    }
  }
  assembly.colliding = colliding;
  for (const g of groups) {
    const bad = colliding.has(g.userData.instance.id);
    g.traverse((o) => {
      if (o.isMesh) o.material = bad ? collisionMaterial : o.userData.baseMaterial;
    });
  }
  collisionWarning.hidden = colliding.size === 0;
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
  if (!codeView.value) return;
  await navigator.clipboard.writeText(codeView.value);
  copyCodeBtn.textContent = "Copied";
  setTimeout(() => (copyCodeBtn.textContent = "Copy"), 1400);
});

/* ---------------- editing the code by hand ---------------- */

// The panel is a textarea, so code can be edited or pasted in from elsewhere
// and built directly. `codeBaseline` is whatever the panel was last filled
// with by the app; anything different from it is an unbuilt edit. Every write
// to the panel goes through setCodeView so the two never drift apart — a
// textarea that the user has typed into ignores later .textContent writes, and
// the panel would have gone stale without this.
let codeBaseline = "";

function setCodeView(code) {
  codeBaseline = code;
  codeView.value = code;
  codeError.hidden = true;
  refreshCodeControls();
}

function codeIsEdited() {
  return codeView.value !== codeBaseline;
}

function refreshCodeControls() {
  const edited = codeIsEdited();
  const runnable = edited && codeView.value.trim() !== "" && !busy;
  runCodeBtn.disabled = !runnable;
  revertCodeBtn.hidden = !edited || codeBaseline === "";
  codeHint.classList.toggle("is-dirty", edited);
  codeHint.textContent = edited ? "Edited — not built yet." : "Editable — Ctrl+Enter builds.";
}

codeView.addEventListener("input", () => {
  codeError.hidden = true;
  refreshCodeControls();
});

codeView.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (!runCodeBtn.disabled) buildEditedCode();
  }
});

revertCodeBtn.addEventListener("click", () => {
  setCodeView(codeBaseline);
  codeView.focus();
});

runCodeBtn.addEventListener("click", () => buildEditedCode());

// Builds whatever is in the panel. The server treats this exactly like
// model-written code: same AST validation, same resource limits. Hand-edited
// code is no more trusted than generated code, and needs to be no less.
// Shared by the code panel and the Build from code dialog. It runs the code,
// commits it as a version and reports in the chat; the error comes back to the
// caller as well, so whichever surface the user is looking at can repeat it
// where they are about to fix it.
async function buildCodeAsVersion(code, label) {
  if (emptyState) emptyState.remove();
  const pending = addThinkingEntry(`Building your ${label}…`);
  recordLog({ kind: "user", text: `Build ${label}` });
  setBusy(true, "Building part…");

  // No spec is sent. Supplied code can be a different part entirely, so
  // checking it against the intent the model declared for the *previous*
  // version would report failures the user didn't cause. The geometry is still
  // measured; only the comparison is skipped.
  const { data } = await callApi("/api/run", { code }, pending);
  let error = "";
  if (data && data.ok) {
    // Follow-up prompts have to build on what was actually built, not on the
    // superseded version, so this replaces the last thing the model said. With
    // nothing to replace — code brought into an empty project — it becomes the
    // starting point instead.
    if (conversation.length && conversation[conversation.length - 1].role === "assistant") {
      conversation[conversation.length - 1] = { role: "assistant", content: fence(data.code) };
    } else {
      conversation.push({ role: "user", content: "Start from this part." }, { role: "assistant", content: fence(data.code) });
    }
    commitVersion(pending, `Built your ${label}`, data, !versions.length);
  } else if (data) {
    error = data.error;
    const { headline, detail } = splitError(error);
    setEntryError(pending, `That code didn't build. ${headline}`);
    addErrorDetail(pending, detail);
    recordLog({ kind: "error", text: headline });
  }
  setBusy(false);
  return { ok: Boolean(data && data.ok), error };
}

async function buildEditedCode() {
  const code = codeView.value;
  if (busy || !code.trim() || !codeIsEdited()) return;

  codeError.hidden = true;
  const { error } = await buildCodeAsVersion(code, "edited code");
  if (error) {
    // The error belongs next to the code as well as in the chat: the drawer is
    // where it gets fixed, and it covers the chat while it's open.
    codeError.textContent = error;
    codeError.hidden = false;
    setCodeDrawer(true);
  }
}

/* ---------------- build from code ---------------- */

// The whole point of this dialog. An AI asked for "CAD code" writes something
// plausible that this app then rejects, because it can't know the four things
// that actually matter here: the library, the `result` variable, millimetres,
// and the one-dimension-per-line shape the parameter fields are read from.
// Saying so up front is the difference between code that builds first time and
// a round of copy-paste debugging.
const CODE_START_RULES = [
  "Rules the code must follow:",
  "- Use build123d only. Not OpenSCAD, not CadQuery, not a mesh library.",
  "- Assign the finished solid to a variable called `result`, e.g. `result = bp.part`.",
  "  It must be a Part, Solid or Compound — not a builder object and not a sketch.",
  "- Every dimension is in millimetres.",
  "- Put each dimension on its own line at the top of the file, written exactly as",
  "  `name = number  # mm, what it is`, and use those names everywhere below instead",
  "  of repeating numbers. They become editable fields in the app.",
  "- Import nothing except `build123d` and `math`. No files, no network, no processes.",
  "- The result must be a single valid, watertight solid with real volume: no",
  "  self-intersections, no zero-thickness walls, no leftover construction solids.",
  "- Reply with the code only, in one ```python block, with no explanation.",
].join("\n");

function codeStartPromptFor(what) {
  const described = what.trim() || "[describe your part here]";
  return `Write build123d (Python) code for this part:\n\n${described}\n\n${CODE_START_RULES}`;
}

function refreshCodeStartPrompt() {
  codeStartPrompt.textContent = codeStartPromptFor(codeStartWhat.value);
}

// People paste the whole reply, chat and all. The code is whatever is in the
// fence; without one, assume the paste is already just code.
function stripCodeFence(text) {
  const fenced = text.match(/```(?:[A-Za-z]*)\s*\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function refreshCodeStartBuild() {
  codeStartBuildBtn.disabled = busy || stripCodeFence(codeStartCode.value) === "";
}

function openCodeStartModal() {
  if (busy) {
    showToast("Wait for the current build to finish.");
    return;
  }
  codeStartModal.hidden = false;
  codeStartError.hidden = true;
  refreshCodeStartPrompt();
  refreshCodeStartBuild();
  codeStartWhat.focus();
}

function closeCodeStartModal() {
  codeStartModal.hidden = true;
}

codeStartCtaBtn?.addEventListener("click", openCodeStartModal);
codeStartCloseBtn.addEventListener("click", closeCodeStartModal);
codeStartModal.addEventListener("click", (e) => {
  if (e.target === codeStartModal) closeCodeStartModal();
});

codeStartWhat.addEventListener("input", refreshCodeStartPrompt);
codeStartCode.addEventListener("input", () => {
  codeStartError.hidden = true;
  refreshCodeStartBuild();
});

codeStartCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(codeStartPromptFor(codeStartWhat.value));
    codeStartCopyBtn.textContent = "Copied";
    setTimeout(() => (codeStartCopyBtn.textContent = "Copy the prompt"), 1600);
  } catch {
    showToast("Couldn't reach the clipboard — select the prompt and copy it.");
  }
});

codeStartBuildBtn.addEventListener("click", async () => {
  const code = stripCodeFence(codeStartCode.value);
  if (busy || !code) return;
  // The dialog closes on success so the part it built is the first thing seen,
  // and stays open on failure with the paste still in it, ready to be replaced.
  const { ok, error } = await buildCodeAsVersion(code, "pasted code");
  if (ok) {
    closeCodeStartModal();
    codeStartWhat.value = "";
    codeStartCode.value = "";
    refreshCodeStartPrompt();
    refreshCodeStartBuild();
  } else if (error) {
    codeStartError.textContent = splitError(error).headline;
    codeStartError.hidden = false;
  }
});

const VIEW_KEYS = { 1: "iso", 2: "top", 3: "front", 4: "right" };

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Closes the most recently opened thing first.
    if (!arModal.hidden) closeArModal();
    else if (!moreMenu.hidden) setMoreMenu(false);
    else if (!codeStartModal.hidden) closeCodeStartModal();
    else if (!planModal.hidden) closePlanModal();
    else if (!drawingModal.hidden) drawingModal.hidden = true;
    else if (!editPopup.hidden) closeEditPopup();
    else if (!exportMenu.hidden) setExportMenu(false);
    else if (!projectMenu.hidden) setProjectMenu(false);
    else if (!accountMenu.hidden) setAccountMenu(false);
    else if (codeDrawer.classList.contains("is-open")) setCodeDrawer(false);
    else if (assembly.mating) setMating(false);
    else if (assembly.jointing) cancelJointing();
    else if (picker.on) setPicking(false);
    else if (printState.on) setPrintMode(false);
    else if (compareState.on) setCompareMode(false);
    else if (ruler.on) setMeasuring(false);
    else if (section.on) setSection(false);
    else if (assembly.selected) selectInstance(null);
    return;
  }
  // Guarded: a keydown can arrive with a target that isn't an element (the
  // document itself), and an unguarded .matches() there throws, taking every
  // shortcut down with it.
  const typing = e.target instanceof Element && e.target.matches("textarea, input:not([type=range])");
  if (typing || !lockScreen.hidden) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    // In the Assembly tab this steps back through moves; on a part it steps
    // back through the versions this session has visited.
    if (assembly.on) undoMove();
    else if (e.shiftKey) redoEdit();
    else undoEdit();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || !currentModel) return;
  if (VIEW_KEYS[key]) setView(VIEW_KEYS[key]);
  else if (key === "w") toggleWireframe();
  else if (key === "s") setSection(!section.on);
  else if (key === "m") setMeasuring(!ruler.on);
  else if (key === "e" && !assembly.on) setPicking(!picker.on);
  else if (key === "p" && !assembly.on) setPrintMode(!printState.on);
  else if (key === "c" && !assembly.on) setCompareMode(!compareState.on);
  else if (assembly.on && key === "g") setTransformMode("translate");
  else if (assembly.on && key === "r") setTransformMode("rotate");
  else if (assembly.on && assembly.selected && (key === "delete" || key === "backspace")) removeInstance(assembly.selected);
  else return;
  e.preventDefault();
});

input.focus();
initAccess();
initCloudSync();
initProjects().then(() => {
  offerSharedPart();
  // A share link pasted into a tab that's already open only changes the hash.
  window.addEventListener("hashchange", offerSharedPart);
});
