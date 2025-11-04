import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface NopeDbModule {
    NopeDB: new (settings?: { path?: string; separator?: string; spaces?: number }) => {
        set(id: string, value: unknown): Promise<unknown>;
        get(id: string): Promise<unknown>;
        add(id: string, value: number): Promise<number>;
        subtract(id: string, value: number): Promise<number>;
        has(id: string): Promise<boolean>;
        push(id: string, value: unknown): Promise<unknown[]>;
        delete(id: string): Promise<boolean>;
        all(): Promise<Record<string, unknown>>;
        clear(options: { confirm: boolean }): Promise<true>;
        backup(filePath: string): Promise<true>;
        loadBackup(filePath: string): Promise<true>;
    };
}

const builds: { name: string; loader: () => Promise<NopeDbModule> }[] = [
    {
        name: 'MJS build',
        loader: () => import(new URL('../dist/mjs/app.js', import.meta.url).href) as Promise<NopeDbModule>,
    },
    {
        name: 'CJS build',
        loader: () => import(new URL('../dist/cjs/app.js', import.meta.url).href) as Promise<NopeDbModule>,
    }
];

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

const TEST_DB_PATH: string = path.join(__dirname, 'test-db.json');
const BACKUP_PATH: string = path.join(__dirname, 'test-db-backup.json');

async function cleanup(): Promise<void> {
    await Promise.all([
        fs.rm(TEST_DB_PATH, { force: true }),
        fs.rm(BACKUP_PATH, { force: true })
    ]);
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

        await t.test('push()', async () => {
            await db.set('items', ['a', 'b']);
            const newItems = await db.push('items', 'c');
            assert.deepEqual(newItems, ['a', 'b', 'c']);

            const newItems2 = await db.push('new_items', 'x');
            assert.deepEqual(newItems2, ['x']);
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
                db.set('concurrent_3', 3)
            ]);

            assert.equal(await db.get('concurrent_1'), 1);
            assert.equal(await db.get('concurrent_2'), 2);
            assert.equal(await db.get('concurrent_counter'), 1);
            const arr = await db.get('concurrent_array');
            assert.ok(Array.isArray(arr));
            assert.equal((arr as unknown[])[0], 'a');
        });

        await t.test('add() with non-numeric value', async () => {
            await db.set('non_numeric', 'hello');
            await assert.rejects(async () => db.add('non_numeric', 5), {
                name: 'nopedb',
            });
            const value = await db.get('non_numeric');
            assert.equal(value, 'hello');
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