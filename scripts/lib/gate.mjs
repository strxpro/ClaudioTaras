// Password-gated preview sites (e.g. a site before launch): when the project has a gate password,
// the panel passes it as GATE_PASSWORD; the capture scripts type it into the gate, then record what
// is behind it. The password is never logged.
const SUBMIT = /entra|enter|accedi|wejdź|wejdz|sblocca|unlock|invia|submit|conferma|zaloguj|login|^ok$|→|›/i;

export async function unlock(page, password = process.env.GATE_PASSWORD) {
  if (!password) return false;
  const field = page.locator('input[type="password"]').first();
  if (!(await field.isVisible({ timeout: 1500 }).catch(() => false))) return false;
  await field.fill(password).catch(() => {});
  await field.press("Enter").catch(() => {});
  await page.waitForTimeout(2500);
  if (await field.isVisible().catch(() => false)) {
    const btn = page.locator('button, input[type="submit"], [role="button"], a').filter({ hasText: SUBMIT }).first();
    await btn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  const open = !(await field.isVisible().catch(() => false));
  console.log(open ? "gate: unlocked" : "gate: still locked (wrong password?)");
  if (open) await page.waitForLoadState("load").catch(() => {});
  return open;
}
