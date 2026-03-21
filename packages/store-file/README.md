# @ai-employee-sdk/store-file

File-based `MemoryStore` for the AI Employee SDK. Persists agent memory to NDJSON on disk. Zero dependencies beyond Node.js built-ins.

## Install

```bash
npm install @ai-employee-sdk/store-file @ai-employee-sdk/core
```

## Usage

```typescript
import { FileStore } from '@ai-employee-sdk/store-file';
import { EmployeeAgent } from '@ai-employee-sdk/core';

const store = new FileStore({ dir: '.ai-employee' }); // default dir

// Use directly
await store.set('memory:user-name', 'Alice');
await store.set('memory:timezone', 'UTC+5', 60_000); // 60s TTL
const name = await store.get<string>('memory:user-name'); // 'Alice'
const keys = await store.list('memory:');               // ['memory:user-name', 'memory:timezone']
await store.delete('memory:user-name');

// Pass to EmployeeAgent for automatic memory injection
const agent = new EmployeeAgent({
  model: myModel,
  memory: { store },
});
```

## Storage Format

Entries are appended as NDJSON lines (`store.ndjson`). Each line is a JSON object with `key`, `value`, `createdAt`, and optional `ttlMs`. Last-write wins for duplicate keys. Tombstones (from `delete()`) are also written as lines.

The file auto-compacts when it exceeds 1MB, removing expired entries and tombstones.

## Config

```typescript
new FileStore({
  dir?: string; // directory to write store.ndjson. Default: '.ai-employee'
})
```

## Methods

| Method | Description |
|--------|-------------|
| `get<T>(key)` | Returns value or `null` if missing/expired/deleted |
| `set<T>(key, value, ttlMs?)` | Appends entry; optional TTL in milliseconds |
| `list(prefix?)` | Returns live keys, optionally filtered by prefix |
| `delete(key)` | Appends a tombstone — key appears deleted on next read |
| `compact()` | Rewrites file keeping only live entries |
