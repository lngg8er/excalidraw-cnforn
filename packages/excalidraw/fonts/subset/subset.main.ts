import { promiseTry } from "../../utils";
import { WorkerPool } from "../../workers";
import type { Commands } from "./subset.shared";

// lazy-loaded and cached chunks
let subsetWorker: Promise<typeof import("./subset.worker")> | null = null;
let subsetShared: Promise<typeof import("./subset.shared")> | null = null;

const lazyLoadWorkerSubsetChunk = async () => {
  if (!subsetWorker) {
    subsetWorker = import("./subset.worker");
  }

  return subsetWorker;
};

const lazyLoadSharedSubsetChunk = async () => {
  if (!subsetShared) {
    // load dynamically to force create a shared chunk reused between main thread and the worker thread
    subsetShared = import("./subset.shared");
  }

  return subsetShared;
};

// TODO_CHINESE: consider having this configurable (i.e. in case someone bundles whole thing into one chunk, including the worker code, it likely won't work)
let shouldUseWorkers = typeof Worker !== "undefined";

// TODO: could be extended with multiple commands in the future
type SubsetWorkerData = {
  command: typeof Commands.Subset;
  arrayBuffer: ArrayBuffer;
};

type SubsetWorkerResult<T extends SubsetWorkerData["command"]> =
  T extends typeof Commands.Subset ? ArrayBuffer : never;

let workerPool: Promise<
  WorkerPool<SubsetWorkerData, SubsetWorkerResult<SubsetWorkerData["command"]>>
> | null = null;

const getOrCreateWorkerPool = (codePoints: Array<number>) => {
  if (!workerPool) {
    // immediate concurrent-friendly return, to ensure we have only one pool instance
    workerPool = new Promise(async (resolve, reject) => {
      try {
        const { WorkerUrl } = await lazyLoadWorkerSubsetChunk();
        const { Commands } = await lazyLoadSharedSubsetChunk();

        const pool = new WorkerPool<
          SubsetWorkerData,
          SubsetWorkerResult<SubsetWorkerData["command"]>
        >(WorkerUrl, {
          initWorker: (worker: Worker) => {
            // initialize the newly created worker with codepoints
            worker.postMessage({ command: Commands.Init, codePoints });
          },
        });

        resolve(pool);
      } catch (e) {
        // we failed during worker pool initialization, fallback to main thread
        shouldUseWorkers = false;
        reject(e);
      }
    });
  }

  return workerPool;
};

/**
 * Tries to subset glyphs in a font based on the used codepoints, returning the font as daturl.
 * Under the hood utilizes worker threads (Web Workers, if available), otherwise fallbacks to the main thread.
 *
 * @param arrayBuffer font data buffer, preferrably in the woff2 format, though others should work as well
 * @param codePoints codepoints used to subset the glyphs
 *
 * @returns font with subsetted glyphs (all glyphs in case of errors) converted into a dataurl
 */
export const subsetWoff2GlyphsByCodepoints = async (
  arrayBuffer: ArrayBuffer,
  codePoints: Array<number>,
): Promise<string> => {
  const { Commands, subsetToBase64, toBase64 } =
    await lazyLoadSharedSubsetChunk();

  if (shouldUseWorkers) {
    return promiseTry(async () => {
      try {
        // lazy initialize or get the worker pool singleton
        const workerPool = await getOrCreateWorkerPool(codePoints);
        // copy the buffer to avoid working on top of the detached array buffer in the fallback
        // i.e. in case the worker throws, the array buffer does not get automatically detached, even if the worker is terminated
        const arrayBufferCopy = arrayBuffer.slice(0);
        // takes idle worker from the pool or creates a new one
        const result = await workerPool.postMessage(
          {
            command: Commands.Subset,
            arrayBuffer: arrayBufferCopy,
          } as const,
          { transfer: [arrayBufferCopy] },
        );

        // encode on the main thread to avoid copying large binary strings (as dataurl) between threads
        return toBase64(result);
      } catch (e) {
        // don't use workers if they are failing
        shouldUseWorkers = false;
        // eslint-disable-next-line no-console
        console.debug(
          "Failed to use workers for subsetting, falling back to the main thread.",
          e,
        );

        // fallback to the main thread
        return subsetToBase64(arrayBuffer, codePoints);
      }
    });
  }

  return subsetToBase64(arrayBuffer, codePoints);
};
