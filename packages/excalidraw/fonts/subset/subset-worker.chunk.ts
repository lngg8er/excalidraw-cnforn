/**
 * DON'T depend on anything from the outside like `promiseTry`, as this module is part of a separate lazy-loaded chunk.
 *
 * Including anything from the main chunk would include the whole chunk by default.
 * Even it it would be tree-shaken during build, it won't be tree-shaken in dev.
 *
 * In the future consider separating common utils into a separate shared chunk.
 */

import { Commands, subsetToBinary } from "./subset-shared.chunk";

/**
 * Due to this export (and related dynamic import), this worker code will be included in the bundle automatically (as a separate chunk),
 * without the need for esbuild / vite /rollup plugins and special browser / server treatment.
 */
export const WorkerUrl = new URL(import.meta.url);

let cachedCodePoints: Array<number> | null = null;

// run only in the worker context
if (typeof window === "undefined" && typeof self !== "undefined") {
  self.onmessage = async (e: {
    data:
      | {
          command: typeof Commands.Init;
          codePoints: Array<number>;
        }
      | {
          command: typeof Commands.Subset;
          arrayBuffer: ArrayBuffer;
        };
  }) => {
    switch (e.data.command) {
      case Commands.Init:
        // init just once, to avoid structural copy on each message
        cachedCodePoints = e.data.codePoints;
        break;
      case Commands.Subset:
        if (!cachedCodePoints) {
          throw new Error("Worker was not initialized!");
        }

        const buffer = await subsetToBinary(
          e.data.arrayBuffer,
          cachedCodePoints,
        );

        self.postMessage(buffer, { transfer: [buffer] });
        break;
    }
  };
}
