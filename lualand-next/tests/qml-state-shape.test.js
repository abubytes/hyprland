#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const samplePath = path.join(root, "quickshell", "state.sample.json");
const state = JSON.parse(fs.readFileSync(samplePath, "utf8"));

assert.equal(typeof state.dayLabel, "string");
assert.equal(typeof state.updatedAt, "string");
assert.equal(typeof state.bar, "object");
assert.equal(typeof state.gm, "object");
assert.equal(typeof state.activeBlock, "object");
assert.equal(typeof state.timer, "object");
assert.ok(Array.isArray(state.workstations));
assert.ok(Array.isArray(state.timeline));
assert.ok(Array.isArray(state.tasks));
assert.ok(state.workstations.length > 0);
assert.ok(state.timeline.length > 0);

assert.equal(typeof state.bar.time, "string");
assert.equal(typeof state.bar.date, "string");
assert.equal(typeof state.bar.workspace, "string");
assert.equal(typeof state.bar.workstation, "string");
assert.equal(typeof state.timer.primaryAction, "string");
assert.equal(typeof state.timer.primaryLabel, "string");

for (const station of state.workstations) {
  assert.equal(typeof station.id, "string");
  assert.equal(typeof station.label, "string");
  assert.equal(typeof station.short, "string");
  assert.equal(typeof station.active, "boolean");
}

for (const row of state.timeline) {
  assert.equal(typeof row.time, "string");
  assert.equal(typeof row.title, "string");
  assert.equal(typeof row.status, "string");
}

for (const task of state.tasks) {
  assert.equal(typeof task.title, "string");
  assert.equal(typeof task.done, "boolean");
}

console.log("OK lualand-next sample state shape");
