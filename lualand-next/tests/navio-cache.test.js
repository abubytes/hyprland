"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCache,
  filterByLocalDate,
  normalizeCache,
  sortTasks,
  writeCacheOnce,
} = require("../daemons/navio-cache.js");

const fixturesDir = path.join(__dirname, "..", "fixtures", "navio");

test("fixtures mode normalizes projects and sorted tasks without navio", async () => {
  const cache = await buildCache({
    fixturesDir,
    generatedAt: "2026-05-08T00:00:00.000Z",
    fetcher: async () => {
      throw new Error("fetcher should not run for fixtures");
    },
  });

  assert.equal(cache.ok, true);
  assert.equal(cache.generatedAt, "2026-05-08T00:00:00.000Z");
  assert.equal(cache.counts.projects, 2);
  assert.equal(cache.counts.tasks, 4);
  assert.deepEqual(cache.tasks.map((task) => task.id), [
    "task-progress",
    "task-todo",
    "task-blocked",
    "task-done",
  ]);
  assert.equal(cache.tasks[0].projectTitles[0], "Alpha Launch");
  assert.equal(cache.tasks.at(-1).done, true);
});

test("normalizer accepts raw Notion-style property objects", () => {
  const cache = normalizeCache(
    [
      {
        id: "project-beta",
        properties: {
          Name: { type: "title", title: [{ plain_text: "Beta" }] },
          Status: { type: "status", status: { name: "Todo" } },
        },
      },
    ],
    [
      {
        id: "task-beta",
        properties: {
          "Task Name": { type: "title", title: [{ plain_text: "Use raw JSON" }] },
          Status: { type: "status", status: { name: "Done" } },
          Project: { type: "relation", relation: [{ id: "project-beta" }] },
        },
      },
    ],
    { generatedAt: "2026-05-08T00:00:00.000Z" },
  );

  assert.equal(cache.projects[0].title, "Beta");
  assert.equal(cache.tasks[0].title, "Use raw JSON");
  assert.equal(cache.tasks[0].done, true);
  assert.deepEqual(cache.tasks[0].projectTitles, ["Beta"]);
});

test("local date helper filters due and planned windows", async () => {
  const cache = await buildCache({ fixturesDir });
  const dueToday = filterByLocalDate(cache.tasks, { field: "due", from: "2026-05-08", to: "2026-05-08" });
  const plannedToday = filterByLocalDate(cache.tasks, { field: "planned", from: "2026-05-08", to: "2026-05-08" });

  assert.deepEqual(dueToday.map((task) => task.id), ["task-progress", "task-done"]);
  assert.deepEqual(plannedToday.map((task) => task.id), ["task-progress"]);
});

test("status sort keeps in-progress first and done last", () => {
  const sorted = sortTasks([
    { id: "done", title: "Done", status: "Done", statusKey: "done", done: true },
    { id: "other", title: "Other", status: "Review", statusKey: "review", done: false },
    { id: "todo", title: "Todo", status: "Todo", statusKey: "todo", done: false },
    { id: "progress", title: "Progress", status: "In Progress", statusKey: "in progress", done: false },
  ]);

  assert.deepEqual(sorted.map((task) => task.id), ["progress", "todo", "other", "done"]);
});

test("failed once keeps last-good cache and writes error object", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "navio-cache-test-"));
  const cachePath = path.join(dir, "cache.json");
  const errorPath = path.join(dir, "cache.error.json");

  const first = await writeCacheOnce({
    cachePath,
    errorPath,
    fetcher: async (name) => [{ id: name.toLowerCase(), properties: [{ name: "Name", type: "title", value: name }] }],
  });
  assert.equal(first.ok, true);

  const failed = await writeCacheOnce({
    cachePath,
    errorPath,
    fetcher: async () => {
      throw new Error("TOKEN_SECRET=abc123 unavailable");
    },
  });

  const cacheAfterFailure = JSON.parse(await fs.readFile(cachePath, "utf8"));
  const errorAfterFailure = JSON.parse(await fs.readFile(errorPath, "utf8"));

  assert.equal(failed.ok, false);
  assert.equal(cacheAfterFailure.ok, true);
  assert.equal(errorAfterFailure.lastGoodAvailable, true);
  assert.match(errorAfterFailure.error.message, /TOKEN_SECRET=\[redacted\]/);
});
