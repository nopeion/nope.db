import fs from "fs/promises";
import path from "path";
import { DatabaseError } from "./error.js";

export interface ClearOptions {
    confirm: boolean;
}

interface StorageManagerSettings {
    file: string;
    spaces: number;
    separator: string;
}

interface FindResult {
    exists: boolean;
    value: any;
}

export class StorageManager {
    private file: string;
    private spaces: number;
    private separator: string;
    private queue: Promise<any>;
    private errors = {
        dataNotANumber: "Existing data for this ID is not of type 'number'.",
        mustBeANumber: "The provided value must be of type 'number'.",
        mustBeArray: "The existing data must be of type 'array'.",
        nonValidID: "Invalid ID. It cannot be empty, start/end with a separator, contain repeated separators, or use unsafe path segments.",
        undefinedID: "ID is undefined.",
        undefinedValue: "Value is undefined.",
        parseError: "Failed to parse database file. Check for corrupt JSON.",
        clearConfirm: "Accidental clear prevented. Must pass { confirm: true } to clear()."
    };

    constructor(settings: StorageManagerSettings) {
        this.file = settings.file;
        this.spaces = settings.spaces;
        this.separator = settings.separator;
        this.queue = Promise.resolve();

        this._enqueue(async () => {
            try {
                await fs.access(this.file);
            } catch (error: any) {
                if (error?.code === 'ENOENT') {
                    await this._write({});
                    return;
                }
                throw new DatabaseError(`Unable to access database file: ${error?.message ?? error}`);
            }
        });
    }

    private _enqueue<T>(task: () => Promise<T>): Promise<T> {
        const nextTask = this.queue.catch(() => { }).then(task);
        this.queue = nextTask;
        return nextTask;
    }

    private async _read(): Promise<any> {
        try {
            const data = await fs.readFile(this.file, "utf-8");
            return JSON.parse(data);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                await this._write({});
                return {};
            }
            if (error instanceof SyntaxError) {
                throw new DatabaseError(this.errors.parseError);
            }
            throw new DatabaseError(`Unable to read database file: ${error?.message ?? error}`);
        }
    }

    private async _write(data: any): Promise<void> {
        const dir = path.dirname(this.file);
        const base = path.basename(this.file);
        const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
        const tempFile = path.join(dir, `.${base}.${suffix}.tmp`);
        try {
            await fs.writeFile(tempFile, JSON.stringify(data, null, this.spaces));
            await fs.rename(tempFile, this.file);
        } catch (error) {
            await fs.rm(tempFile, { force: true });
            throw error;
        }
    }

    private _parsePath(id: string): string[] {
        if (typeof id !== 'string' || !id ||
            id.startsWith(this.separator) ||
            id.endsWith(this.separator) ||
            id.includes(this.separator + this.separator)) {
            throw new DatabaseError(this.errors.nonValidID);
        }
        const parts = id.split(this.separator);
        if (parts.some((part) => part === '__proto__' || part === 'constructor' || part === 'prototype')) {
            throw new DatabaseError(this.errors.nonValidID);
        }
        return parts;
    }

    private _find(data: any, id: string): FindResult {
        const parts = this._parsePath(id);
        let current = data;
        for (const part of parts) {
            if (typeof current !== 'object' || current === null) {
                return { exists: false, value: null };
            }
            if (!Object.prototype.hasOwnProperty.call(current, part)) {
                return { exists: false, value: null };
            }
            current = current[part];
        }
        return { exists: true, value: current };
    }

    private _findAndSet(data: any, id: string, value: any): any {
        const parts = this._parsePath(id);
        let current = data;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current[part] = value;
            } else {
                if (typeof current[part] !== 'object' || current[part] === null) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
        return data;
    }

    public set(id: string, value: any): Promise<any> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);
            if (value === undefined) throw new DatabaseError(this.errors.undefinedValue);

            let data = await this._read();
            this._findAndSet(data, id, value);
            await this._write(data);
            return value;
        });
    }

    public get(id: string): Promise<any> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);
            const data = await this._read();
            const result = this._find(data, id);
            return result.exists ? result.value : null;
        });
    }

    public add(id: string, value: number): Promise<number> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);
            if (value === undefined) throw new DatabaseError(this.errors.undefinedValue);
            if (typeof value !== "number") throw new DatabaseError(this.errors.mustBeANumber);

            let data = await this._read();
            const result = this._find(data, id);
            const currentVal = result.value;

            if (result.exists && typeof currentVal !== "number") {
                throw new DatabaseError(this.errors.dataNotANumber);
            }

            const newVal = (result.exists ? currentVal : 0) + value;
            this._findAndSet(data, id, newVal);
            await this._write(data);
            return newVal;
        });
    }

    public subtract(id: string, value: number): Promise<number> {
        if (typeof value !== "number") throw new DatabaseError(this.errors.mustBeANumber);
        return this.add(id, -value);
    }

    public all(): Promise<any> {
        return this._enqueue(() => this._read());
    }

    public has(id: string): Promise<boolean> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);
            const data = await this._read();
            return this._find(data, id).exists;
        });
    }

    public delete(id: string): Promise<boolean> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);

            let data = await this._read();
            const parts = this._parsePath(id);
            let current = data;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (typeof current !== 'object' || current === null) {
                    return false;
                }
                if (i === parts.length - 1) {
                    if (!Object.prototype.hasOwnProperty.call(current, part)) return false;
                    delete current[part];
                } else {
                    if (!Object.prototype.hasOwnProperty.call(current, part)) return false;
                    current = current[part];
                }
            }

            await this._write(data);
            return true;
        });
    }

    public clear(options: ClearOptions): Promise<true> {
        return this._enqueue(async (): Promise<true> => {
            if (options?.confirm !== true) {
                throw new DatabaseError(this.errors.clearConfirm);
            }
            await this._write({});
            return true;
        });
    }

    public push(id: string, value: any): Promise<any[]> {
        return this._enqueue(async () => {
            if (!id) throw new DatabaseError(this.errors.undefinedID);
            if (value === undefined) throw new DatabaseError(this.errors.undefinedValue);

            let data = await this._read();
            const result = this._find(data, id);
            let arr = result.value;

            if (!result.exists) {
                arr = [];
            } else if (!Array.isArray(arr)) {
                throw new DatabaseError(this.errors.mustBeArray);
            }

            arr.push(value);
            this._findAndSet(data, id, arr);
            await this._write(data);
            return arr;
        });
    }

    public backup(filePath: string): Promise<true> {
        return this._enqueue(async (): Promise<true> => {
            if (!filePath || typeof filePath !== 'string') {
                throw new DatabaseError("Invalid backup file path provided.");
            }
            if (!filePath.endsWith(".json")) {
                throw new DatabaseError("The backup file path must end with '.json'.");
            }
            const data = await this._read();
            await fs.writeFile(filePath, JSON.stringify(data, null, this.spaces));
            return true;
        });
    }

    public loadBackup(filePath: string): Promise<true> {
        return this._enqueue(async (): Promise<true> => {
            if (!filePath || typeof filePath !== 'string') {
                throw new DatabaseError("Invalid backup file path provided.");
            }

            let backupData: any;
            try {
                const data = await fs.readFile(filePath, "utf-8");
                backupData = JSON.parse(data);
            } catch (error) {
                throw new DatabaseError(`Failed to read or parse backup file: ${filePath}`);
            }

            await this._write(backupData);
            return true;
        });
    }
}
