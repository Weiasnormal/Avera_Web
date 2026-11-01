import type { Examination } from "@/types/examination";

// Where examinations are saved. Everything goes through ExaminationRepository, so
// moving to the backend means replacing the implementation at the bottom of this
// file. Until then, data stays in this browser's IndexedDB, keyed by user: see
// docs/examination/AUDIT.md for the approved storage exception and its risks.

export class ExaminationConflictError extends Error {
  constructor() {
    super("This examination was changed in another tab.");
    this.name = "ExaminationConflictError";
  }
}

export class ExaminationStorageError extends Error {
  constructor(message = "This browser could not save your examination.") {
    super(message);
    this.name = "ExaminationStorageError";
  }
}

export interface ExaminationRepository {
  list(userId: string): Promise<Examination[]>;
  get(userId: string, id: string): Promise<Examination | null>;
  /** Rejects with ExaminationConflictError when examination.version is stale. */
  save(userId: string, examination: Examination): Promise<Examination>;
  remove(userId: string, id: string): Promise<void>;
  putImage(userId: string, examinationId: string, imageId: string, blob: Blob): Promise<void>;
  getImage(userId: string, imageId: string): Promise<Blob | null>;
  removeImage(userId: string, imageId: string): Promise<void>;
}

const DB_NAME = "avera-examinations";
const DB_VERSION = 1;
const EXAMINATIONS = "examinations";
const IMAGES = "images";

type StoredExamination = Examination & { userId: string };

interface StoredImage {
  id: string;
  userId: string;
  examinationId: string;
  blob: Blob;
}

let connection: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new ExaminationStorageError("This browser does not support saving examinations."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(EXAMINATIONS, { keyPath: "id" }).createIndex("userId", "userId");
      db.createObjectStore(IMAGES, { keyPath: "id" }).createIndex("examinationId", "examinationId");
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let a future version upgrade in another tab proceed.
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(new ExaminationStorageError());
    request.onblocked = () => reject(new ExaminationStorageError("Close other Avera tabs and try again."));
  });
  connection.catch(() => {
    connection = null;
  });
  return connection;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new ExaminationStorageError());
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new ExaminationStorageError());
    transaction.onabort = () => reject(transaction.error ?? new ExaminationStorageError());
  });
}

function storageFailure(error: unknown): Error {
  if (error instanceof ExaminationConflictError || error instanceof ExaminationStorageError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new ExaminationStorageError("This device is out of storage space. Free up space, then try again.");
  }
  return new ExaminationStorageError();
}

function withoutOwner(record: StoredExamination): Examination {
  const examination: Examination & { userId?: string } = { ...record };
  delete examination.userId;
  return examination;
}

const indexedDbRepository: ExaminationRepository = {
  async list(userId) {
    try {
      const db = await openDatabase();
      const store = db.transaction(EXAMINATIONS).objectStore(EXAMINATIONS);
      const records = await result<StoredExamination[]>(store.index("userId").getAll(userId));
      return records.map(withoutOwner).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async get(userId, id) {
    try {
      const db = await openDatabase();
      const record = await result<StoredExamination | undefined>(db.transaction(EXAMINATIONS).objectStore(EXAMINATIONS).get(id));
      return record && record.userId === userId ? withoutOwner(record) : null;
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async save(userId, examination) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(EXAMINATIONS, "readwrite");
      const finished = completed(transaction);
      const store = transaction.objectStore(EXAMINATIONS);
      const existing = await result<StoredExamination | undefined>(store.get(examination.id));
      const isStale = existing ? existing.userId !== userId || existing.version !== examination.version : examination.version !== 0;
      if (isStale) {
        transaction.abort();
        await finished.catch(() => undefined);
        throw new ExaminationConflictError();
      }
      const saved: Examination = { ...examination, version: examination.version + 1, updatedAt: new Date().toISOString() };
      store.put({ ...saved, userId } satisfies StoredExamination);
      await finished;
      return saved;
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async remove(userId, id) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction([EXAMINATIONS, IMAGES], "readwrite");
      const finished = completed(transaction);
      const examinations = transaction.objectStore(EXAMINATIONS);
      const images = transaction.objectStore(IMAGES);
      const existing = await result<StoredExamination | undefined>(examinations.get(id));
      if (existing?.userId === userId) {
        examinations.delete(id);
        const keys = await result(images.index("examinationId").getAllKeys(id));
        keys.forEach((key) => images.delete(key));
      }
      await finished;
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async putImage(userId, examinationId, imageId, blob) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(IMAGES, "readwrite");
      const finished = completed(transaction);
      transaction.objectStore(IMAGES).put({ id: imageId, userId, examinationId, blob } satisfies StoredImage);
      await finished;
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async getImage(userId, imageId) {
    try {
      const db = await openDatabase();
      const record = await result<StoredImage | undefined>(db.transaction(IMAGES).objectStore(IMAGES).get(imageId));
      return record && record.userId === userId ? record.blob : null;
    } catch (error) {
      throw storageFailure(error);
    }
  },

  async removeImage(userId, imageId) {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(IMAGES, "readwrite");
      const finished = completed(transaction);
      const store = transaction.objectStore(IMAGES);
      const record = await result<StoredImage | undefined>(store.get(imageId));
      if (record?.userId === userId) store.delete(imageId);
      await finished;
    } catch (error) {
      throw storageFailure(error);
    }
  },
};

export const examinationRepository: ExaminationRepository = indexedDbRepository;
