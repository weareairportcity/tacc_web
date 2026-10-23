export const TEST_WORKER_PORT = 8790;
export const TEST_WORKER_URL = `http://127.0.0.1:${TEST_WORKER_PORT}`;
// Only ever used against the throwaway local Worker the tests start.
export const TEST_ADMIN_SECRET = "camp-test-secret";
export const WORKER_DIR = new URL("../../workers/soulwinning/", import.meta.url).pathname;
