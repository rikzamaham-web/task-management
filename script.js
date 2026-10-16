
"use strict";


// 1. DOM ELEMENTS

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const taskList = $("#taskList");
const boardView = $("#boardView");
const taskModal = $("#taskModal");
const confirmModal = $("#confirmModal");
const taskForm = $("#taskForm");
const toast = $("#toast");

const taskTitle = $("#taskTitle");
const taskDescription = $("#taskDescription");
const taskCategory = $("#taskCategory");
const taskPriority = $("#taskPriority");
const taskDueDate = $("#taskDueDate");
const taskStatus = $("#taskStatus");

const STORAGE_KEY = "taskflow_tasks";
const THEME_KEY = "taskflow_dark_mode";


// 2. APPLICATION STATE


let tasks = loadTasks();
let currentFilter = "all";
let currentCategory = null;
let currentView = "list";
let editingTaskId = null;
let deletingTaskId = null;
let toastTimer;


// 3. STORAGE FUNCTIONS


function loadTasks() {
  try {
    const savedTasks = localStorage.getItem(STORAGE_KEY);

    if (!savedTasks) return [];

    const parsedTasks = JSON.parse(savedTasks);

    if (!Array.isArray(parsedTasks)) return [];

    // Validate stored task objects before using them.
    return parsedTasks.filter(task =>
      task &&
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      ["High", "Medium", "Low"].includes(task.priority) &&
      ["Work", "Personal", "Learning", "Other"].includes(task.category) &&
      ["pending", "completed"].includes(task.status)
    );
  } catch (error) {
    console.error("Could not load saved tasks:", error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save tasks:", error);
    showToast("Could not save tasks. Check browser storage.");
    return false;
  }
}


// 4. HELPER FUNCTIONS


// Escape user-entered text before inserting it into HTML.
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function createId() {
  if (typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  // Local date, not UTC date.
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function isOverdue(task) {
  return task.status === "pending" &&
    Boolean(task.dueDate) &&
    task.dueDate < getToday();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


// 5. TASK CRUD: CREATE AND UPDATE


function openTaskModal(task = null) {
  editingTaskId = task ? task.id : null;

  taskForm.reset();

  $("#modalTitle").textContent = task ? "Edit task" : "Create a task";
  $("#saveTaskBtn").textContent = task ? "Update Task" : "Save Task";

  if (task) {
    taskTitle.value = task.title;
    taskDescription.value = task.description || "";
    taskCategory.value = task.category;
    taskPriority.value = task.priority;
    taskDueDate.value = task.dueDate || "";
    taskStatus.value = task.status;
  } else {
    taskCategory.value = currentCategory || "Work";
    taskPriority.value = "Medium";
    taskStatus.value = "pending";
  }

  taskModal.classList.remove("hidden");
  taskTitle.focus();
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
  editingTaskId = null;
}

taskForm.addEventListener("submit", event => {
  event.preventDefault();

  const title = taskTitle.value.trim();

  if (!title) {
    showToast("Please enter a task title.");
    taskTitle.focus();
    return;
  }

  const now = new Date().toISOString();

  const taskData = {
    title,
    description: taskDescription.value.trim(),
    category: taskCategory.value,
    priority: taskPriority.value,
    dueDate: taskDueDate.value,
    status: taskStatus.value
  };

  if (editingTaskId) {
    const index = tasks.findIndex(task => task.id === editingTaskId);

    if (index === -1) {
      showToast("Task could not be found.");
      closeTaskModal();
      return;
    }

    tasks[index] = {
      ...tasks[index],
      ...taskData,
      updatedAt: now
    };
  } else {
    tasks.unshift({
      id: createId(),
      ...taskData,
      createdAt: now,
      updatedAt: now
    });
  }

  if (!saveTasks()) return;

  closeTaskModal();
  renderApp();
  showToast(editingTaskId ? "Task updated!" : "Task created!");
});

$("#addTaskBtn").addEventListener("click", () => openTaskModal());
$("#closeModalBtn").addEventListener("click", closeTaskModal);
$("#cancelModalBtn").addEventListener("click", closeTaskModal);


// 6. DELETE TASK


function openDeleteConfirmation(id) {
  deletingTaskId = id;
  confirmModal.classList.remove("hidden");
}

function closeDeleteConfirmation() {
  confirmModal.classList.add("hidden");
  deletingTaskId = null;
}

$("#cancelDeleteBtn").addEventListener("click", closeDeleteConfirmation);

$("#confirmDeleteBtn").addEventListener("click", () => {
  if (!deletingTaskId) return;

  const taskToDelete = deletingTaskId;
  const previousTasks = tasks;

  tasks = tasks.filter(task => task.id !== taskToDelete);

  if (!saveTasks()) {
    tasks = previousTasks;
    return;
  }

  closeDeleteConfirmation();
  renderApp();
  showToast("Task deleted.");
});


// 7. COMPLETE / REOPEN TASK

function toggleTaskStatus(id) {
  const task = tasks.find(item => item.id === id);

  if (!task) return;

  const oldStatus = task.status;

  task.status = oldStatus === "completed" ? "pending" : "completed";
  task.updatedAt = new Date().toISOString();

  if (!saveTasks()) {
    task.status = oldStatus;
    return;
  }

  renderApp();

  showToast(
    task.status === "completed"
      ? "Task completed!"
      : "Task marked as pending."
  );
}

// 8. FILTERING AND SEARCH

function getVisibleTasks() {
  const searchTerm = $("#searchInput").value.trim().toLowerCase();
  const selectedPriority = $("#priorityFilter").value;
  const sortBy = $("#sortSelect").value;

  let visibleTasks = tasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm) ||
      (task.description || "").toLowerCase().includes(searchTerm);

    const matchesPriority =
      selectedPriority === "all" ||
      task.priority === selectedPriority;

    const matchesCategory =
      !currentCategory || task.category === currentCategory;

    let matchesFilter = true;

    if (currentFilter === "pending") {
      matchesFilter = task.status === "pending";
    } else if (currentFilter === "completed") {
      matchesFilter = task.status === "completed";
    } else if (currentFilter === "overdue") {
      matchesFilter = isOverdue(task);
    }

    return matchesSearch &&
      matchesPriority &&
      matchesCategory &&
      matchesFilter;
  });

  const priorityRank = { High: 3, Medium: 2, Low: 1 };

  visibleTasks.sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.createdAt) - new Date(b.createdAt);

      case "due":
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);

      case "priority":
        return priorityRank[b.priority] - priorityRank[a.priority];

      case "alphabetical":
        return a.title.localeCompare(b.title);

      case "newest":
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return visibleTasks;
}

// 9. RENDER A TASK CARD

function renderTask(task, boardMode = false) {
  const overdue = isOverdue(task);
  const dueText = task.dueDate
    ? `${overdue ? "Overdue · " : "Due "}${formatDate(task.dueDate)}`
    : "";

  return `
    <article class="task-item ${task.status === "completed" ? "completed" : ""} ${boardMode ? "board-card" : ""}">
      ${boardMode ? "" : `
        <input
          class="task-check"
          type="checkbox"
          data-action="toggle"
          data-id="${escapeHTML(task.id)}"
          aria-label="Mark ${escapeHTML(task.title)} as complete"
          ${task.status === "completed" ? "checked" : ""}
        >
      `}

      <div class="task-content">
        <h3 class="task-title">${escapeHTML(task.title)}</h3>

        ${task.description ? `
          <p class="task-description">${escapeHTML(task.description)}</p>
        ` : ""}

        <div class="task-meta">
          <span class="pill priority-${task.priority}">
            ${escapeHTML(task.priority)}
          </span>

          <span class="pill category-pill">
            ${escapeHTML(task.category)}
          </span>

          ${dueText ? `
            <span class="due-date ${overdue ? "overdue" : ""}">
              ${escapeHTML(dueText)}
            </span>
          ` : ""}
        </div>
      </div>

      ${boardMode ? "" : ""}

      <div class="task-actions">
        ${boardMode ? `
          <button class="action-btn" data-action="toggle" data-id="${escapeHTML(task.id)}" title="Change status" aria-label="Change task status">
            ${task.status === "completed" ? "↶" : "✓"}
          </button>
        ` : ""}

        <button class="action-btn" data-action="edit" data-id="${escapeHTML(task.id)}" title="Edit task" aria-label="Edit task">✎</button>

        <button class="action-btn delete" data-action="delete" data-id="${escapeHTML(task.id)}" title="Delete task" aria-label="Delete task">⌫</button>
      </div>
    </article>
  `;
}

// 10. EMPTY STATE


function renderEmptyState() {
  const searchTerm = $("#searchInput").value.trim();

  let title = "No tasks yet";
  let message = "Create your first task to get started.";

  if (searchTerm) {
    title = "No matching tasks";
    message = "Try another search term or change your filters.";
  } else if (currentFilter === "completed") {
    title = "No completed tasks";
    message = "Completed tasks will appear here.";
  } else if (currentFilter === "overdue") {
    title = "No overdue tasks";
    message = "Great! You have no overdue pending tasks.";
  } else if (currentFilter === "pending") {
    title = "No pending tasks";
    message = "You're all caught up!";
  }

  return `
    <div class="empty-state">
      <div class="empty-icon">☷</div>
      <h3>${title}</h3>
      <p>${message}</p>
      <button class="primary-btn" data-action="add">＋ Add Task</button>
    </div>
  `;
}


// 11. RENDER LIST VIEW


function renderList(visibleTasks) {
  if (visibleTasks.length === 0) {
    taskList.innerHTML = renderEmptyState();
    return;
  }

  taskList.innerHTML = visibleTasks
    .map(task => renderTask(task))
    .join("");
}


// 12. RENDER KANBAN BOARD


function renderBoard(visibleTasks) {
  const columns = [
    { status: "pending", title: "Pending" },
    { status: "completed", title: "Completed" }
  ];

  boardView.innerHTML = columns.map(column => {
    const columnTasks = visibleTasks.filter(
      task => task.status === column.status
    );

    return `
      <section class="board-column">
        <h3>${column.title} <span>${columnTasks.length}</span></h3>

        <div class="board-items">
          ${columnTasks.length
            ? columnTasks.map(task => renderTask(task, true)).join("")
            : `<p class="subtitle">No tasks here</p>`
          }
        </div>
      </section>
    `;
  }).join("") + `
    <section class="board-column">
      <h3>Overdue <span>${visibleTasks.filter(isOverdue).length}</span></h3>
      <div class="board-items">
        ${visibleTasks.filter(isOverdue).length
          ? visibleTasks.filter(isOverdue).map(task => renderTask(task, true)).join("")
          : `<p class="subtitle">No overdue tasks</p>`
        }
      </div>
    </section>
  `;
}


// 13. DASHBOARD STATISTICS


function renderStats() {
  const total = tasks.length;
  const pending = tasks.filter(task => task.status === "pending").length;
  const completed = tasks.filter(task => task.status === "completed").length;
  const overdue = tasks.filter(isOverdue).length;

  $("#allCount").textContent = total;
  $("#pendingCount").textContent = pending;
  $("#completedCount").textContent = completed;
  $("#overdueCount").textContent = overdue;

  $("#totalStat").textContent = total;
  $("#pendingStat").textContent = pending;
  $("#completedStat").textContent = completed;
  $("#overdueStat").textContent = overdue;

  const percent = total ? Math.round((completed / total) * 100) : 0;

  $("#progressPercent").textContent = `${percent}%`;
  $("#progressBar").style.width = `${percent}%`;
}

// 14. NAVIGATION AND CATEGORY UI


function renderNavigation() {
  const titles = {
    all: "All Tasks",
    pending: "Pending Tasks",
    completed: "Completed Tasks",
    overdue: "Overdue Tasks"
  };

  $("#pageTitle").textContent = currentCategory
    ? `${currentCategory} Tasks`
    : titles[currentFilter];

  $("#listHeading").textContent = currentCategory
    ? `${currentCategory} tasks`
    : "Your tasks";

  $$(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.filter === currentFilter && !currentCategory
    );
  });

  $$(".category-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.category === currentCategory
    );
  });
}

// 15. MAIN RENDER FUNCTION


function renderApp() {
  renderStats();
  renderNavigation();

  const visibleTasks = getVisibleTasks();

  $("#resultCount").textContent =
    `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"}`;

  if (currentView === "list") {
    taskList.classList.remove("hidden");
    boardView.classList.add("hidden");
    renderList(visibleTasks);
  } else {
    taskList.classList.add("hidden");
    boardView.classList.remove("hidden");
    renderBoard(visibleTasks);
  }
}

// 16. EVENT DELEGATION


function handleTaskAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "add") {
    openTaskModal();
    return;
  }

  if (!id) return;

  if (action === "toggle") {
    toggleTaskStatus(id);
  } else if (action === "edit") {
    const task = tasks.find(item => item.id === id);

    if (task) openTaskModal(task);
  } else if (action === "delete") {
    openDeleteConfirmation(id);
  }
}

taskList.addEventListener("click", handleTaskAction);
boardView.addEventListener("click", handleTaskAction);

taskList.addEventListener("change", event => {
  if (event.target.matches('[data-action="toggle"]')) {
    toggleTaskStatus(event.target.dataset.id);
  }
});


// 17. FILTER AND VIEW EVENTS

$$(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    currentCategory = null;
    renderApp();
  });
});

$$(".category-btn").forEach(button => {
  button.addEventListener("click", () => {
    const category = button.dataset.category;

    currentCategory = currentCategory === category ? null : category;
    currentFilter = "all";

    renderApp();
  });
});

$("#searchInput").addEventListener("input", renderApp);
$("#priorityFilter").addEventListener("change", renderApp);
$("#sortSelect").addEventListener("change", renderApp);

$("#listViewBtn").addEventListener("click", () => {
  currentView = "list";
  $("#listViewBtn").classList.add("active");
  $("#boardViewBtn").classList.remove("active");
  renderApp();
});

$("#boardViewBtn").addEventListener("click", () => {
  currentView = "board";
  $("#boardViewBtn").classList.add("active");
  $("#listViewBtn").classList.remove("active");
  renderApp();
});


// 18. DARK MODE


function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  $("#themeBtn").textContent = isDark
    ? "☀ Switch to light mode"
    : "☾ Toggle dark mode";
}

let isDarkMode = localStorage.getItem(THEME_KEY) === "true";
applyTheme(isDarkMode);

$("#themeBtn").addEventListener("click", () => {
  isDarkMode = !isDarkMode;

  try {
    localStorage.setItem(THEME_KEY, String(isDarkMode));
  } catch (error) {
    console.error("Could not save theme preference:", error);
  }

  applyTheme(isDarkMode);
});

// 19. KEYBOARD AND MODAL EVENT

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeTaskModal();
    closeDeleteConfirmation();
  }

  // Ctrl+Enter / Cmd+Enter submits the task form.
  if (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !taskModal.classList.contains("hidden")
  ) {
    taskForm.requestSubmit();
  }
});

taskModal.addEventListener("click", event => {
  if (event.target === taskModal) closeTaskModal();
});

confirmModal.addEventListener("click", event => {
  if (event.target === confirmModal) closeDeleteConfirmation();
});


// 20. INITIALIZE APPLICATIO

$("#todayText").textContent = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric"
});

renderApp();
