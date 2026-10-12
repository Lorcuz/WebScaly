/** Bounded, asynchronous GPU timestamp readback. No CPU fence in the render loop. */
export class GpuTimer {
  private slots: {
    queries: GPUQuerySet;
    resolve: GPUBuffer;
    read: GPUBuffer;
    busy: boolean;
  }[] = [];
  constructor(
    private device: GPUDevice,
    private report: (ms: number) => void,
  ) {
    if (!device.features.has("timestamp-query")) return;
    this.slots = Array.from({ length: 3 }, () => ({
      queries: device.createQuerySet({ type: "timestamp", count: 2 }),
      resolve: device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      }),
      read: device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      busy: false,
    }));
  }
  start(encoder: GPUCommandEncoder) {
    const slot = this.slots.find((s) => !s.busy);
    if (!slot) return undefined;
    slot.busy = true;
    encoder
      .beginComputePass({
        timestampWrites: {
          querySet: slot.queries,
          beginningOfPassWriteIndex: 0,
        },
      })
      .end();
    return slot;
  }
  end(encoder: GPUCommandEncoder, slot: ReturnType<GpuTimer["start"]>) {
    if (!slot) return;
    encoder
      .beginComputePass({
        timestampWrites: { querySet: slot.queries, endOfPassWriteIndex: 1 },
      })
      .end();
    encoder.resolveQuerySet(slot.queries, 0, 2, slot.resolve, 0);
    encoder.copyBufferToBuffer(slot.resolve, 0, slot.read, 0, 16);
  }
  read(slot: ReturnType<GpuTimer["start"]>) {
    if (!slot) return;
    void slot.read
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const times = new BigUint64Array(slot.read.getMappedRange());
        const ms = Number(times[1] - times[0]) / 1e6;
        if (Number.isFinite(ms) && ms >= 0) this.report(ms);
        slot.read.unmap();
      })
      .catch(() => {})
      .finally(() => {
        slot.busy = false;
      });
  }
  destroy() {
    for (const s of this.slots) {
      s.queries.destroy();
      s.resolve.destroy();
      s.read.destroy();
    }
    this.slots = [];
  }
}
