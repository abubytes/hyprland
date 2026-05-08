#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile: execFileCallback } = require("node:child_process");
const { promisify } = require("node:util");

const execFile = promisify(execFileCallback);

const NAVIO_DIR = "/home/marv/.openclaw/navio";
const DEFAULT_CACHE_PATH = path.join(process.env.XDG_CACHE_HOME || path.join(process.env.HOME || "/tmp", ".cache"), "lualand-next", "navio-cache.json");
const DEFAULT_INTERVAL_MS = 300000;
const DEFAULT_LIMIT = 200;
const DONE_STATUS = new Set(["done", "complete", "completed", "archived", "cancelled", "canceled"]);
const IN_PROGRESS_STATUS = new Set(["in progress", "doing", "active", "now"]);
const TODO_STATUS = new Set(["todo", "to do", "backlog", "blocked", "ready", "next", "not started"]);
const SECRET_PATTERN = /([A-Za-z0-9_-]*(?:token|secret|key|password|auth)[A-Za-z0-9_-]*=)[^\s"'`]+/gi;

function normalizeCache(projectsJson, tasksJson, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const projects = asArray(projectsJson).map(normalizeProject).filter(Boolean);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const tasks = sortTasks(asArray(tasksJson).map((task) => normalizeTask(task, projectById)).filter(Boolean));

  return {
    ok: true,
    source: "navio",
    generatedAt,
    counts: {
      projects: projects.length,
      tasks: tasks.length,
      undoneTasks: tasks.filter((task) => !task.done).length,
    },
    projects: sortProjects(projects),
    tasks,
  };
}

function normalizeProject(page) {
  const props = propertiesByName(page);
  const title = firstValue(props, ["Name", "Project", "Project Name", "Title"], page?.title || page?.name || "");
  if (!page || (!page.id && !title)) {
    return null;
  }

  const status = firstValue(props, ["Status", "State"], "");
  const planned = firstValue(props, ["Planned", "Plan", "Planned Date", "Date"], null);
  const due = firstValue(props, ["Due", "Due Date", "Deadline"], null);

  return compactObject({
    id: page.id || stableId(title),
    title,
    status,
    statusKey: statusKey(status),
    done: isDone(status),
    planned: normalizeDateRange(planned),
    due: normalizeDateRange(due),
    url: page.url || "",
    icon: page.icon || null,
    updatedAt: page.last_edited_time || page.updatedAt || "",
  });
}

function normalizeTask(page, projectById = new Map()) {
  const props = propertiesByName(page);
  const title = firstValue(props, ["Task Name", "Name", "Task", "Title"], page?.title || page?.name || "");
  if (!page || (!page.id && !title)) {
    return null;
  }

  const status = firstValue(props, ["Status", "State"], "");
  const planned = firstValue(props, ["Planned", "Plan", "Planned Date", "Date"], null);
  const due = firstValue(props, ["Due", "Due Date", "Deadline"], null);
  const relationIds = relationValue(firstValue(props, ["Project", "Projects"], []));
  const projectTitles = relationIds.map((id) => projectById.get(id)?.title).filter(Boolean);

  return compactObject({
    id: page.id || stableId(title),
    title,
    status,
    statusKey: statusKey(status),
    done: isDone(status),
    planned: normalizeDateRange(planned),
    due: normalizeDateRange(due),
    projectIds: relationIds,
    projectTitles,
    priority: firstValue(props, ["Priority"], null),
    url: page.url || "",
    icon: page.icon || null,
    updatedAt: page.last_edited_time || page.updatedAt || "",
  });
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const rankDiff = statusRank(a) - statusRank(b);
    if (rankDiff !== 0) return rankDiff;
    const dateDiff = dateSortValue(a.due || a.planned) - dateSortValue(b.due || b.planned);
    if (dateDiff !== 0) return dateDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const rankDiff = statusRank(a) - statusRank(b);
    if (rankDiff !== 0) return rankDiff;
    return String(a.title).localeCompare(String(b.title));
  });
}

function statusRank(item) {
  if (IN_PROGRESS_STATUS.has(item.statusKey)) return 0;
  if (!item.done && TODO_STATUS.has(item.statusKey)) return 1;
  if (!item.done) return 2;
  return 3;
}

function isDone(status) {
  return DONE_STATUS.has(statusKey(status));
}

function statusKey(status) {
  return String(status || "").trim().toLowerCase();
}

function filterByLocalDate(items, options = {}) {
  const field = options.field || "due";
  const from = options.from ? startOfLocalDay(options.from) : -Infinity;
  const to = options.to ? endOfLocalDay(options.to) : Infinity;

  return items.filter((item) => {
    const range = normalizeDateRange(item[field]);
    if (!range?.start) return false;
    const start = parseLocalDateTime(range.start).getTime();
    const end = range.end ? parseLocalDateTime(range.end).getTime() : start;
    return end >= from && start <= to;
  });
}

async function fetchNavioPages(databaseName, options = {}) {
  const limit = String(options.limit || DEFAULT_LIMIT);
  const args = ["run", "navio", "pages", "query", databaseName, "--limit", limit, "--json"];
  const result = await execFile("uv", args, {
    cwd: options.navioDir || NAVIO_DIR,
    timeout: options.timeoutMs || 120000,
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  return JSON.parse(result.stdout);
}

async function buildCache(options = {}) {
  if (options.fixturesDir) {
    return normalizeCache(
      await readJson(path.join(options.fixturesDir, "projects.json")),
      await readJson(path.join(options.fixturesDir, "tasks.json")),
      options,
    );
  }

  const fetcher = options.fetcher || fetchNavioPages;
  const [projects, tasks] = await Promise.all([
    fetcher("Projects", options),
    fetcher("Tasks", options),
  ]);
  return normalizeCache(projects, tasks, options);
}

async function writeCacheOnce(options = {}) {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const errorPath = options.errorPath || `${cachePath}.error.json`;

  try {
    const cache = await buildCache(options);
    await writeJson(cachePath, cache);
    await removeIfExists(errorPath);
    return cache;
  } catch (error) {
    const lastGood = await readJsonIfExists(cachePath);
    const errorObject = {
      ok: false,
      source: "navio",
      generatedAt: new Date().toISOString(),
      cachePath,
      lastGoodAvailable: Boolean(lastGood?.ok),
      error: sanitizeError(error),
    };
    await writeJson(errorPath, errorObject);
    if (!lastGood) {
      await writeJson(cachePath, errorObject);
    }
    return errorObject;
  }
}

async function watchCache(options = {}) {
  const intervalMs = numberOption(options.intervalMs, DEFAULT_INTERVAL_MS);
  await writeCacheOnce(options);
  return setInterval(() => {
    writeCacheOnce(options).catch((error) => {
      process.stderr.write(`${JSON.stringify({ ok: false, error: sanitizeError(error) })}\n`);
    });
  }, intervalMs);
}

function propertiesByName(page) {
  if (!page?.properties) return new Map();
  if (Array.isArray(page.properties)) {
    return new Map(page.properties.map((prop) => [prop.name, prop.value]));
  }
  return new Map(Object.entries(page.properties).map(([name, prop]) => [name, notionPropertyValue(prop)]));
}

function notionPropertyValue(prop) {
  if (!prop || typeof prop !== "object") return prop;
  if (Object.prototype.hasOwnProperty.call(prop, "value")) return prop.value;
  const type = prop.type;
  const raw = prop[type];
  if (raw == null) return null;
  if (type === "title" || type === "rich_text") return raw.map((part) => part.plain_text || "").join("");
  if (type === "select" || type === "status") return raw?.name || null;
  if (type === "multi_select") return raw.map((part) => part.name);
  if (type === "date") return raw.end ? `${raw.start}/${raw.end}` : raw.start;
  if (type === "relation") return raw.map((part) => part.id);
  if (type === "formula" || type === "rollup") return raw[raw.type];
  return raw;
}

function firstValue(props, names, fallback) {
  for (const name of names) {
    if (props.has(name)) {
      const value = props.get(name);
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return fallback;
}

function relationValue(value) {
  if (!Array.isArray(value)) return value ? [String(value)] : [];
  return value.map((entry) => (typeof entry === "string" ? entry : entry.id)).filter(Boolean);
}

function normalizeDateRange(value) {
  if (!value) return null;
  if (typeof value === "object" && value.start) {
    return compactObject({ start: value.start, end: value.end || null });
  }
  const [start, end] = String(value).split("/");
  return compactObject({ start: start || null, end: end || null });
}

function dateSortValue(range) {
  if (!range?.start) return Number.MAX_SAFE_INTEGER;
  const value = new Date(range.start).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function startOfLocalDay(value) {
  const date = parseLocalDateTime(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfLocalDay(value) {
  const date = parseLocalDateTime(value);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function parseLocalDateTime(value) {
  const text = String(value);
  const plainDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plainDate) {
    return new Date(Number(plainDate[1]), Number(plainDate[2]) - 1, Number(plainDate[3]));
  }
  return new Date(text);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.pages)) return value.pages;
  return [];
}

function stableId(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)));
}

function numberOption(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sanitizeError(error) {
  return {
    name: error?.name || "Error",
    message: sanitizeText(error?.message || String(error)),
    code: error?.code || null,
    stderr: sanitizeText(error?.stderr || ""),
  };
}

function sanitizeText(value) {
  return String(value || "").replace(SECRET_PATTERN, "$1[redacted]");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function parseArgs(argv) {
  const args = { mode: argv[2] || "once" };
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.mode === "fixtures") {
    if (!options.fixturesDir) {
      options.fixturesDir = path.join(__dirname, "..", "fixtures", "navio");
    }
    const cache = await buildCache(options);
    if (options.cachePath) await writeJson(options.cachePath, cache);
    process.stdout.write(`${JSON.stringify(cache, null, 2)}\n`);
    return cache;
  }
  if (options.mode === "once") {
    const result = await writeCacheOnce(options);
    process.stdout.write(`${JSON.stringify({ ok: result.ok, cachePath: options.cachePath || DEFAULT_CACHE_PATH, errorPath: options.errorPath || `${options.cachePath || DEFAULT_CACHE_PATH}.error.json` })}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return result;
  }
  if (options.mode === "watch") {
    await watchCache(options);
    return null;
  }
  throw new Error(`Unknown mode: ${options.mode}`);
}

module.exports = {
  DEFAULT_CACHE_PATH,
  DEFAULT_INTERVAL_MS,
  NAVIO_DIR,
  buildCache,
  fetchNavioPages,
  filterByLocalDate,
  main,
  normalizeCache,
  normalizeProject,
  normalizeTask,
  sortTasks,
  statusRank,
  writeCacheOnce,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: sanitizeError(error) })}\n`);
    process.exitCode = 1;
  });
}
