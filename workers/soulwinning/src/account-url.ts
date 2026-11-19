/* No imports: the app's tests use this too. */

/**
 * A phone can hold several leader codes ("Add another account"). A leader's
 * notification says which code it's for (?as=<code id>), so opening it
 * switches the phone to that account first (proxy.ts).
 */
export function forAccount(url: string, owner: string) {
  const m = owner.match(/^leader:([0-9a-f-]{36})$/i);
  if (!m || !url.startsWith("/leaders/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}as=${m[1]}`;
}
