<img src="https://i.ibb.co/C1vZ1j9/nope-db.png" alt="nope.db" />

[![nope.db](https://img.shields.io/badge/nope-db-red.svg)](https://www.npmjs.org/package/nope.db)
[![npm version](https://img.shields.io/npm/v/nope.db.svg?style=flat-square)](https://www.npmjs.org/package/nope.db)
[![npm downloads](https://img.shields.io/npm/dm/nope.db.svg?style=flat-square)](http://npm-stat.com/charts.html?package=nope.db)
[![install size](https://packagephobia.now.sh/badge?p=nope.db)](https://packagephobia.now.sh/result?p=nope.db)
[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/nopeion/nope.db/blob/main/LICENSE)

> A modern, simple, and asynchronous JSON database for Node.js. Zero dependencies, dual-module (ESM/CJS) support, and a same-process queueing system with atomic file replacement to reduce data corruption risk.

<hr>

# Features

- **Asynchronous:** All methods are Promise-based (`async/await`).
- **Data Safe for same-process use:** Uses a file-level write queue and atomic file replacement to protect concurrent writes from one or more `NopeDB` instances in the same Node.js process.
- **Dual Module:** Supports both ES Modules (`import`) and CommonJS (`require`).
- **Zero Dependencies:** Lightweight and clean.
- **Nested Data:** Access and manage nested objects with ease using a separator (e.g., `user.settings.theme`).

<hr>

# Data Safety and Limits

nope.db is designed for small to medium JSON datasets and single-process Node.js apps.

- Operations targeting the same file are serialized inside the current Node.js process.
- Writes use temporary files and atomic replacement to reduce the chance of partial JSON files.
- Multi-process writes to the same file are not supported.
- Every operation reads and writes the full JSON file, so very large files or high-frequency writes will become slower over time.

For large datasets, multi-process workloads, or heavy write traffic, use a server database or an embedded database built for that workload.

<hr>

# Installation

```console
$ npm install nope.db
```

# Getting Started

All database operations are asynchronous and return a `Promise`.

### ES Modules (`import`)

```javascript
import { NopeDB } from 'nope.db';

// All settings are optional
const db = new NopeDB({
  path: './mydb.json', // defaults to './db.json'
  spaces: 2,          // defaults to 2 (for JSON formatting)
  separator: '.'      // defaults to '.'
});

async function main() {
  try {
    await db.set('user.1', { name: 'nopeion', role: 'admin' });
    
    // This will be stored in 'mydb.json' as:
    // { 
    //   "user": { 
    //     "1": { "name": "nopeion", "role": "admin" } 
    //   } 
    // }

    const user = await db.get('user.1');
    console.log(user); // { name: 'nopeion', role: 'admin' }

    // Access nested properties using the separator
    const role = await db.get('user.1.role');
    console.log(role); // 'admin'
    
  } catch (error) {
    console.error("Database operation failed:", error);
  }
}

main();
```

### CommonJS (`require`)

```javascript
const { NopeDB } = require('nope.db');

const db = new NopeDB(); // Using all default settings

(async () => {
  try {
    await db.set('counter', 10);
    await db.add('counter', 5);
    const count = await db.get('counter');
    console.log(count); // 15
  } catch (error) {
    console.error("Database operation failed:", error);
  }
})();
```

<hr>

# API Reference

All methods are asynchronous and return a `Promise`.

### `new NopeDB(settings?)`

Creates a new database instance.

- **`settings`** (optional): An object with the following properties:
  - **`path`** (string): Path to the database file.
    - *Default:* `'./db.json'`
  - **`spaces`** (number): Number of spaces for JSON formatting.
    - *Default:* `2`
  - **`separator`** (string): Character to use for nested object access.
    - *Default:* `'.'`

---

### `set(id, value)`
Sets or updates an element in the database.
- **Returns:** `Promise<any>` - The value that was set.

---

### `get(id)`
Gets an element from the database.
- **Returns:** `Promise<any>` - The requested data, or `null` if not found.
- `null` can be stored as a valid value; use `has(id)` to distinguish stored `null` from a missing key.

---

### `add(id, value)`
Adds a number to an element. If the element doesn't exist, it will be created.
- **Returns:** `Promise<number>` - The total result.
- *Throws:* `DatabaseError` if the existing data or the value is not a number.

---

### `subtract(id, value)`
Subtracts a number from an element.
- **Returns:** `Promise<number>` - The remaining result.
- *Throws:* `DatabaseError` if the existing data or the value is not a number.

---

### `has(id)`
Checks if data exists in the database.
- **Returns:** `Promise<boolean>` - `true` or `false`.

---

### `push(id, value)`
Pushes an element into an array. If the array doesn't exist, it will be created.
- **Returns:** `Promise<any[]>` - The updated array.
- *Throws:* `DatabaseError` if the existing data is not an array.

---

### `delete(id)`
Deletes an element from the database.
- **Returns:** `Promise<boolean>` - `true` if deletion was successful, `false` if not found.

---

### `all()`
Returns all data in the database.
- **Returns:** `Promise<object>` - The complete database object.

---

### `clear(options)`
Clears all data in the database.
- **`options`** (object): Must be `{ confirm: true }` to prevent accidental deletion.
- **Returns:** `Promise<true>`
- *Throws:* `DatabaseError` if confirmation is not provided.

---

### `backup(filePath)`
Creates a backup of the current database to a new file.
- **`filePath`** (string): The full path for the backup file (e.g., `'./my-backup.json'`).
- **Returns:** `Promise<true>`

---

### `loadBackup(filePath)`
Loads data from a backup file, overwriting the current database.
- **`filePath`** (string): The full path of the backup file to load.
- **Returns:** `Promise<true>`

---

## Aliases

- **`fetch(id)`**: Alias for `get(id)`.
- **`remove(id)`**: Alias for `delete(id)`.
- **`reset(options)`**: Alias for `clear(options)`.

<hr>

# Author

**nopeion**

- GitHub: [@nopeion](https://github.com/nopeion)
- Email: [nopeiondev@gmail.com](mailto:nopeiondev@gmail.com)
