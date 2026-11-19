/**
 * Offline agenda (ADR 0088): the device's copy of favourites. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clearInterestCache,
  readInterestCache,
  writeInterestCache,
} from "@/lib/interest-cache";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe("the device's copy of favourites", () => {
  it("round-trips session ids and nothing else", () => {
    const s = fakeStorage();
    writeInterestCache(s, ["a", "b"], 1234);
    assert.deepEqual(readInterestCache(s), { ids: ["a", "b"], at: 1234 });
    const stored = JSON.parse(Object.values(s.data)[0]);
    assert.deepEqual(Object.keys(stored).sort(), ["at", "ids"]);
  });

  it("reads as nothing when empty, malformed or tampered", () => {
    assert.equal(readInterestCache(fakeStorage()), null);
    assert.equal(
      readInterestCache(fakeStorage({ "devfest:interests:v1": "{nope" })),
      null,
    );
    assert.equal(
      readInterestCache(
        fakeStorage({ "devfest:interests:v1": '{"ids":[1,2],"at":1}' }),
      ),
      null,
    );
  });

  it("clears", () => {
    const s = fakeStorage();
    writeInterestCache(s, ["a"]);
    clearInterestCache(s);
    assert.equal(readInterestCache(s), null);
  });

  it("never throws when storage does", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(readInterestCache(broken), null);
    assert.doesNotThrow(() => writeInterestCache(broken, ["a"]));
    assert.doesNotThrow(() => clearInterestCache(broken));
  });
});
