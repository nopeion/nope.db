const { NopeDB } = require('..'); // Import the package from the root directory
const fs = require('fs');
const path = require('path');

// Define paths for the test database and backup file
const TEST_DB_PATH = path.join(__dirname, 'test-db.json');
const BACKUP_PATH = path.join(__dirname, 'test-db-backup.json');

/**
 * Asserts a condition. Throws an error if the condition is false.
 * @param {boolean} condition The condition to check.
 * @param {string} message The error message if assertion fails.
 */
async function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Runs a named test function and logs its status.
 * @param {string} name The name of the test.
 * @param {Function} fn The async test function to execute.
 */
async function runTest(name, fn) {
    console.log(`[RUNNING] ${name}`);
    try {
        await fn();
        console.log(`[SUCCESS] ${name}\n`);
    } catch (error) {
        console.error(`[FAILED]  ${name}`);
        console.error(error); // Log the detailed error
        process.exit(1); // Stop the test run on any failure
    }
}

/**
 * Deletes any leftover test files (DB and backup).
 */
async function cleanup() {
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

    await runTest("set() & get()", async () => {
        await db.set('user_profile_name', 'nopeion');
        const name = await db.get('user_profile_name');
        await assert(name === 'nopeion', `Expected 'nopeion', got '${name}'`);
    });

    await runTest("set() complex object", async () => {
        const user = { id: 1, type: 'admin', settings: { theme: 'dark' } };
        await db.set('user_1', user);
        const fetchedUser = await db.get('user_1');
        await assert(fetchedUser.id === 1, "User ID mismatch");
        await assert(fetchedUser.settings.theme === 'dark', "User theme mismatch");
    });

    await runTest("get() nested value", async () => {
        const theme = await db.get('user_1_settings_theme');
        await assert(theme === 'dark', `Expected 'dark', got '${theme}'`);
    });

    await runTest("add()", async () => {
        await db.set('counter', 10);
        const newCount = await db.add('counter', 5);
        await assert(newCount === 15, `Expected 15, got '${newCount}'`);
        const newCount2 = await db.add('new_counter', 1);
        await assert(newCount2 === 1, `Expected 1, got '${newCount2}'`);
    });

    await runTest("subtract()", async () => {
        const newCount = await db.subtract('counter', 3);
        await assert(newCount === 12, `Expected 12, got '${newCount}'`);
    });

    await runTest("has()", async () => {
        const hasUser = await db.has('user_1');
        await assert(hasUser === true, "Expected 'user_1' to exist");
        const hasFake = await db.has('fake_key');
        await assert(hasFake === false, "Expected 'fake_key' to not exist");
    });

    await runTest("push()", async () => {
        await db.set('logs', ['init']);
        const newLogs = await db.push('logs', 'test_run');
        await assert(Array.isArray(newLogs), "Expected result to be an array");
        await assert(newLogs.length === 2, `Expected array length 2, got ${newLogs.length}`);
        await assert(newLogs[1] === 'test_run', "Expected 'test_run' to be pushed");
    });

    await runTest("delete()", async () => {
        await db.set('temp', 'deleteme');
        const deleted = await db.delete('temp');
        await assert(deleted === true, "Expected delete() to return true");
        const value = await db.get('temp');
        await assert(value === null, `Expected deleted value to be null, got '${value}'`);
    });

    await runTest("delete() nested", async () => {
        await db.set('user_1_settings_lang', 'en');
        const lang = await db.get('user_1_settings_lang');
        await assert(lang === 'en', "Expected lang to be 'en' before delete");

        const deleted = await db.delete('user_1_settings_lang');
        await assert(deleted === true, "Nested delete should return true");

        const deletedLang = await db.get('user_1_settings_lang');
        await assert(deletedLang === null, "Expected lang to be null after delete");

        const settings = await db.get('user_1_settings');
        await assert(settings.theme === 'dark', "Expected theme to still exist");
    });

    await runTest("all()", async () => {
        const data = await db.all();

        // DB structure: { user: { '1': {...}, profile: { name: ... } }, counter: 12, new: { counter: 1 }, logs: [...] }

        await assert(data.user, "data.user should not be undefined");
        await assert(data.user['1'], "data.user['1'] should not be undefined");
        await assert(data.user['1'].id === 1, "all() data.user['1'].id mismatch");
        await assert(data.counter === 12, "all() data.counter mismatch");

        await assert(data.new, "data.new should not be undefined");
        await assert(data.new.counter === 1, "all() data.new.counter mismatch");

        await assert(data.user.profile, "data.user.profile should not be undefined");
        await assert(data.user.profile.name === 'nopeion', "all() data.user.profile.name mismatch");
    });

    await runTest("backup()", async () => {
        const result = await db.backup(BACKUP_PATH);
        await assert(result === true, "Backup should return true");
        const backupExists = fs.existsSync(BACKUP_PATH);
        await assert(backupExists === true, "Backup file was not created");
    });

    await runTest("loadBackup()", async () => {
        // Corrupt the 'user_1' object to ensure load works
        await db.set('user_1', { id: 999 });
        const loaded = await db.loadBackup(BACKUP_PATH);
        await assert(loaded === true, "Load backup should return true");

        // Use 'get' with separator to verify nested data was restored
        const restoredId = await db.get('user_1_id');
        await assert(restoredId === 1, `Expected restored ID to be 1, got ${restoredId}`);
    });

    await runTest("clear() & reset()", async () => {
        // Test that it throws an error without confirmation
        let didThrow = false;
        try {
            await db.clear({ confirm: false }); // Call without valid confirmation
        } catch (error) {
            didThrow = true;
            await assert(error.message.includes("Accidental clear prevented"), "Wrong error message for clear");
        }
        await assert(didThrow === true, "clear() did not throw error without confirmation");

        // Test that it works with confirmation
        await db.clear({ confirm: true });
        const data = await db.all();
        await assert(Object.keys(data).length === 0, "Database was not cleared");

        // Test reset() alias
        await db.set('a', 1);
        await db.reset({ confirm: true });
        const data2 = await db.all();
        await assert(Object.keys(data2).length === 0, "Database was not reset");
    });

    await runTest("Cleanup", async () => {
        await cleanup();
        await assert(!fs.existsSync(TEST_DB_PATH), "Test DB file not cleaned up");
        await assert(!fs.existsSync(BACKUP_PATH), "Backup file not cleaned up");
        console.log("\nAll tests passed successfully!");
    });

})();