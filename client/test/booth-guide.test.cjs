const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real page watcher without booting WebGL, a wallet, or an RPC client.
const filename = path.join(__dirname, '../src/Frontend/Panes/BoothGuide/MovePage.tsx');
const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
  },
});

function setup() {
  const emitter = new EventEmitter();
  const storage = new Map();
  const home = { locationId: 'home', location: { coords: { x: 0, y: 0 } }, energy: 100 };
  let selected = home;
  let settled = false;
  let running = false;
  let finishes = 0;
  const restarts = [];
  const events = { SendCancelled: 'cancelled', SendCompleted: 'completed' };
  const exports = {};
  const mocks = {
    react: {},
    '@dfares/gamelogic': { isLocatable: (planet) => Boolean(planet.location) },
    '../../Utils/UIEmitter': {
      default: { getInstance: () => emitter },
      UIEmitterEvent: events,
    },
    './BoothGuidePane': {
      sourcePlanet: () => home,
      moveDestinationKey: () => 'destination',
    },
  };
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (name) => {
        assert.ok(name in mocks, `Unexpected runtime dependency: ${name}`);
        return mocks[name];
      },
      localStorage: {
        setItem: (key, value) => storage.set(key, value),
        getItem: (key) => storage.get(key) ?? null,
      },
    },
    { filename }
  );
  const stop = exports.movePage.watch({
    ui: {
      getSelectedPlanet: () => selected,
      isOwnedByMe: (planet) => planet.locationId === 'home',
    },
    stepId: 'clickNearby',
    finish: () => {
      settled = true;
      finishes += 1;
    },
    restart: (step, message) => {
      settled = true;
      restarts.push({ step, message });
    },
    reject: () => {},
    notify: () => {},
    isSettled: () => settled,
    isRunning: () => running,
    moveSeen: { current: null },
  });

  return {
    emitter,
    events,
    storage,
    restarts,
    stop,
    setSelected: (planet) => (selected = planet),
    setRunning: (value) => (running = value),
    finishes: () => finishes,
    cancel: () => emitter.emit(events.SendCancelled),
    complete: (from = 'home') => emitter.emit(events.SendCompleted, from),
  };
}

test('Escape clears the source and returns the guide to planet selection', () => {
  const guide = setup();
  guide.setSelected(undefined);
  guide.cancel();
  assert.equal(guide.restarts[0]?.step, 'selectMovePlanet');
  assert.match(guide.restarts[0].message, /Select one of your planets/);
  assert.equal(guide.finishes(), 0);
});

test('cancelling with a usable source returns to Send without changing energy', () => {
  const guide = setup();
  guide.cancel();
  assert.equal(guide.restarts[0]?.step, 'pressSend');
  assert.match(guide.restarts[0].message, /cancelled/);
  guide.cancel();
  assert.equal(guide.restarts.length, 1);
});

test('an enemy, empty, or unlocated selection must be replaced before retrying', () => {
  for (const planet of [
    { locationId: 'enemy', location: {}, energy: 100 },
    { locationId: 'home', location: {}, energy: 1 },
    { locationId: 'home', energy: 100 },
  ]) {
    const guide = setup();
    guide.setSelected(planet);
    guide.cancel();
    assert.equal(guide.restarts[0]?.step, 'selectMovePlanet');
  }
});

test('an out-of-range move reopens Send instead of waiting with sending disabled', () => {
  const guide = setup();
  guide.complete();
  assert.equal(guide.restarts[0]?.step, 'pressSend');
  assert.match(guide.restarts[0].message, /not sent/);
  assert.equal(guide.finishes(), 0);
});

test('a successful move retains completion through later cancellation events', () => {
  const guide = setup();
  guide.storage.set('destination', 'nearby-planet');
  guide.complete();
  guide.cancel();
  assert.equal(guide.finishes(), 1);
  assert.equal(guide.restarts.length, 0);
});

test('source selection inside a running helper does not interrupt its move', () => {
  const guide = setup();
  guide.setRunning(true);
  guide.cancel();
  assert.equal(guide.restarts.length, 0);
  guide.storage.set('destination', 'nearby-planet');
  guide.complete();
  assert.equal(guide.finishes(), 1);
});

test('completion from a different source does not advance the guide', () => {
  const guide = setup();
  guide.storage.set('destination', 'nearby-planet');
  guide.complete('another-source');
  assert.equal(guide.finishes(), 0);
  assert.equal(guide.restarts.length, 0);
});

test('leaving the step removes both event listeners', () => {
  const guide = setup();
  guide.stop();
  assert.equal(guide.emitter.listenerCount(guide.events.SendCancelled), 0);
  assert.equal(guide.emitter.listenerCount(guide.events.SendCompleted), 0);
  guide.cancel();
  guide.complete();
  assert.equal(guide.restarts.length, 0);
  assert.equal(guide.finishes(), 0);
});
