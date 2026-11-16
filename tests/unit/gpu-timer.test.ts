import { beforeAll, describe, expect, it } from "vitest";
import { GpuTimer } from "../../src/core/gpu-timer";

// Node has no WebGPU globals; the timer only reads these flag constants.
beforeAll(() => {
  Object.assign(globalThis, {
    GPUBufferUsage: { QUERY_RESOLVE: 0x200, COPY_SRC: 0x4, COPY_DST: 0x8, MAP_READ: 0x1 },
    GPUMapMode: { READ: 0x1 },
  });
});

// Minimal device stand-in: only what GpuTimer touches.
function device() {
  const stub = () => ({ destroy() {} });
  return {
    features: new Set(["timestamp-query"]),
    createQuerySet: stub,
    createBuffer: stub,
  } as unknown as GPUDevice;
}
const encoder = () =>
  ({
    beginComputePass: () => ({ end() {} }),
    resolveQuerySet() {},
    copyBufferToBuffer() {},
  }) as unknown as GPUCommandEncoder;

describe("GpuTimer", () => {
  it("has three slots and runs out when none is returned", () => {
    const t = new GpuTimer(device(), () => {});
    const slots = [t.start(encoder()), t.start(encoder()), t.start(encoder())];
    expect(slots.every(Boolean)).toBe(true);
    expect(t.start(encoder())).toBeUndefined();
  });
  it("gets a slot back when its commands were never submitted", () => {
    const t = new GpuTimer(device(), () => {});
    const a = t.start(encoder());
    t.start(encoder());
    t.start(encoder());
    expect(t.start(encoder())).toBeUndefined();
    // A failed frame (import or canvas error before submit) cancels its slot instead of leaking it.
    t.cancel(a);
    expect(t.start(encoder())).toBe(a);
  });
  it("ignores cancel without a slot and works without timestamp queries", () => {
    const t = new GpuTimer({ features: new Set() } as unknown as GPUDevice, () => {});
    expect(() => t.cancel(undefined)).not.toThrow();
    expect(t.start(encoder())).toBeUndefined();
  });
});
