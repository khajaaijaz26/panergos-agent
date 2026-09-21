import {
  DEFAULT_API_BASE,
  extensionPairingCommand,
  normalizeApiBase,
  pageOriginPattern,
} from './protocol.js';

const $ = (id) => document.getElementById(id);

const elements = {
  apiBase: $("api-base"),
  approvalActions: $("approval-actions"),
  approvalCard: $("approval-card"),
  approvalCommand: $("approval-command"),
  approvalDescription: $("approval-description"),
  connect: $("connect-button"),
  connection: $("connection-status"),
  copyPairingCommand: $("copy-pairing-command"),
  copyResult: $("copy-result"),
  dashboard: $("dashboard-button"),
  disconnect: $("disconnect-button"),
  error: $("error-banner"),
  extensionOrigin: $("extension-origin"),
  goal: $("goal"),
  output: $("run-output"),
  pairingCommand: $("pairing-command"),
  pairingCode: $("pairing-code"),
  resultPanel: $("result-panel"),
  run: $("run-button"),
  runPanel: $("run-panel"),
  runTitle: $("run-title"),
  scope: $("scope-button"),
  scopeTitle: $("scope-title"),
  scopeUrl: $("scope-url"),
  settingsPanel: $("settings-panel"),
  settingsToggle: $("settings-toggle"),
  stop: $("stop-button"),
  timeline: $("timeline"),
};

const ACTIVE_RUN_STATES = new Set(["queued", "running", "waiting_for_approval", "stopping"]);
const TERMINAL_RUN_STATES = new Set(["completed", "failed", "cancelled", "interrupted"]);
const SAFE_APPROVAL_CHOICES = new Set(["deny", "once"]);
const APPROVAL_LABELS = { deny: "Deny", once: "Allow once" };
let state = {
  connected: false,
  extensionOrigin: location.origin,
  phase: "offline",
  timeline: [],
};

const port = chrome.runtime.connect({ name: "panergos-sidepanel" });

function post(message) {
  port.postMessage(message);
}

function setError(message = "") {
  elements.error.hidden = !message;
  elements.error.textContent = message;
}

function updatePairingCommand() {
  try {
    elements.pairingCommand.textContent = extensionPairingCommand(
      state.extensionOrigin || location.origin,
      elements.apiBase.value || DEFAULT_API_BASE,
    );
    elements.copyPairingCommand.disabled = false;
  } catch {
    elements.pairingCommand.textContent = "Enter a valid loopback API base above.";
    elements.copyPairingCommand.disabled = true;
  }
}

function statusPresentation(current) {
  if (current.error) return ["error", "Needs attention"];
  if (current.runStatus === "waiting_for_approval") return ["working", "Approval needed"];
  if (ACTIVE_RUN_STATES.has(current.runStatus)) return ["working", current.runStatus === "stopping" ? "Stopping" : "Working"];
  if (current.phase === "permission") return ["permission", "Permission needed"];
  if (current.connected) return ["ready", "Agent ready"];
  if (current.phase === "connecting" || current.phase === "pairing") return ["working", "Connecting"];
  return ["offline", "Offline"];
}

function renderConnection(current) {
  const [kind, label] = statusPresentation(current);
  elements.connection.dataset.state = kind;
  elements.connection.querySelector("span").textContent = label;
  elements.run.disabled = !current.connected || ACTIVE_RUN_STATES.has(current.runStatus);
  elements.connect.disabled = current.phase === "connecting" || current.phase === "pairing";
  elements.connect.textContent = current.phase === "pairing" ? "Pairing…" : "Pair and connect";
  elements.disconnect.hidden = !current.paired;
  elements.extensionOrigin.textContent = current.extensionOrigin || location.origin;
  if (current.apiBase) elements.apiBase.value = current.apiBase;
  updatePairingCommand();
}

function renderScope(current) {
  const tab = current.currentTab;
  if (!tab) {
    elements.scopeTitle.textContent = "No page selected";
    elements.scopeUrl.textContent = "Choose Use this page before browser actions.";
    elements.scope.textContent = "Use this page";
    return;
  }
  elements.scopeTitle.textContent = tab.title || new URL(tab.url).hostname;
  elements.scopeUrl.textContent = tab.url;
  elements.scope.textContent = "Page enabled";
}

function timelineLabel(item) {
  return item.label || item.tool || item.event || item.type || "Activity";
}

function timelineDetail(item) {
  return item.detail || item.preview || item.summary || item.error || "";
}

function renderTimeline(current) {
  elements.timeline.replaceChildren();
  for (const item of (current.timeline || []).slice(-20)) {
    const row = document.createElement("li");
    row.dataset.kind = item.kind || (item.error ? "error" : item.done ? "done" : "active");
    const dot = document.createElement("span");
    dot.className = "timeline-dot";
    dot.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = timelineLabel(item);
    copy.append(title);
    const detail = timelineDetail(item);
    if (detail) {
      const description = document.createElement("span");
      description.textContent = String(detail).slice(0, 320);
      copy.append(description);
    }
    const time = document.createElement("small");
    const timestamp = item.at || item.timestamp;
    time.textContent = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    row.append(dot, copy, time);
    elements.timeline.append(row);
  }
}

function renderApproval(current) {
  const approval = current.approval;
  elements.approvalCard.hidden = !approval;
  elements.approvalActions.replaceChildren();
  if (!approval) return;

  elements.approvalDescription.textContent = approval.description || "Panergos needs your permission before continuing.";
  const command = approval.command || "";
  elements.approvalCommand.hidden = !command;
  elements.approvalCommand.textContent = command;

  const supplied = Array.isArray(approval.choices) ? approval.choices : ["deny", "once"];
  const choices = supplied.filter((choice) => SAFE_APPROVAL_CHOICES.has(choice));
  if (!choices.includes("deny")) choices.unshift("deny");
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.choice = choice;
    button.textContent = APPROVAL_LABELS[choice] || choice;
    button.addEventListener("click", () => post({
      type: "approval.respond",
      choice,
      requestId: approval.request_id || approval.requestId,
    }));
    elements.approvalActions.append(button);
  }
}

function renderRun(current) {
  const active = ACTIVE_RUN_STATES.has(current.runStatus);
  const hasTimeline = (current.timeline || []).length > 0;
  elements.runPanel.hidden = !active && !hasTimeline;
  elements.stop.hidden = !active;
  elements.stop.disabled = current.runStatus === "stopping";
  elements.stop.textContent = current.runStatus === "stopping" ? "Stopping…" : "Stop";
  elements.runTitle.textContent = current.runStatus === "waiting_for_approval"
    ? "Waiting for you"
    : current.runStatus === "stopping"
      ? "Stopping safely"
      : TERMINAL_RUN_STATES.has(current.runStatus)
        ? current.runStatus[0].toUpperCase() + current.runStatus.slice(1)
        : "Working";
  renderTimeline(current);

  const output = current.output || "";
  elements.resultPanel.hidden = !output;
  elements.output.textContent = output;
}

function render(current) {
  state = { ...state, ...current };
  renderConnection(state);
  renderScope(state);
  renderRun(state);
  renderApproval(state);
  setError(state.error || "");
  if (!state.paired && !state.connected) {
    elements.settingsPanel.hidden = false;
    elements.settingsToggle.setAttribute("aria-expanded", "true");
  }
}

async function requestServerPermission(rawBase) {
  const apiBase = normalizeApiBase(rawBase);
  const origin = pageOriginPattern(apiBase);
  if (await chrome.permissions.contains({ origins: [origin] })) return apiBase;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error("Server access was not granted.");
  return apiBase;
}

async function useCurrentPage() {
  setError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No active web page is available.");
  const url = new URL(tab.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protected browser pages cannot be controlled.");
  const granted = await chrome.permissions.request({ origins: [pageOriginPattern(url.href)] });
  if (!granted) throw new Error(`Access to ${url.hostname} was not granted.`);
  post({ type: "scope.use", tabId: tab.id });
}

async function connect() {
  setError();
  const apiBase = normalizeApiBase(elements.apiBase.value);
  const pairingCode = elements.pairingCode.value.trim();
  if (!pairingCode && !state.paired) throw new Error("Enter a fresh pairing code.");
  await requestServerPermission(apiBase);
  post({ type: "connect", apiBase, pairingCode });
  elements.pairingCode.value = "";
}

function startRun() {
  const prompt = elements.goal.value.trim();
  if (!prompt) {
    elements.goal.focus();
    return;
  }
  setError();
  post({ type: "run.start", prompt, includePage: Boolean(state.currentTab) });
}

port.onMessage.addListener((message) => {
  if (message?.type === "state") render(message.state || {});
  if (message?.type === "error") setError(message.message || "Panergos could not complete that request.");
});

port.onDisconnect.addListener(() => {
  render({ connected: false, error: "The extension worker disconnected. Reopen the panel to reconnect." });
});

elements.settingsToggle.addEventListener("click", () => {
  const open = elements.settingsPanel.hidden;
  elements.settingsPanel.hidden = !open;
  elements.settingsToggle.setAttribute("aria-expanded", String(open));
});
elements.apiBase.addEventListener("input", updatePairingCommand);
elements.scope.addEventListener("click", () => void useCurrentPage().catch((error) => setError(error.message)));
elements.connect.addEventListener("click", () => void connect().catch((error) => setError(error.message)));
elements.disconnect.addEventListener("click", () => post({ type: "disconnect" }));
elements.run.addEventListener("click", startRun);
elements.stop.addEventListener("click", () => post({ type: "run.stop" }));
elements.copyPairingCommand.addEventListener("click", () => void navigator.clipboard
  .writeText(elements.pairingCommand.textContent)
  .catch(() => setError("Copy failed. Select the pairing command manually.")));
elements.copyResult.addEventListener("click", () => void navigator.clipboard
  .writeText(state.output || "")
  .catch(() => setError("Copy failed. Select the result text manually.")));
elements.dashboard.addEventListener("click", () => chrome.tabs.create({ url: state.dashboardUrl || "http://127.0.0.1:9119" }));
elements.goal.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    startRun();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.approval) {
    event.preventDefault();
    post({ type: "approval.respond", choice: "deny", requestId: state.approval.request_id || state.approval.requestId });
  }
});

post({ type: "state.get" });
