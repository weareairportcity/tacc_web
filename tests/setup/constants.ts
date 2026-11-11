export const TEST_WORKER_PORT = 8790;
export const TEST_WORKER_URL = `http://127.0.0.1:${TEST_WORKER_PORT}`;
// Only ever used against the throwaway local Worker the tests start.
export const TEST_ADMIN_SECRET = "camp-test-secret";
export const WORKER_DIR = new URL("../../workers/soulwinning/", import.meta.url).pathname;
// The local Worker calls this fake expressPay (tests/setup/expresspay.ts), never the real one.
export const TEST_PROVIDER_PORT = 8792;
export const TEST_EXPRESSPAY_MERCHANT = "000000000000";
export const TEST_EXPRESSPAY_KEY = "fake-expresspay-key-for-local-tests";
export const TEST_ALERT_PHONE = "0200000001";
export const TEST_CAMP_SECRET = "camp-test-secret-at-least-32-characters-long";
// The coordinators' Telegram bot, against the same fake server (tests/setup/expresspay.ts).
export const TEST_TELEGRAM_TOKEN = "123456:test-bot-token";
export const TEST_TELEGRAM_SECRET = "telegram-webhook-test-secret";
export const TEST_TELEGRAM_LINK_CODE = "link-code-for-tests";
