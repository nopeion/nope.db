import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const importType = process.argv[2] || 'mjs';

console.log(`Running tests for ${importType.toUpperCase()} build...`);

// Dynamically import the correct build (CJS or MJS)
// We use 'any' as the type because we are dynamically importing.
let NopeDB: any;
if (importType === 'cjs') {
    NopeDB = (await import('../dist/cjs/app.js')).NopeDB;
} else {
    NopeDB = (await import('../dist/mjs/app.js')).NopeDB;
}

// Define __dirname manually in ESM
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// Define paths for the test database and backup file
const TEST_DB_PATH: string = path.join(__dirname, 'test-db.json');
const BACKUP_PATH: string = path.join(__dirname, 'test-db-backup.json');

const tests: { name: string, fn: () => Promise<void> }[] = [];
let failedTests: { name: string, error: Error }[] = [];

/**
 * Asserts a condition. Throws an error if the condition is false.
 * @param {boolean} condition The condition to check.
 * @param {string} message The error message if assertion fails.
 */
async function assert(condition: boolean, message: string): Promise<void> {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Adds a test to the queue.
 * @param {string} name The name of the test.
 * @param {Function} fn The async test function to execute.
 */
function test(name: string, fn: () => Promise<void>): void {
    tests.push({ name, fn });
}

/**
 * Runs all queued tests and provides a summary.
 */
async function runAllTests() {
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`  [PASS] ${t.name}`);
        } catch (error) {
            failedTests.push({ name: t.name, error: error as Error });
            console.log(`  [FAIL] ${t.name}`);
        }
    }

    console.log("\n--------------------\n");

    if (failedTests.length === 0) {
        console.log(`All ${tests.length} tests passed successfully!`);
    } else {
        console.error(`${failedTests.length} of ${tests.length} tests failed.\n`);
        for (const failure of failedTests) {
            console.error(`[FAILED] ${failure.name}`);
            console.error(failure.error);
            console.error(""); // Add a newline for readability
        }
        process.exit(1); // Exit with a failure code
    }
}

/**
 * Deletes any leftover test files (DB and backup).
 */
async function cleanup(): Promise<void> {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(BACKUP_PATH)) fs.unlinkSync(BACKUP_PATH);
}

/**
 * Main test runner. Executes all tests in sequence.
 */
(async () => {
    console.log("Starting nope.db tests...\n");
    await cleanup(); // Clean up old files before starting

    const db = new NopeDB({
        path: TEST_DB_PATH,
        separator: '_' // Set separator to '_' for nested tests
    });

    test("set() & get()", async () => {
        await db.set('user_profile_name', 'nopeion');
        const name = await db.get('user_profile_name');
        await assert(name === 'nopeion', `Expected 'nopeion', got '${name}'`);
    });

    test("set() complex object", async () => {
        const user = { id: 1, type: 'admin', settings: { theme: 'dark' } };
        await db.set('user_1', user);
        const fetchedUser = await db.get('user_1');
        await assert(fetchedUser.id === 1, "User ID mismatch");
        await assert(fetchedUser.settings.theme === 'dark', "User theme mismatch");
    });

    test("get() nested value", async () => {
        const theme = await db.get('user_1_settings_theme');
        await assert(theme === 'dark', `Expected 'dark', got '${theme}'`);
    });

    test("add()", async () => {
        await db.set('counter', 10);
        const newCount = await db.add('counter', 5);
        await assert(newCount === 15, `Expected 15, got '${newCount}'`);
        const newCount2 = await db.add('new_counter', 1);
        await assert(newCount2 === 1, `Expected 1, got '${newCount2}'`);
    });

    test("subtract()", async () => {
        const newCount = await db.subtract('counter', 3);
        await assert(newCount === 12, `Expected 12, got '${newCount}'`);
    });

    test("has()", async () => {
        const hasUser = await db.has('user_1');
        await assert(hasUser === true, "Expected 'user_1' to exist");
        const hasFake = await db.has('fake_key');
        await assert(hasFake === false, "Expected 'fake_key' to not exist");
    });

    test("push()", async () => {
        await db.set('items', ['a', 'b']);
        const newItems = await db.push('items', 'c');
        await assert(newItems.length === 3 && newItems[2] === 'c', "Push failed");
        const newItems2 = await db.push('new_items', 'x');
        await assert(newItems2.length === 1 && newItems2[0] === 'x', "Push to new array failed");
    });

    test("delete()", async () => {
        await db.delete('user_profile_name');
        const name = await db.get('user_profile_name');
        await assert(name === null, "Key should be deleted and return null");
    });

    test("all()", async () => {
        const allData: any = await db.all(); // Use 'any' to bypass strict type checks for this test
        await assert(typeof allData === 'object' && !Array.isArray(allData), "all() should return an object");
        await assert(allData.counter === 12, "all() data is incorrect");
        await assert(allData.user['1'].id === 1, "all() nested data is incorrect");
    });

    test("clear()", async () => {
        await db.clear({ confirm: true });
        const allData = await db.all();
        await assert(Object.keys(allData).length === 0, "Database should be empty after clear()");
    });

    test("backup() and restore", async () => {
        // Set some data to back up
        await db.set('key1', 'value1');
        await db.set('key2', { nested: true });

        // Create backup
        await db.backup(BACKUP_PATH);
        await assert(fs.existsSync(BACKUP_PATH), "Backup file was not created");

        // Clear the database
        await db.clear({ confirm: true });
        let data = await db.all();
        await assert(Object.keys(data).length === 0, "DB should be empty before restore");

        // Restore from backup
        // Pass the same separator to the new instance for consistent testing
        const newDb = new NopeDB({ path: TEST_DB_PATH, separator: '_' });
        await newDb.loadBackup(BACKUP_PATH);

        // Verify restored data
        const val1 = await newDb.get('key1');
        const val2 = await newDb.get('key2_nested'); // This now works because newDb separator is '_'
        await assert(val1 === 'value1', "Restored value for key1 is incorrect");
        await assert(val2 === true, "Restored value for key2.nested is incorrect");
    });

    test("Concurrent writes (Queue)", async () => {
        const promises = [
            db.set('concurrent_1', 1),
            db.set('concurrent_2', 2),
            db.add('concurrent_counter', 1),
            db.push('concurrent_array', 'a'),
            db.set('concurrent_3', 3)
        ];
        await Promise.all(promises);

        await assert(await db.get('concurrent_1') === 1, "Concurrent write 1 failed");
        await assert(await db.get('concurrent_2') === 2, "Concurrent write 2 failed");
        await assert(await db.get('concurrent_counter') === 1, "Concurrent add failed");
        const arr: any = await db.get('concurrent_array'); // Use 'any' to bypass strict type checks for this test
        await assert(Array.isArray(arr) && arr[0] === 'a', "Concurrent push failed");
    });

    test("add() with non-numeric value", async () => {
        await db.set('non_numeric', 'hello');
        try {
            await db.add('non_numeric', 5);
            await assert(false, "Should have thrown an error for non-numeric add");
        } catch (error) {
            await assert(error instanceof Error, "Did not throw a proper error");
            const value = await db.get('non_numeric');
            await assert(value === 'hello', "Value should not have been modified");
        }
    });

    test("Corrupted JSON file", async () => {
        // Manually corrupt the file
        fs.writeFileSync(TEST_DB_PATH, '{"key": "value",');

        try {
            // Re-instantiate to force a read from the corrupted file
            const corruptDb = new NopeDB({ path: TEST_DB_PATH });
            await corruptDb.get('any'); // Trigger a read
            await assert(false, "Should have thrown an error on read from corrupted file");
        } catch (error) {
            await assert(error instanceof Error, "Did not throw on corrupted file");
        }
    });

    // Run all the defined tests
    await runAllTests();

    // Final cleanup
    await cleanup();
})();