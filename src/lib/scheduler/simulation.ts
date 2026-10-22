/**
 * Pure, deterministic process-scheduling engine.
 *
 * No Three.js, no DOM, no GSAP. The 3D scene is a projection of `Schedule`
 * and `Snapshot`; everything a student sees on the belt can be derived from
 * these values, which keeps the animation honest and makes the algorithms
 * directly comparable.
 */

export type Algorithm = 'fcfs' | 'sjf' | 'rr';

export interface ProcessSpec {
  id: string;
  burst: number;
  /** CPU time served before the process blocks for I/O, or null for CPU-only. */
  ioAfter: number | null;
  ioDuration: number;
  color: string;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface Segment extends TimeRange {
  kind: 'cpu' | 'io' | 'idle';
  pid: string | null;
}

export interface ReadyEvent {
  time: number;
  seq: number;
}

export interface ProcessResult {
  spec: ProcessSpec;
  completion: number;
  turnaround: number;
  waiting: number;
  response: number;
  cpu: TimeRange[];
  io: TimeRange[];
  /** Every time this process became runnable, with a monotonic queue sequence. */
  readyEvents: ReadyEvent[];
  cpuTime: number;
  ioTime: number;
}

export interface Schedule {
  algorithm: Algorithm;
  quantum: number;
  processes: ProcessResult[];
  /** CPU-only row for the Gantt chart, chronological. */
  cpuSegments: Segment[];
  /** Every I/O block, concurrent with the CPU row. */
  ioWindows: Segment[];
  /** CPU + I/O + idle, sorted by start. */
  segments: Segment[];
  total: number;
  utilization: number;
  dispatches: number;
}

export interface Snapshot {
  time: number;
  running: string | null;
  ready: string[];
  waiting: string[];
  done: string[];
  remaining: Record<string, number>;
  ioRemaining: Record<string, number>;
  runProgress: number;
  current: Segment | null;
  completed: number;
}

export interface AlgorithmMeta {
  label: string;
  short: string;
  tagline: string;
  description: string;
}

export const ALGORITHM_META: Record<Algorithm, AlgorithmMeta> = {
  fcfs: {
    label: 'First Come, First Served',
    short: 'FCFS',
    tagline: 'Arrival order, no interruptions.',
    description:
      'The process at the front of the belt owns the core until it blocks for I/O or finishes. Simple, but one long job can hold up the whole queue.',
  },
  sjf: {
    label: 'Shortest Job First',
    short: 'SJF',
    tagline: 'Smallest remaining burst wins.',
    description:
      'Every dispatch picks the process with the least CPU time left. Average waiting time drops, at the cost of starving long jobs in a busy queue.',
  },
  rr: {
    label: 'Round Robin',
    short: 'RR',
    tagline: 'A fair slice for everyone, quantum 2.',
    description:
      'Each process gets at most two time units before returning to the tail of the belt. Response time stays flat as the workload grows.',
  },
};

export const QUANTUM = 2;
export const EPS = 1e-6;

const PROCESS_COLORS = ['#e0af63', '#7fd7d0', '#a89bf3', '#f2a25f', '#ef8187'];

export const FIXED_SCENARIO: ProcessSpec[] = [
  { id: 'P1', burst: 6, ioAfter: 3, ioDuration: 3, color: PROCESS_COLORS[0] },
  { id: 'P2', burst: 3, ioAfter: null, ioDuration: 0, color: PROCESS_COLORS[1] },
  { id: 'P3', burst: 8, ioAfter: 5, ioDuration: 2, color: PROCESS_COLORS[2] },
  { id: 'P4', burst: 2, ioAfter: null, ioDuration: 0, color: PROCESS_COLORS[3] },
  { id: 'P5', burst: 4, ioAfter: 2, ioDuration: 4, color: PROCESS_COLORS[4] },
];

export function cloneScenario(scenario: ProcessSpec[]): ProcessSpec[] {
  return scenario.map((p) => ({ ...p }));
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Randomised studio workload. Two jobs are always CPU-only so the belt
 * cannot deadlock behind a fully blocked ready queue.
 */
export function randomScenario(): ProcessSpec[] {
  const ioSlots = new Set<number>();
  while (ioSlots.size < 3) ioSlots.add(randInt(0, 4));

  return PROCESS_COLORS.map((color, index) => {
    const burst = randInt(2, 8);
    const wantsIo = ioSlots.has(index);
    const ioAfter = wantsIo ? randInt(1, Math.max(1, burst - 1)) : null;
    return {
      id: `P${index + 1}`,
      burst,
      ioAfter,
      ioDuration: wantsIo ? randInt(1, 3) : 0,
      color,
    } satisfies ProcessSpec;
  });
}

interface LiveProcess {
  spec: ProcessSpec;
  remaining: number;
  cpuUsed: number;
  ioStarted: boolean;
  completion: number;
  waiting: number;
  response: number | null;
  readyEvents: ReadyEvent[];
  cpu: TimeRange[];
  io: TimeRange[];
  done: boolean;
}

function lastAtOrBefore(values: number[], time: number): number {
  let value = values[0] ?? 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= time + EPS) value = values[index];
    else break;
  }
  return value;
}

function consumed(intervals: TimeRange[], time: number): number {
  let total = 0;
  for (const range of intervals) {
    if (time >= range.end) total += range.end - range.start;
    else if (time > range.start) total += time - range.start;
  }
  return total;
}

export function simulate(
  scenario: ProcessSpec[],
  algorithm: Algorithm,
  quantum = QUANTUM,
): Schedule {
  if (scenario.length === 0) {
    return {
      algorithm,
      quantum,
      processes: [],
      cpuSegments: [],
      ioWindows: [],
      segments: [],
      total: 0,
      utilization: 0,
      dispatches: 0,
    };
  }

  const specs = cloneScenario(scenario);
  const orderOf = new Map(specs.map((spec, index) => [spec.id, index]));
  const live = new Map<string, LiveProcess>(
    specs.map((spec) => [
      spec.id,
      {
        spec,
        remaining: spec.burst,
        cpuUsed: 0,
        ioStarted: spec.ioAfter === null,
        completion: 0,
        waiting: 0,
        response: null,
        readyEvents: [{ time: 0, seq: 0 }],
        cpu: [],
        io: [],
        done: false,
      },
    ]),
  );

  const ready: string[] = specs.map((spec) => spec.id);
  const io: Segment[] = [];
  const cpuSegments: Segment[] = [];
  const ioWindows: Segment[] = [];
  const idle: Segment[] = [];
  let now = 0;
  let guard = 0;
  let enqueueSeq = 1;

  const dispatch = (pid: string, start: number, slice: number) => {
    const proc = live.get(pid)!;
    proc.waiting += start - lastAtOrBefore(proc.readyEvents.map((event) => event.time), start);
    if (proc.response === null) proc.response = start;

    const end = start + slice;
    const range = { start, end };
    proc.cpu.push(range);
    proc.remaining = Math.max(0, proc.remaining - slice);
    proc.cpuUsed += slice;
    now = end;
    cpuSegments.push({ kind: 'cpu', pid, start, end });
  };

  const beginIo = (pid: string, start: number) => {
    const proc = live.get(pid)!;
    proc.ioStarted = true;
    const range: Segment = {
      kind: 'io',
      pid,
      start,
      end: start + proc.spec.ioDuration,
    };
    proc.io.push({ start: range.start, end: range.end });
    io.push(range);
    ioWindows.push(range);
  };

  while (true) {
    guard += 1;
    if (guard > 20000) throw new Error('Scheduler simulation did not terminate');

    // Processes whose I/O has completed become runnable before the next
    // choice. Walk forward so simultaneous wake-ups keep I/O start order.
    for (let index = 0; index < io.length; ) {
      const window = io[index];
      if (window.end <= now + EPS) {
        const proc = live.get(window.pid!)!;
        proc.readyEvents.push({ time: window.end, seq: enqueueSeq++ });
        ready.push(window.pid!);
        io.splice(index, 1);
      } else {
        index += 1;
      }
    }

    if (ready.length === 0) {
      if (io.length === 0) break;
      const next = Math.min(...io.map((window) => window.end));
      idle.push({ kind: 'idle', pid: null, start: now, end: next });
      now = next;
      continue;
    }

    let pid: string;
    if (algorithm === 'sjf') {
      pid = ready.reduce((best, candidate) => {
        const a = live.get(candidate)!;
        const b = live.get(best)!;
        if (a.remaining < b.remaining - EPS) return candidate;
        if (Math.abs(a.remaining - b.remaining) <= EPS) {
          return orderOf.get(candidate)! < orderOf.get(best)! ? candidate : best;
        }
        return best;
      }, ready[0]);
    } else {
      pid = ready[0];
    }

    const proc = live.get(pid)!;
    const start = now;
    ready.splice(ready.indexOf(pid), 1);

    let slice = algorithm === 'rr' ? quantum : proc.remaining;
    if (!proc.ioStarted && proc.spec.ioAfter !== null) {
      slice = Math.min(slice, proc.spec.ioAfter - proc.cpuUsed);
    }
    slice = Math.min(slice, proc.remaining);

    if (slice <= EPS) {
      // The I/O threshold was reached exactly at the previous boundary.
      beginIo(pid, now);
      continue;
    }

    dispatch(pid, start, slice);

    // I/O that completed during this slice is queued before the running
    // process changes state, preserving arrival order at the same instant.
    for (let index = 0; index < io.length; ) {
      const window = io[index];
      if (window.end <= now + EPS) {
        const waiting = live.get(window.pid!)!;
        waiting.readyEvents.push({ time: window.end, seq: enqueueSeq++ });
        ready.push(window.pid!);
        io.splice(index, 1);
      } else {
        index += 1;
      }
    }

    if (proc.remaining <= EPS) {
      proc.done = true;
      proc.completion = now;
    } else if (
      !proc.ioStarted &&
      proc.spec.ioAfter !== null &&
      proc.cpuUsed >= proc.spec.ioAfter - EPS
    ) {
      beginIo(pid, now);
    } else {
      proc.readyEvents.push({ time: now, seq: enqueueSeq++ });
      ready.push(pid);
    }
  }

  const results: ProcessResult[] = specs.map((spec) => {
    const proc = live.get(spec.id)!;
    const cpu = proc.cpu;
    const ioRanges = proc.io;
    const completion = proc.completion;
    const cpuTime = cpu.reduce((sum, range) => sum + (range.end - range.start), 0);
    const ioTime = ioRanges.reduce((sum, range) => sum + (range.end - range.start), 0);
    return {
      spec: proc.spec,
      completion,
      turnaround: completion,
      waiting: proc.waiting,
      response: proc.response ?? completion,
      cpu,
      io: ioRanges,
      readyEvents: proc.readyEvents,
      cpuTime,
      ioTime,
    };
  });

  const total = Math.max(...results.map((result) => result.completion), 0);
  const busy = results.reduce((sum, result) => sum + result.cpuTime, 0);

  return {
    algorithm,
    quantum,
    processes: results,
    cpuSegments,
    ioWindows,
    segments: [...cpuSegments, ...ioWindows, ...idle].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      const rank = { cpu: 0, idle: 1, io: 2 } as const;
      return rank[a.kind] - rank[b.kind];
    }),
    total,
    utilization: total > 0 ? busy / total : 0,
    dispatches: cpuSegments.length,
  };
}

/** Immutable projection of the schedule at `time` — the HUD and the 3D scene read this. */
export function snapshotAt(schedule: Schedule, time: number): Snapshot {
  const t = Math.max(0, Math.min(time, schedule.total));
  const ready: string[] = [];
  const waiting: string[] = [];
  const done: string[] = [];
  const remaining: Record<string, number> = {};
  const ioRemaining: Record<string, number> = {};
  let running: string | null = null;
  let current: Segment | null = null;
  let runProgress = 0;

  for (const result of schedule.processes) {
    const id = result.spec.id;
    const finished = t >= result.completion - EPS;
    const ioRange = result.io.find((range) => t >= range.start - EPS && t < range.end - EPS);
    const cpuRange = result.cpu.find((range) => t >= range.start - EPS && t < range.end - EPS);

    if (finished) done.push(id);
    else if (ioRange) waiting.push(id);
    else if (cpuRange && running === null) {
      running = id;
      current = {
        kind: 'cpu',
        pid: id,
        start: cpuRange.start,
        end: cpuRange.end,
      };
      runProgress = Math.max(
        0,
        Math.min(1, (t - cpuRange.start) / (cpuRange.end - cpuRange.start)),
      );
    } else ready.push(id);

    remaining[id] = Math.max(0, result.spec.burst - consumed(result.cpu, t));
    ioRemaining[id] = ioRange ? Math.max(0, ioRange.end - t) : 0;
  }

  const arrival = new Map<string, ReadyEvent>();
  for (const result of schedule.processes) {
    let latest = result.readyEvents[0] ?? { time: 0, seq: 0 };
    for (const event of result.readyEvents) {
      if (event.time <= t + EPS) latest = event;
      else break;
    }
    arrival.set(result.spec.id, latest);
  }

  ready.sort((a, b) => {
    const at = arrival.get(a)!;
    const bt = arrival.get(b)!;
    if (Math.abs(at.time - bt.time) > EPS) return at.time - bt.time;
    return at.seq - bt.seq;
  });
  waiting.sort((a, b) => {
    const at = schedule.processes.find((result) => result.spec.id === a)!.io[0]?.start ?? 0;
    const bt = schedule.processes.find((result) => result.spec.id === b)!.io[0]?.start ?? 0;
    return at - bt;
  });
  done.sort((a, b) => {
    const at = schedule.processes.find((result) => result.spec.id === a)!.completion;
    const bt = schedule.processes.find((result) => result.spec.id === b)!.completion;
    return at - bt;
  });

  if (running === null) current = null;

  return {
    time: t,
    running,
    ready,
    waiting,
    done,
    remaining,
    ioRemaining,
    runProgress,
    current,
    completed: done.length,
  };
}

export function averageMetrics(schedule: Schedule): { waiting: number; turnaround: number } {
  if (schedule.processes.length === 0) return { waiting: 0, turnaround: 0 };
  const count = schedule.processes.length;
  return {
    waiting: schedule.processes.reduce((sum, process) => sum + process.waiting, 0) / count,
    turnaround:
      schedule.processes.reduce((sum, process) => sum + process.turnaround, 0) / count,
  };
}

export function formatUnits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}