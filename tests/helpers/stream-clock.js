export const flushStreamJobs = async (count = 80) => { for (let i = 0; i < count; i++) await Promise.resolve(); };
export class FakeStreamClock {
    time = 0;
    id = 0;
    timers = new Map();
    now = () => this.time;
    setTimeout = (callback, delay) => { const id = ++this.id; this.timers.set(id, { at: this.time + delay, callback }); return id; };
    clearTimeout = (id) => this.timers.delete(id);
    async advance(milliseconds) {
        await flushStreamJobs();
        const destination = this.time + milliseconds;
        let steps = 0;
        while (true) {
            const timer = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!timer || timer[1].at > destination) break;
            if (++steps > 10000) throw new Error("Fake stream timer limit");
            this.time = timer[1].at; this.timers.delete(timer[0]); timer[1].callback();
            await flushStreamJobs();
        }
        this.time = destination;
        await flushStreamJobs();
    }
}
