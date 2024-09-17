import { debounce } from "./utils";

type InitializeWorker = (worker: Worker) => void;

class IdleWorker extends Worker {
  constructor(workerUrl: URL) {
    super(workerUrl, { type: "module" });
  }

  /**
   * Use to prolong the worker's life by `workerTTL` or terminate it with a flush immediately.
   */
  public debounceTerminate!: ReturnType<typeof debounce>;
}

/**
 * Pool of idle short-lived workers.
 *
 * IMPORTANT: for simplicity it does not limit the number of newly created workers, leaving it up to the caller to manage the pool size.
 */
export class WorkerPool<T, R> {
  private idleWorkers: Set<IdleWorker> = new Set();
  private readonly workerUrl: URL;
  private readonly workerTTL: number;

  private readonly initWorker: InitializeWorker;

  constructor(
    workerUrl: URL,
    options: {
      initWorker: InitializeWorker;
      ttl?: number;
    },
  ) {
    this.workerUrl = workerUrl;
    // by default, active & idle workers will be terminated after 5 seconds of inactivity
    this.workerTTL = options.ttl || 5_000;

    this.initWorker = options.initWorker;
  }

  public async postMessage(
    data: T,
    options: StructuredSerializeOptions,
  ): Promise<R> {
    let worker: IdleWorker;

    const idleWorker = Array.from(this.idleWorkers).shift();
    if (idleWorker) {
      this.idleWorkers.delete(idleWorker);
      worker = idleWorker;
    } else {
      worker = await this.createWorker();
    }

    return new Promise((resolve, reject) => {
      worker.onmessage = this.onMessageHandler(worker, resolve);
      worker.onerror = this.onErrorHandler(worker, reject);

      worker.postMessage(data, options);
      worker.debounceTerminate(() =>
        reject(
          new Error(`Active worker did not respond for ${this.workerTTL}ms!`),
        ),
      );
    });
  }

  // TODO_CHINESE: use somewhere or delete
  public async clear() {
    for (const worker of this.idleWorkers) {
      worker.debounceTerminate.cancel();
      worker.terminate();
    }

    this.idleWorkers.clear();
  }

  /**
   * Used to get a worker from the pool or create a new one if there is no idle available.
   */
  private async createWorker(): Promise<IdleWorker> {
    const worker = new IdleWorker(this.workerUrl);

    worker.debounceTerminate = debounce((reject?: () => void) => {
      worker.terminate();

      if (this.idleWorkers.has(worker)) {
        this.idleWorkers.delete(worker);

        // eslint-disable-next-line no-console
        console.debug("Idle worker has been released from the pool.");
      } else if (reject) {
        reject();
      } else {
        console.error("Active worker has been terminated!");
      }
    }, this.workerTTL);

    this.initWorker(worker);

    return worker;
  }

  private onMessageHandler(worker: IdleWorker, resolve: (value: R) => void) {
    return (e: { data: R }) => {
      worker.debounceTerminate();
      this.idleWorkers.add(worker);
      resolve(e.data);
    };
  }

  private onErrorHandler(
    worker: IdleWorker,
    reject: (reason: ErrorEvent) => void,
  ) {
    return (e: ErrorEvent) => {
      // terminate the worker immediately before rejection
      worker.debounceTerminate(() => reject(e));
      worker.debounceTerminate.flush();
    };
  }
}
