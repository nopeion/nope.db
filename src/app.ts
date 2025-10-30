import { StorageManager, ClearOptions } from "./utils.js";
import { DatabaseError } from "./error.js";
import { existsSync, writeFileSync } from "fs";
import * as pathUtils from "path";

const PUNCTUATION_REGEX = new RegExp(/^[!"#%&'*,./?@^_|~-]$/);

export interface NopeDbSettings {
    path?: string;
    spaces?: number;
    separator?: string;
}

interface ResolvedNopeDbSettings {
    path: string;
    file: string;
    spaces: number;
    separator: string;
}

export class NopeDB {
    private settings: ResolvedNopeDbSettings;
    private storage: StorageManager;

    /**
     * Creates a new database instance or loads an existing one.
     * @param {NopeDbSettings} [settings] Database settings.
     * @throws {DatabaseError} Throws an error if the provided settings are invalid.
     */
    constructor(settings: NopeDbSettings = {}) {
        const defaultPath = pathUtils.join(process.cwd(), 'db.json');

        const path = settings.path ?? defaultPath;
        const spaces = settings.spaces ?? 2;
        const separator = settings.separator ?? '.';

        if (typeof path !== 'string')
            throw new DatabaseError("The 'path' setting must be a string.");
        if (!path.endsWith(".json"))
            throw new DatabaseError("The database 'path' must end with '.json'.");
        if (typeof spaces !== 'number' || spaces < 0)
            throw new DatabaseError("The 'spaces' setting must be a positive number.");
        if (typeof separator !== 'string')
            throw new DatabaseError("The 'separator' setting must be a string.");
        if (!PUNCTUATION_REGEX.test(separator))
            throw new DatabaseError("Invalid 'separator'. Must be a single punctuation character.");

        this.settings = {
            path: path,
            spaces: spaces,
            separator: separator,
            file: pathUtils.resolve(path)
        };

        this.storage = new StorageManager({
            file: this.settings.file,
            spaces: this.settings.spaces,
            separator: this.settings.separator,
        });

        if (!existsSync(this.settings.file)) {
            writeFileSync(this.settings.file, "{}");
        }
    }

    /**
     * Adds a value to an element in the database.
     * @returns {Promise<number>} The total result.
     */
    public add(id: string, value: number): Promise<number> {
        return this.storage.add(id, value);
    }

    /**
     * Returns all data in the database.
     * @returns {Promise<object>} All data.
     */
    public all(): Promise<object> {
        return this.storage.all();
    }

    /**
     * Clears all data in the database.
     * Requires a confirmation object to prevent accidental deletion.
     * @param {ClearOptions} options Must be { confirm: true }
     * @returns {Promise<true>}
     */
    public clear(options: ClearOptions): Promise<true> {
        return this.storage.clear(options);
    }

    /**
     * Deletes an element from the database.
     * @returns {Promise<boolean>} Indicates if the deletion was successful.
     */
    public delete(id: string): Promise<boolean> {
        return this.storage.delete(id);
    }

    /**
     * Gets an element from the database.
     * @returns {Promise<any>} The requested data.
     */
    public get(id: string): Promise<any> {
        return this.storage.get(id);
    }

    /**
     * Checks if data exists in the database.
     * @returns {Promise<boolean>} Indicates the presence of the data.
     */
    public has(id: string): Promise<boolean> {
        return this.storage.has(id);
    }

    /**
     * Pushes an element into an array in the database.
     * @returns {Promise<any[]>} The updated array.
     */
    public push(id: string, value: any): Promise<any[]> {
        return this.storage.push(id, value);
    }

    /**
     * Sets or updates an element in the database.
     * @returns {Promise<any>} The value that was set.
     */
    public set(id: string, value: any): Promise<any> {
        return this.storage.set(id, value);
    }

    /**
     * Subtracts a value from an element in the database.
     * @returns {Promise<number>} The remaining result.
     */
    public subtract(id: string, value: number): Promise<number> {
        return this.storage.subtract(id, value);
    }

    /**
     * Creates a backup of the current database to a new file.
     * @param {string} filePath The full path for the backup file (e.g., './my-backup.json').
     * @returns {Promise<true>}
     */
    public backup(filePath: string): Promise<true> {
        return this.storage.backup(filePath);
    }

    /**
     * Loads data from a backup file, overwriting the current database.
     * @param {string} filePath The full path of the backup file to load.
     * @returns {Promise<true>}
     */
    public loadBackup(filePath: string): Promise<true> {
        return this.storage.loadBackup(filePath);
    }

    // --- Aliases ---

    /**
     * Gets an element from the database (alias for get).
     * @returns {Promise<any>} The requested data.
     */
    public fetch(id: string): Promise<any> {
        return this.get(id);
    }

    /**
     * Deletes an element from the database (alias for delete).
     * @returns {Promise<boolean>} Indicates if the deletion was successful.
     */
    public remove(id: string): Promise<boolean> {
        return this.delete(id);
    }

    /**
     * Clears all data in the database (alias for clear).
     * Requires a confirmation object to prevent accidental deletion.
     * @param {ClearOptions} options Must be { confirm: true }
     * @returns {Promise<true>}
     */
    public reset(options: ClearOptions): Promise<true> {
        return this.clear(options);
    }
}