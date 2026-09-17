const workflowSelect = document.querySelector("#workflow");
const logEl = document.querySelector("#log");
const cartEl = document.querySelector("#cart");
const ordersEl = document.querySelector("#orders");
const suggestionsEl = document.querySelector("#suggestions");
const inputEl = document.querySelector("#input");
const formEl = document.querySelector("#composer");
const providerEl = document.querySelector("#provider");
const traceEl = document.querySelector("#trace");

let sessionId = null;
let brand = null;

function applyBrand(next) {
  brand = next;
  const root = document.documentElement;
  root.style.setProperty("--bg", next.colors.bg);
  root.style.setProperty("--panel", next.colors.panel);
  root.style.setProperty("--primary", next.colors.primary);
  root.style.setProperty("--accent", next.colors.accent);
  root.style.setProperty("--text", next.colors.text);
  root.style.setProperty("--muted", next.colors.muted);
  document.querySelector("#brand-name").textContent = next.name;
  document.querySelector("#brand-tagline").textContent = next.tagline;
  document.querySelector("#disclaimer").textContent = next.disclaimer || "";
}

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text ?? "";
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
  return el;
}

function renderSuggestions(prompts = []) {
  suggestionsEl.innerHTML = "";
  for (const prompt of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => send(prompt));
    suggestionsEl.appendChild(button);
  }
}

function renderState(state = {}) {
  const lines = state.cart?.lines || [];
  if (!lines.length) {
    cartEl.innerHTML = `<p class="empty">${state.totals?.summary || "Your bag is empty."}</p>`;
  } else {
    cartEl.innerHTML = lines
      .map(
        (line) =>
          `<div class="cart-line"><span>${line.quantity}× ${line.name}${line.size ? ` · ${line.size}` : ""}</span><span>$${(line.lineCents / 100).toFixed(2)}</span></div>`,
      )
      .join("");
    if (state.totals?.summary) {
      const total = document.createElement("div");
      total.className = "cart-total";
      total.textContent = state.totals.summary.split("\n").slice(-3).join(" · ");
      cartEl.appendChild(total);
    }
  }

  const orders = state.orders || state.appointments || [];
  if (!orders.length) {
    ordersEl.innerHTML = `<p class="eyebrow">Now serving</p><p class="empty">No tickets yet</p>`;
  } else {
    ordersEl.innerHTML =
      `<p class="eyebrow">Now serving</p>` +
      orders
        .map((order) => {
          if (order.number) {
            return `<div class="ticket"><strong>${order.number}</strong><div>${order.status} · ${order.method} · ${order.total}</div></div>`;
          }
          return `<div class="ticket"><strong>${order.service}</strong><div>${order.when} · ${order.status}</div></div>`;
        })
        .join("");
  }
}

async function loadWorkflows() {
  const res = await fetch("/api/workflows");
  const data = await res.json();
  workflowSelect.innerHTML = data.workflows
    .map((workflow) => `<option value="${workflow.id}">${workflow.name}</option>`)
    .join("");
}

async function startSession() {
  logEl.innerHTML = "";
  traceEl.innerHTML = "";
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: workflowSelect.value || "arcade-burgers" }),
  });
  const data = await res.json();
  sessionId = data.session.id;
  applyBrand(data.brand);
  renderSuggestions(data.suggestedPrompts);
  renderState(data.state);
  providerEl.textContent = `provider · ${data.provider}`;
  document.querySelector("#store-line").textContent = `${data.brand.name} · session ${sessionId.slice(-6)}`;
  addBubble("assistant", `Hi — I can take a ${data.brand.name} order as if you were at the counter. What can I get you?`);
}

async function send(text) {
  const content = (text ?? inputEl.value).trim();
  if (!content || !sessionId) return;
  inputEl.value = "";
  formEl.querySelector("button").disabled = true;
  addBubble("user", content);
  let assistant = null;
  try {
    const response = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok || !response.body) {
      addBubble("tool", `Could not reach the lane (${response.status})`);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    const handleChunk = (chunk) => {
      const lines = chunk.split("\n");
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) return;
      const payload = JSON.parse(dataLine);
      if (eventName === "text_delta" && payload.text) {
        if (!assistant) assistant = addBubble("assistant", payload.text);
        else assistant.textContent += payload.text;
        logEl.scrollTop = logEl.scrollHeight;
      } else if (eventName === "tool_execution_start") {
        addBubble("tool", `Using ${payload.toolName}`);
        const row = document.createElement("div");
        row.textContent = `tool · ${payload.toolName}`;
        traceEl.prepend(row);
      } else if (eventName === "state") {
        renderState(payload.state);
      } else if (eventName === "error") {
        addBubble("tool", payload.message);
      }
      eventName = "message";
    };
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split("\n\n");
      buffer = done ? "" : (chunks.pop() ?? "");
      for (const chunk of chunks) handleChunk(chunk);
      if (done) {
        if (buffer.trim()) handleChunk(buffer);
        break;
      }
    }
    if (!assistant) addBubble("assistant", "Anything else for the kitchen?");
  } catch (error) {
    addBubble("tool", error instanceof Error ? error.message : String(error));
  } finally {
    formEl.querySelector("button").disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  send();
});
document.querySelector("#new-session").addEventListener("click", startSession);
workflowSelect.addEventListener("change", startSession);

await loadWorkflows();
await startSession();
