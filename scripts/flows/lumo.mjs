// Scripted tour of the Lumo control app: closes onboarding, walks through the main tabs.
export async function run(page, { desktop }) {
  const click = async (re) => {
    const el = page.getByRole("button", { name: re }).first();
    if (await el.isVisible().catch(() => false)) await el.click({ timeout: 2000 }).catch(() => {});
    else {
      const t = page.getByText(re).first();
      if (await t.isVisible().catch(() => false)) await t.click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(1700);
  };
  await click(/^Zamknij$/);
  await page.waitForTimeout(800);
  for (const tab of [/Scena/, /Mikser/, /Muzyka/, /Efekty|Światła/, /Scena/]) await click(tab);
  if (desktop) {
    await page.mouse.move(700, 450);
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(500 + Math.sin(i / 4) * 300, 450 + Math.cos(i / 5) * 150);
      await page.waitForTimeout(60);
    }
  }
}
