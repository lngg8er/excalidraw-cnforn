import { SyncableExcalidrawElement } from "../../../Desktop/excalidraw-0.17.3-fork-b1/excalidraw-app/data";
import { ExcalidrawElement, FileId } from "../../../Desktop/excalidraw-0.17.3-fork-b1/src/element/types";
import { AppState, BinaryFileData } from "../../../Desktop/excalidraw-0.17.3-fork-b1/src/types";
import Portal from "../../../Desktop/excalidraw-0.17.3-fork-b1/excalidraw-app/collab/Portal";

export interface StorageBackend {
  isSaved: (portal: Portal, elements: readonly ExcalidrawElement[]) => boolean;
  saveToStorageBackend: (
    portal: Portal,
    elements: readonly SyncableExcalidrawElement[],
    appState: AppState,
  ) => Promise<false | { reconciledElements: any }>;
  loadFromStorageBackend: (
    roomId: string,
    roomKey: string,
    socket: SocketIOClient.Socket | null,
  ) => Promise<readonly ExcalidrawElement[] | null>;
  saveFilesToStorageBackend: ({
    prefix,
    files,
  }: {
    prefix: string;
    files: {
      id: FileId;
      buffer: Uint8Array;
    }[];
  }) => Promise<{
    savedFiles: Map<FileId, true>;
    erroredFiles: Map<FileId, true>;
  }>;
  loadFilesFromStorageBackend: (
    prefix: string,
    decryptionKey: string,
    filesIds: readonly FileId[],
  ) => Promise<{
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  }>;
}

export interface StoredScene {
  sceneVersion: number;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}
