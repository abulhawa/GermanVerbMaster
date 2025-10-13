type StorageError = { message?: string } | null;

export interface StubStorageObject {
  id: string | null;
  name: string;
  metadata: { size?: number } | null;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
}

type StorageResponse<T> = { data: T; error: StorageError };

type StorageBucketApi = {
  upload: (...args: unknown[]) => Promise<StorageResponse<{ path?: string } | null>>;
  list: (...args: unknown[]) => Promise<StorageResponse<StubStorageObject[]>>;
  remove: (...args: unknown[]) => Promise<StorageResponse<Array<{ path: string }>>>;
  download: (...args: unknown[]) => Promise<StorageResponse<{ text: () => Promise<string> }>>;
};

export type SupabaseClient = {
  from: (bucket: string) => StorageBucketApi;
  storage: {
    from: (bucket: string) => StorageBucketApi;
  };
};

function createBucketApi(): StorageBucketApi {
  return {
    upload: async () => ({ data: null, error: null }),
    list: async () => ({ data: [], error: null }),
    remove: async () => ({ data: [], error: null }),
    download: async () => ({ data: { text: async () => "" }, error: null }),
  };
}

export function createClient(..._args: unknown[]): SupabaseClient {
  return {
    from: () => createBucketApi(),
    storage: {
      from: () => createBucketApi(),
    },
  };
}

