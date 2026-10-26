/**
 * Goes to Paystack (or another site) and keeps the caller's transition pending
 * until the page has gone, so the button stays disabled and can't start a
 * second checkout. Coming back with the browser's Back button reloads, so the
 * button isn't left spinning.
 */
export function leaveTo(url: string): Promise<never> {
  window.addEventListener("pageshow", (e) => e.persisted && window.location.reload(), { once: true });
  window.location.assign(url);
  return new Promise<never>(() => {});
}
