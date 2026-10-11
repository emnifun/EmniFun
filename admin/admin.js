/**
 * EmniFun Admin Panel Client
 *
 * Dedicated administration interface for FiveWink puzzle content management.
 * Security notice: Authorization is strictly enforced server-side.
 */

const API_ORIGIN = window.EMNIFUN_API_ORIGIN ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? window.location.origin
    : "https://emnifun.emnifun.workers.dev");

const ADMIN_API_BASE = API_ORIGIN + "/api/admin";
const AUTH_API_BASE = API_ORIGIN + "/api/auth";

let adminState = {
  status: "loading", // "loading" | "unauthenticated" | "forbidden" | "authorized"
  gamerTag: null,
  todayDate: null,
  puzzles: [],
  filterStatus: "all",
  searchQuery: "",
  activeModal: null // null | { type: "create" } | { type: "edit", puzzle } | { type: "confirm", ... }
};

function showToast(message, duration = 3500) {
  const existing = document.querySelector(".admin-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "admin-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error("Could not reach the EmniFun backend server.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Received an invalid response from the server.");
  }

  return { status: response.status, ok: response.ok && data?.ok !== false, data };
}

async function checkAdminStatus() {
  try {
    const { status, ok, data } = await requestJson(ADMIN_API_BASE + "/status");

    if (status === 401) {
      adminState.status = "unauthenticated";
      return;
    }

    if (status === 403 || !ok) {
      adminState.status = "forbidden";
      adminState.gamerTag = data?.gamerTag || null;
      return;
    }

    adminState.status = "authorized";
    adminState.gamerTag = data.gamerTag;
    adminState.todayDate = data.todayDate;
    await loadPuzzles();
  } catch (error) {
    adminState.status = "unauthenticated";
  } finally {
    render();
  }
}

async function loadPuzzles() {
  try {
    const { ok, data } = await requestJson(ADMIN_API_BASE + "/puzzles");
    if (ok) {
      adminState.puzzles = data.puzzles || [];
      updateTable();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogout() {
  try {
    await requestJson(AUTH_API_BASE + "/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    adminState.status = "unauthenticated";
    adminState.gamerTag = null;
    render();
  }
}

async function createPuzzle(puzzleData) {
  const { ok, data } = await requestJson(ADMIN_API_BASE + "/puzzles", {
    method: "POST",
    body: JSON.stringify(puzzleData)
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to create puzzle.");
  }

  showToast("Draft puzzle created successfully.");
  closeModal();
  await loadPuzzles();
}

async function updatePuzzle(puzzleId, puzzleData) {
  const { ok, data } = await requestJson(`${ADMIN_API_BASE}/puzzles/${encodeURIComponent(puzzleId)}`, {
    method: "PUT",
    body: JSON.stringify(puzzleData)
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to update puzzle.");
  }

  showToast("Puzzle updated successfully.");
  closeModal();
  await loadPuzzles();
}

async function publishPuzzle(puzzleId) {
  const { ok, data } = await requestJson(`${ADMIN_API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/publish`, {
    method: "POST"
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to publish puzzle.");
  }

  showToast("Puzzle published!");
  closeModal();
  await loadPuzzles();
}

async function unpublishPuzzle(puzzleId) {
  const { ok, data } = await requestJson(`${ADMIN_API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/unpublish`, {
    method: "POST"
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to unpublish puzzle.");
  }

  showToast("Puzzle moved back to draft.");
  closeModal();
  await loadPuzzles();
}

async function archivePuzzle(puzzleId) {
  const { ok, data } = await requestJson(`${ADMIN_API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/archive`, {
    method: "POST"
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to archive puzzle.");
  }

  showToast("Puzzle archived.");
  closeModal();
  await loadPuzzles();
}

async function deletePuzzle(puzzleId) {
  const { ok, data } = await requestJson(`${ADMIN_API_BASE}/puzzles/${encodeURIComponent(puzzleId)}`, {
    method: "DELETE"
  });

  if (!ok) {
    throw new Error(data?.message || "Failed to delete puzzle.");
  }

  showToast("Puzzle permanently deleted.");
  closeModal();
  await loadPuzzles();
}

function openModal(modalConfig) {
  adminState.activeModal = modalConfig;
  renderModal();
}

function closeModal() {
  adminState.activeModal = null;
  renderModal();
}

function getFilteredPuzzles() {
  return adminState.puzzles.filter((p) => {
    if (adminState.filterStatus !== "all" && p.status !== adminState.filterStatus) {
      return false;
    }
    if (adminState.searchQuery) {
      const q = adminState.searchQuery.toUpperCase();
      return p.date.includes(q) || p.answer.toUpperCase().includes(q);
    }
    return true;
  });
}

function updateTable() {
  const container = document.getElementById("puzzle-table-container");
  if (!container) return;

  const filteredPuzzles = getFilteredPuzzles();

  if (filteredPuzzles.length === 0) {
    container.innerHTML = `
      <div class="admin-empty-state">
        <p>No puzzles found matching the current criteria.</p>
        <button id="btn-empty-create" class="button secondary" type="button">Create your first puzzle</button>
      </div>
    `;
    document.getElementById("btn-empty-create")?.addEventListener("click", () => {
      openModal({ type: "create" });
    });
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Date (IST)</th>
          <th>Status</th>
          <th>Answer</th>
          <th>Clues (5)</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredPuzzles.map(renderPuzzleRow).join("")}
      </tbody>
    </table>
  `;
}

// Render Functions
function render() {
  const app = document.getElementById("admin-app");
  if (!app) return;

  if (adminState.status === "loading") {
    app.innerHTML = `
      <div class="admin-shell">
        <div class="admin-card admin-state-box">
          <h2>Checking permissions…</h2>
          <p>Verifying your administrative session with EmniFun backend.</p>
        </div>
      </div>
    `;
    return;
  }

  if (adminState.status === "unauthenticated") {
    app.innerHTML = `
      <div class="admin-shell">
        <div class="admin-card admin-state-box">
          <h2>Authentication Required</h2>
          <p>You must be signed in to your permanent EmniFun account to access the administration panel.</p>
          <a href="../#login" class="button">Sign in to EmniFun</a>
          <p style="margin-top: 18px; font-size: 0.88rem;">
            <a href="../" style="color: #4f46e5; text-decoration: underline;">← Return to public site</a>
          </p>
        </div>
      </div>
    `;
    return;
  }

  if (adminState.status === "forbidden") {
    app.innerHTML = `
      <div class="admin-shell">
        <div class="admin-card admin-state-box">
          <h2>Access Denied</h2>
          <p>Your authenticated account <strong>${adminState.gamerTag ? `@${escapeHtml(adminState.gamerTag)}` : ""}</strong> does not have administrator privileges.</p>
          <p style="font-size: 0.9rem; color: #9ca3af;">
            If you are the owner, designate this account as admin in Cloudflare D1 SQL.
          </p>
          <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
            <button id="btn-admin-logout" class="button secondary" type="button">Sign Out</button>
            <a href="../" class="button">Return to Game</a>
          </div>
        </div>
      </div>
    `;
    document.getElementById("btn-admin-logout")?.addEventListener("click", handleLogout);
    return;
  }

  // Authorized Dashboard Shell
  app.innerHTML = `
    <div class="admin-shell">
      <header class="admin-header">
        <div class="admin-title-group">
          <h1>FiveWink Administration</h1>
          <p>Manage daily puzzles, clues, scheduling, and publication</p>
        </div>
        <div class="admin-user-bar">
          <span class="admin-badge">Admin: @${escapeHtml(adminState.gamerTag || "")}</span>
          ${adminState.todayDate ? `<span class="admin-date-badge">IST Date: ${escapeHtml(adminState.todayDate)}</span>` : ""}
          <a href="../#games/game1" class="admin-btn-sm" target="_blank" rel="noopener">Play Game</a>
          <button id="btn-admin-logout" class="admin-btn-sm" type="button">Sign Out</button>
        </div>
      </header>

      <section class="admin-toolbar">
        <div class="admin-filters">
          <button id="btn-create-puzzle" class="button" type="button">+ Create Puzzle</button>
          <input
            id="input-search"
            class="admin-input"
            type="search"
            placeholder="Search date or answer…"
            value="${escapeHtml(adminState.searchQuery)}"
            autocomplete="off"
            spellcheck="false"
          />
          <select id="select-status" class="admin-select">
            <option value="all" ${adminState.filterStatus === "all" ? "selected" : ""}>All Statuses</option>
            <option value="draft" ${adminState.filterStatus === "draft" ? "selected" : ""}>Draft</option>
            <option value="published" ${adminState.filterStatus === "published" ? "selected" : ""}>Published</option>
            <option value="unpublished" ${adminState.filterStatus === "unpublished" ? "selected" : ""}>Unpublished</option>
            <option value="archived" ${adminState.filterStatus === "archived" ? "selected" : ""}>Archived</option>
          </select>
        </div>
        <button id="btn-refresh" class="admin-btn-sm" type="button">↻ Refresh</button>
      </section>

      <main id="puzzle-table-container" class="admin-table-container"></main>
    </div>
    <div id="modal-container"></div>
  `;

  attachEventHandlers();
  updateTable();
}

function renderPuzzleRow(p) {
  const isToday = p.date === adminState.todayDate;
  const isLocked = p.status === "published";
  const isArchived = p.status === "archived";

  const firstClue = p.clues && p.clues.length > 0 ? p.clues[0] : "—";

  return `
    <tr>
      <td>
        <strong>${escapeHtml(p.date)}</strong>
        ${isToday ? ` <span class="admin-badge" style="font-size:0.75rem; padding: 2px 6px;">Today</span>` : ""}
      </td>
      <td>
        <span class="status-pill status-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
      </td>
      <td>
        <span class="admin-answer-code">${escapeHtml(p.answer)}</span>
      </td>
      <td>
        <div class="admin-clue-preview" title="1. ${escapeHtml(firstClue)}">
          1. ${escapeHtml(firstClue)}
        </div>
      </td>
      <td>
        <div class="admin-actions">
          ${
            p.status === "draft" || p.status === "unpublished"
              ? `<button class="admin-btn-sm primary btn-edit" data-id="${escapeHtml(p.puzzleId)}" type="button">Edit</button>
                 <button class="admin-btn-sm publish btn-publish" data-id="${escapeHtml(p.puzzleId)}" type="button">Publish</button>`
              : ""
          }
          ${
            isLocked
              ? `<button class="admin-btn-sm warning btn-unpublish" data-id="${escapeHtml(p.puzzleId)}" type="button">Unpublish</button>
                 <span style="font-size: 0.78rem; color: #6b7280; align-self: center;" title="Published content cannot be edited">🔒 Locked</span>`
              : ""
          }
          ${
            !isArchived
              ? `<button class="admin-btn-sm btn-archive" data-id="${escapeHtml(p.puzzleId)}" type="button">Archive</button>`
              : ""
          }
          <button class="admin-btn-sm warning btn-delete" data-id="${escapeHtml(p.puzzleId)}" type="button" title="Delete permanently for testing">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function renderModal() {
  const container = document.getElementById("modal-container");
  if (!container) return;

  const modal = adminState.activeModal;
  if (!modal) {
    container.innerHTML = "";
    return;
  }

  if (modal.type === "create" || modal.type === "edit") {
    const isEdit = modal.type === "edit";
    const puzzle = modal.puzzle || { date: "", answer: "", clues: ["", "", "", "", ""] };

    container.innerHTML = `
      <div class="admin-modal-overlay" id="modal-overlay">
        <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
          <h2 id="modal-heading">${isEdit ? "Edit Draft Puzzle" : "Create New FiveWink Puzzle"}</h2>
          <form id="puzzle-form">
            <div class="admin-form-group">
              <label for="form-date">Puzzle Date (Asia/Kolkata YYYY-MM-DD)</label>
              <input
                id="form-date"
                class="admin-input"
                type="date"
                required
                value="${escapeHtml(puzzle.date)}"
              />
              <p class="admin-form-hint">Assign the target date in IST when this puzzle should appear.</p>
            </div>

            <div class="admin-form-group">
              <label for="form-answer">Five-Letter Answer</label>
              <input
                id="form-answer"
                class="admin-input"
                type="text"
                maxlength="5"
                minlength="5"
                pattern="[A-Za-z]{5}"
                required
                style="text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em;"
                value="${escapeHtml(puzzle.answer)}"
              />
              <p class="admin-form-hint">Must be exactly 5 letters (e.g. CRANE, SHINE).</p>
            </div>

            <div class="admin-form-group">
              <label>Five Progress Clues</label>
              <div class="admin-clue-inputs">
                ${[1, 2, 3, 4, 5]
                  .map(
                    (num) => `
                  <div class="admin-clue-item">
                    <span class="admin-clue-label">Clue ${num}</span>
                    <input
                      id="form-clue-${num}"
                      class="admin-input form-clue"
                      type="text"
                      required
                      placeholder="Enter clue #${num}"
                      value="${escapeHtml(puzzle.clues?.[num - 1] || "")}"
                    />
                  </div>
                `
                  )
                  .join("")}
              </div>
              <p class="admin-form-hint">Players unlock each clue in order when choosing to spend an attempt.</p>
            </div>

            <div id="modal-error-banner" class="admin-alert-banner error" style="display: none;"></div>

            <div class="admin-modal-actions">
              <button id="btn-modal-cancel" class="button secondary" type="button">Cancel</button>
              <button class="button" type="submit">${isEdit ? "Save Changes" : "Create Draft"}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById("btn-modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("modal-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });

    const puzzleForm = document.getElementById("puzzle-form");
    puzzleForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorBanner = document.getElementById("modal-error-banner");
      if (errorBanner) errorBanner.style.display = "none";

      const date = document.getElementById("form-date")?.value.trim();
      const answer = document.getElementById("form-answer")?.value.trim().toUpperCase();
      const clues = [1, 2, 3, 4, 5].map(
        (n) => document.getElementById(`form-clue-${n}`)?.value.trim() || ""
      );

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        showModalError("Please provide a valid date in YYYY-MM-DD format.");
        return;
      }

      if (!answer || answer.length !== 5 || !/^[A-Z]{5}$/.test(answer)) {
        showModalError("Answer must be exactly 5 letters.");
        return;
      }

      if (clues.some((c) => !c)) {
        showModalError("All 5 clues are required and cannot be empty.");
        return;
      }

      try {
        if (modal.type === "edit") {
          await updatePuzzle(modal.puzzle.puzzleId, { date, answer, clues });
        } else {
          await createPuzzle({ date, answer, clues });
        }
      } catch (error) {
        showModalError(error.message);
      }
    });

    return;
  }

  if (modal.type === "confirm") {
    container.innerHTML = `
      <div class="admin-modal-overlay" id="modal-overlay">
        <div class="admin-modal" style="max-width: 440px;" role="dialog" aria-modal="true">
          <h2>${escapeHtml(modal.title)}</h2>
          <p style="color: #4b5563; font-size: 0.95rem; line-height: 1.5;">${escapeHtml(modal.message)}</p>
          <div class="admin-modal-actions">
            <button id="btn-modal-cancel" class="button secondary" type="button">Cancel</button>
            <button id="btn-modal-confirm" class="button ${modal.danger ? "secondary" : ""}" style="${modal.danger ? "background: #dc2626; color: #fff;" : ""}" type="button">
              ${escapeHtml(modal.confirmText || "Confirm")}
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("btn-modal-cancel")?.addEventListener("click", closeModal);
    document.getElementById("modal-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });

    document.getElementById("btn-modal-confirm")?.addEventListener("click", async () => {
      if (modal.onConfirm) {
        try {
          await modal.onConfirm();
        } catch (error) {
          showToast(error.message);
        }
      }
    });
  }
}

function attachEventHandlers() {
  document.getElementById("btn-admin-logout")?.addEventListener("click", handleLogout);
  document.getElementById("btn-refresh")?.addEventListener("click", loadPuzzles);

  document.getElementById("btn-create-puzzle")?.addEventListener("click", () => {
    openModal({ type: "create" });
  });

  const searchInput = document.getElementById("input-search");
  searchInput?.addEventListener("input", (e) => {
    adminState.searchQuery = e.target.value;
    updateTable();
  });

  document.getElementById("select-status")?.addEventListener("change", (e) => {
    adminState.filterStatus = e.target.value;
    updateTable();
  });

  // Table Event Delegation (row buttons)
  const tableContainer = document.getElementById("puzzle-table-container");
  tableContainer?.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".btn-edit");
    if (editBtn) {
      const puzzleId = editBtn.getAttribute("data-id");
      const puzzle = adminState.puzzles.find((p) => p.puzzleId === puzzleId);
      if (puzzle) openModal({ type: "edit", puzzle });
      return;
    }

    const pubBtn = e.target.closest(".btn-publish");
    if (pubBtn) {
      const puzzleId = pubBtn.getAttribute("data-id");
      const puzzle = adminState.puzzles.find((p) => p.puzzleId === puzzleId);
      if (!puzzle) return;
      openModal({
        type: "confirm",
        title: "Publish Puzzle?",
        message: `Are you sure you want to publish the puzzle for ${puzzle.date} with answer "${puzzle.answer}"? Once published, its content will be locked.`,
        confirmText: "Publish Now",
        onConfirm: () => publishPuzzle(puzzleId)
      });
      return;
    }

    const unpubBtn = e.target.closest(".btn-unpublish");
    if (unpubBtn) {
      const puzzleId = unpubBtn.getAttribute("data-id");
      const puzzle = adminState.puzzles.find((p) => p.puzzleId === puzzleId);
      if (!puzzle) return;
      openModal({
        type: "confirm",
        title: "Unpublish Puzzle?",
        message: `Moving the puzzle for ${puzzle.date} back to draft will make it unavailable to players. Active sessions may be interrupted.`,
        confirmText: "Unpublish",
        danger: true,
        onConfirm: () => unpublishPuzzle(puzzleId)
      });
      return;
    }

    const archBtn = e.target.closest(".btn-archive");
    if (archBtn) {
      const puzzleId = archBtn.getAttribute("data-id");
      const puzzle = adminState.puzzles.find((p) => p.puzzleId === puzzleId);
      if (!puzzle) return;
      openModal({
        type: "confirm",
        title: "Archive Puzzle?",
        message: `Archive puzzle for ${puzzle.date}? Archived puzzles remain preserved in the database for historical records.`,
        confirmText: "Archive",
        onConfirm: () => archivePuzzle(puzzleId)
      });
      return;
    }

    const delBtn = e.target.closest(".btn-delete");
    if (delBtn) {
      const puzzleId = delBtn.getAttribute("data-id");
      const puzzle = adminState.puzzles.find((p) => p.puzzleId === puzzleId);
      if (!puzzle) return;
      openModal({
        type: "confirm",
        title: "Delete Puzzle Permanently?",
        message: `Delete this puzzle permanently? This cannot be undone.`,
        confirmText: "Delete Permanently",
        danger: true,
        onConfirm: () => deletePuzzle(puzzleId)
      });
      return;
    }
  });
}

function showModalError(msg) {
  const errorBanner = document.getElementById("modal-error-banner");
  if (errorBanner) {
    errorBanner.textContent = msg;
    errorBanner.style.display = "block";
  } else {
    showToast(msg);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start admin application
window.addEventListener("DOMContentLoaded", () => {
  checkAdminStatus();
});
