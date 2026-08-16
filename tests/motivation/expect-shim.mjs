import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function matchesObject(actual, expected) {
  if (!isObject(expected)) {
    assert.deepEqual(actual, expected);
    return;
  }
  assert.ok(isObject(actual), 'expected object');
  for (const [key, value] of Object.entries(expected)) {
    if (isObject(value) && !Array.isArray(value)) {
      matchesObject(actual[key], value);
    } else {
      assert.deepEqual(actual[key], value);
    }
  }
}

export function expect(actual) {
  const self = {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepEqual(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toBeNull() {
      assert.equal(actual, null);
    },
    toBeUndefined() {
      assert.equal(actual, undefined);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toContain(item) {
      if (typeof actual === 'string') {
        assert.ok(actual.includes(item), `expected ${JSON.stringify(actual)} to contain ${item}`);
        return;
      }
      assert.ok(Array.isArray(actual) && actual.includes(item), `expected array to contain ${item}`);
    },
    toMatch(re) {
      assert.match(String(actual), re);
    },
    toThrow(expected) {
      if (typeof actual !== 'function') {
        throw new assert.AssertionError({ message: 'expected a function' });
      }
      if (expected instanceof RegExp) {
        assert.throws(actual, expected);
      } else if (typeof expected === 'string') {
        assert.throws(actual, (err) => String(err?.message ?? err).includes(expected));
      } else if (expected) {
        assert.throws(actual, expected);
      } else {
        assert.throws(actual);
      }
    },
    toBeLessThanOrEqual(n) {
      assert.ok(actual <= n, `expected ${actual} <= ${n}`);
    },
    toBeLessThan(n) {
      assert.ok(actual < n, `expected ${actual} < ${n}`);
    },
    toBeGreaterThan(n) {
      assert.ok(actual > n, `expected ${actual} > ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      assert.ok(actual >= n, `expected ${actual} >= ${n}`);
    },
    toHaveLength(n) {
      assert.equal(actual.length, n);
    },
    toMatchObject(expected) {
      matchesObject(actual, expected);
    },
    toBeInstanceOf(ctor) {
      assert.ok(actual instanceof ctor);
    },
    rejects: {
      async toThrow(expected) {
        if (expected instanceof RegExp) {
          await assert.rejects(actual, expected);
        } else if (typeof expected === 'string') {
          await assert.rejects(actual, (err) => String(err?.message ?? err).includes(expected));
        } else {
          await assert.rejects(actual);
        }
      },
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected);
      },
      toEqual(expected) {
        assert.notDeepEqual(actual, expected);
      },
      toBeNull() {
        assert.notEqual(actual, null);
      },
      toBeUndefined() {
        assert.notEqual(actual, undefined);
      },
      toBeTruthy() {
        assert.ok(!actual);
      },
      toContain(item) {
        if (typeof actual === 'string') {
          assert.ok(!actual.includes(item));
          return;
        }
        assert.ok(!actual.includes(item));
      },
      toMatch(re) {
        assert.doesNotMatch(String(actual), re);
      },
      toThrow() {
        assert.doesNotThrow(actual);
      },
    },
  };
  return self;
}

export { describe, it };
