import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

interface NopeDbModule {
    NopeDB: new (settings?: { path?: string; separator?: string; spaces?: number }) => {
        set(id: string, value: unknown): Promise<unknown>;
        get(id: string): Promise<unknown>;
        add(id: string, value: number): Promise<number>;
        subtract(id: string, value: number): Promise<number>;
        has(id: string): Promise<boolean>;
        push(id: string, ...values: unknown[]): Promise<unknown[]>;
        unshift(id: string, ...values: unknown[]): Promise<unknown[]>;
        pull(id: string, value: unknown): Promise<unknown[]>;
        keys(id?: string): Promise<string[]>;
        values(id?: string): Promise<unknown[]>;
        randomKey(id?: string): Promise<string | null>;
        delete(id: string): Promise<boolean>;
        all(): Promise<Record<string, unknown>>;
        clear(options: { confirm: boolean }): Promise<true>;
        backup(filePath: string): Promise<true>;
        loadBackup(filePath: string): Promise<true>;
    };
    DatabaseError: new (message?: string) => Error;
}

const builds: { name: string; loader: () => Promise<NopeDbModule> }[] = [
    {
        name: 'MJS build',
        loader: () => import(new URL('../dist/mjs/index.js', import.meta.url).href) as Promise<NopeDbModule>,
    },
    {
        name: 'CJS build',
        loader: () => import(new URL('../dist/cjs/index.js', import.meta.url).href) as Promise<NopeDbModule>,
    },
];

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

const TEST_DB_PATH: string = path.join(__dirname, 'test-db.json');
const BACKUP_PATH: string = path.join(__dirname, 'test-db-backup.json');

async function cleanup(): Promise<void> {
    await Promise.all([fs.rm(TEST_DB_PATH, { force: true }), fs.rm(BACKUP_PATH, { force: true })]);
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

for (const build of builds) {
    test(`${build.name}`, { concurrency: false }, async (t) => {
        await cleanup();

        const module = await build.loader();
        const NopeDB = module.NopeDB;
        const DatabaseError = module.DatabaseError;
        let db: ReturnType<typeof createDb>;

        function createDb() {
            return new NopeDB({ path: TEST_DB_PATH, separator: '_' });
        }

        t.beforeEach(async () => {
            await cleanup();
            db = createDb();
            await db.all();
        });

        t.afterEach(async () => {
            await cleanup();
        });

        t.after(async () => {
            await cleanup();
        });

        await t.test('set() & get()', async () => {
            await db.set('user_profile_name', 'nopeion');
            const name = await db.get('user_profile_name');
            assert.equal(name, 'nopeion');
        });

        await t.test('set() complex object', async () => {
            const user = { id: 1, type: 'admin', settings: { theme: 'dark' } };
            await db.set('user_1', user);
            const fetchedUser = await db.get('user_1');
            assert.deepEqual(fetchedUser, user);
        });

        await t.test('get() nested value', async () => {
            await db.set('user_1', { settings: { theme: 'dark' } });
            const theme = await db.get('user_1_settings_theme');
            assert.equal(theme, 'dark');
        });

        await t.test('add()', async () => {
            await db.set('counter', 10);
            const newCount = await db.add('counter', 5);
            assert.equal(newCount, 15);

            const newCount2 = await db.add('new_counter', 1);
            assert.equal(newCount2, 1);
        });

        await t.test('subtract()', async () => {
            await db.set('counter', 10);
            const newCount = await db.subtract('counter', 3);
            assert.equal(newCount, 7);
        });

        await t.test('has()', async () => {
            await db.set('user_1', { id: 1 });
            assert.equal(await db.has('user_1'), true);
            assert.equal(await db.has('fake_key'), false);
        });

        await t.test('null values are stored values', async () => {
            await db.set('nullable', null);
            assert.equal(await db.get('nullable'), null);
            assert.equal(await db.has('nullable'), true);
            assert.equal(await db.get('missing_nullable'), null);
            assert.equal(await db.has('missing_nullable'), false);
        });

        await t.test('push()', async () => {
            await db.set('items', ['a', 'b']);
            const newItems = await db.push('items', 'c');
            assert.deepEqual(newItems, ['a', 'b', 'c']);

            const newItems2 = await db.push('new_items', 'x');
            assert.deepEqual(newItems2, ['x']);
        });

        await t.test('push() variadic', async () => {
            await db.push('items', 'a', 'b', 'c');
            assert.deepEqual(await db.get('items'), ['a', 'b', 'c']);
        });

        await t.test('unshift()', async () => {
            await db.push('items', 'b', 'c');
            const newItems = await db.unshift('items', 'a');
            assert.deepEqual(newItems, ['a', 'b', 'c']);

            const newItems2 = await db.unshift('fresh_items', 'x', 'y');
            assert.deepEqual(newItems2, ['x', 'y']);
        });

        await t.test('pull()', async () => {
            await db.push('items', 'a', 'b', 'a', 'c');
            const newItems = await db.pull('items', 'a');
            assert.deepEqual(newItems, ['b', 'c']);

            const missing = await db.pull('missing_items', 'x');
            assert.deepEqual(missing, []);
            assert.equal(await db.has('missing_items'), false);
        });

        await t.test('keys() & values()', async () => {
            await db.set('user_1', { name: 'nopeion', role: 'admin' });
            const keys = await db.keys('user_1');
            assert.deepEqual(keys.sort(), ['name', 'role']);
            const values = await db.values('user_1');
            assert.deepEqual(values.sort(), ['admin', 'nopeion']);

            assert.deepEqual(await db.keys('missing_key'), []);
            assert.deepEqual(await db.values('missing_key'), []);

            await db.set('topLevel', 1);
            const rootKeys = await db.keys();
            assert.ok(rootKeys.includes('topLevel'));
        });

        await t.test('randomKey()', async () => {
            await db.set('key1', 1);
            await db.set('key2', 2);
            await db.set('key3', 3);

            const random = await db.randomKey();
            assert.ok(['key1', 'key2', 'key3'].includes(random as string));

            await db.set('obj', { nested_a: 1, nested_b: 2 });
            const nestedRandom = await db.randomKey('obj');
            assert.ok(['nested_a', 'nested_b'].includes(nestedRandom as string));

            assert.equal(await db.randomKey('missing_key'), null);
        });

        await t.test('delete()', async () => {
            await db.set('user_profile_name', 'nopeion');
            const deleted = await db.delete('user_profile_name');
            assert.equal(deleted, true);
            const value = await db.get('user_profile_name');
            assert.equal(value, null);
        });

        await t.test('all()', async () => {
            await db.set('counter', 12);
            await db.set('user_1', { id: 1, settings: { theme: 'dark' } });
            const allData = await db.all();
            assert.equal(typeof allData, 'object');
            assert.equal((allData as any).counter, 12);
            assert.equal(((allData as any).user as any)['1'].settings.theme, 'dark');
        });

        await t.test('clear()', async () => {
            await db.set('to_clear', 'value');
            await db.clear({ confirm: true });
            const allData = await db.all();
            assert.equal(Object.keys(allData).length, 0);
        });

        await t.test('backup() and restore', async () => {
            await db.set('key1', 'value1');
            await db.set('key2', { nested: true });

            await db.backup(BACKUP_PATH);
            assert.equal(await fileExists(BACKUP_PATH), true);

            await db.clear({ confirm: true });
            const allData = await db.all();
            assert.equal(Object.keys(allData).length, 0);

            const restoreDb = createDb();
            await restoreDb.loadBackup(BACKUP_PATH);

            const val1 = await restoreDb.get('key1');
            const val2 = await restoreDb.get('key2_nested');
            assert.equal(val1, 'value1');
            assert.equal(val2, true);
        });

        await t.test('Concurrent writes (Queue)', async () => {
            await Promise.all([
                db.set('concurrent_1', 1),
                db.set('concurrent_2', 2),
                db.add('concurrent_counter', 1),
                db.push('concurrent_array', 'a'),
                db.set('concurrent_3', 3),
            ]);

            assert.equal(await db.get('concurrent_1'), 1);
            assert.equal(await db.get('concurrent_2'), 2);
            assert.equal(await db.get('concurrent_counter'), 1);
            const arr = await db.get('concurrent_array');
            assert.ok(Array.isArray(arr));
            assert.equal((arr as unknown[])[0], 'a');
        });

        await t.test('Concurrent writes across same-process instances', async () => {
            const firstDb = createDb();
            const secondDb = createDb();
            await Promise.all([firstDb.all(), secondDb.all()]);

            await Promise.all(
                Array.from({ length: 100 }, (_, index) =>
                    (index % 2 === 0 ? firstDb : secondDb).add('shared_counter', 1),
                ),
            );

            assert.equal(await firstDb.get('shared_counter'), 100);
        });

        await t.test('add() with non-numeric value', async () => {
            await db.set('non_numeric', 'hello');
            await assert.rejects(async () => db.add('non_numeric', 5), {
                name: 'DatabaseError',
            });
            const value = await db.get('non_numeric');
            assert.equal(value, 'hello');
        });

        await t.test('add() rejects NaN and Infinity', async () => {
            await assert.rejects(async () => db.add('counter', Number.NaN), {
                name: 'DatabaseError',
            });
            await assert.rejects(async () => db.add('counter', Number.POSITIVE_INFINITY), {
                name: 'DatabaseError',
            });
            await assert.rejects(async () => db.subtract('counter', Number.NaN), {
                name: 'DatabaseError',
            });
        });

        await t.test('DatabaseError is exported and instanceof works', async () => {
            assert.equal(typeof DatabaseError, 'function');
            const error = new DatabaseError('test');
            assert.equal(error.name, 'DatabaseError');
            assert.equal(error.message, 'test');
        });

        await t.test('invalid path segments are rejected consistently', async () => {
            for (const invalidId of ['_bad', 'bad_', 'bad__id', 'safe___bad']) {
                await assert.rejects(async () => db.get(invalidId), { name: 'DatabaseError' });
                await assert.rejects(async () => db.delete(invalidId), { name: 'DatabaseError' });
            }
        });

        await t.test('unsafe prototype path segments are rejected', async () => {
            const dotDb = new NopeDB({ path: TEST_DB_PATH });
            await dotDb.all();

            for (const unsafeId of ['__proto__.polluted', 'constructor.polluted', 'prototype.polluted']) {
                await assert.rejects(async () => dotDb.set(unsafeId, true), { name: 'DatabaseError' });
                await assert.rejects(async () => dotDb.get(unsafeId), { name: 'DatabaseError' });
                await assert.rejects(async () => dotDb.delete(unsafeId), { name: 'DatabaseError' });
            }

            assert.equal(({} as Record<string, unknown>).polluted, undefined);
        });

        await t.test('Corrupted JSON file', async () => {
            await fs.writeFile(TEST_DB_PATH, '{"key": "value",');
            const corruptDb = createDb();
            await assert.rejects(async () => corruptDb.get('any'), {
                message: 'Failed to parse database file. Check for corrupt JSON.',
            });
        });
    });
}
