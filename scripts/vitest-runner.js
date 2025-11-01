#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

class Suite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.beforeEach = [];
    this.afterEach = [];
    this.children = [];
  }
}

const rootSuite = new Suite('');
const suiteStack = [rootSuite];

function currentSuite() {
  return suiteStack[suiteStack.length - 1];
}

function registerTest(name, fn) {
  currentSuite().tests.push({ name, fn });
}

function describe(name, fn) {
  const suite = new Suite(name);
  currentSuite().children.push(suite);
  suiteStack.push(suite);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

function beforeEach(fn) {
  currentSuite().beforeEach.push(fn);
}

function afterEach(fn) {
  currentSuite().afterEach.push(fn);
}

const expectLib = require('expect');

const vi = {
  spyOn(target, method) {
    if (!target) {
      throw new Error('Cannot spyOn undefined target');
    }
    const original = target[method];
    if (typeof original !== 'function') {
      throw new Error(`Cannot spyOn ${method} — not a function`);
    }

    const spy = function spyWrapper(...args) {
      spy.mock.calls.push(args);
      if (spy.mockImplementationFn) {
        return spy.mockImplementationFn.apply(this, args);
      }
      return original.apply(this, args);
    };

    spy.mock = { calls: [] };
    spy.mockImplementation = (fn) => {
      spy.mockImplementationFn = fn;
      return spy;
    };
    spy.mockRestore = () => {
      target[method] = original;
    };

    target[method] = spy;
    return spy;
  },
};

global.describe = describe;
global.it = registerTest;
global.test = registerTest;
global.beforeEach = beforeEach;
global.afterEach = afterEach;
global.expect = expectLib;
global.vi = vi;

function gatherBeforeEach(suites) {
  const hooks = [];
  for (const suite of suites) {
    hooks.push(...suite.beforeEach);
  }
  return hooks;
}

function gatherAfterEach(suites) {
  const hooks = [];
  for (let i = suites.length - 1; i >= 0; i -= 1) {
    const suite = suites[i];
    for (let j = suite.afterEach.length - 1; j >= 0; j -= 1) {
      hooks.push(suite.afterEach[j]);
    }
  }
  return hooks;
}

async function runHook(fn) {
  return fn();
}

async function runTestCase(testCase, suitesChain, namesChain, results) {
  const beforeHooks = gatherBeforeEach(suitesChain);
  const afterHooks = gatherAfterEach(suitesChain);
  const fullName = namesChain.filter(Boolean).join(' › ');

  let failure = null;

  try {
    for (const hook of beforeHooks) {
      await runHook(hook);
    }
    await testCase.fn();
  } catch (error) {
    failure = error;
  }

  try {
    for (const hook of afterHooks) {
      await runHook(hook);
    }
  } catch (error) {
    if (!failure) {
      failure = error;
    }
  }

  if (failure) {
    console.error(`✗ ${fullName}`);
    console.error(`  ${failure && failure.stack ? failure.stack : failure}`);
    results.push({ name: fullName, success: false, error: failure });
  } else {
    console.log(`✓ ${fullName}`);
    results.push({ name: fullName, success: true });
  }
}

async function runSuite(suite, ancestors, names, results) {
  const suiteNames = suite.name ? names.concat(suite.name) : names;
  const suiteChain = ancestors.concat(suite);

  for (const testCase of suite.tests) {
    await runTestCase(testCase, suiteChain, suiteNames.concat(testCase.name), results);
  }

  for (const child of suite.children) {
    await runSuite(child, suiteChain, suiteNames, results);
  }
}

function loadTests() {
  const testsDir = path.join(process.cwd(), 'tests');
  const entries = fs.readdirSync(testsDir);
  const files = entries
    .filter((entry) => entry.endsWith('.test.js'))
    .sort()
    .map((entry) => path.join(testsDir, entry));

  for (const file of files) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(file);
  }
}

async function main() {
  loadTests();

  const results = [];
  await runSuite(rootSuite, [], [], results);

  const passed = results.filter((result) => result.success).length;
  const failed = results.length - passed;

  console.log('---');
  console.log(`Test summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Unexpected test runner error:', error);
  process.exit(1);
});
