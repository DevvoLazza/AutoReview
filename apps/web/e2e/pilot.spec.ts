import { expect, test } from "@playwright/test";

test("knowledge creation, approval, retirement and preferences are backed by the API", async ({
  page,
}) => {
  await page.goto("/knowledge");
  const title = `Verified FAQ ${Date.now()}`;
  await page.getByLabel("Titolo", { exact: true }).fill(title);
  await page
    .getByLabel("Informazioni verificate")
    .fill("Appointments are available by phone only.");
  await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(card.getByText("Bozza", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Approva fonte" }).click();
  await expect(card.getByText("Approvata", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Ritira", exact: true }).click();
  await expect(card.getByText("Ritirata", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Adapter simulato:", { exact: false })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tono di voce", exact: true })
    .fill("Clear, concise and professional");
  await page.getByRole("button", { name: "Salva preferenze", exact: true }).click();
  await expect(page.getByText("Preferenze salvate", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tono di voce", exact: true })).toHaveValue(
    "Clear, concise and professional",
  );
  await page
    .getByRole("textbox", { name: "Tono della sede", exact: true })
    .fill("Warm and concise");
  await page.getByRole("button", { name: "Salva preferenze della sede", exact: true }).click();
  await expect(page.getByText("Preferenze della sede salvate", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tono della sede", exact: true })).toHaveValue(
    "Warm and concise",
  );
});

test("API-created review can be generated, edited, approved and confirmed without a hard-coded route", async ({
  page,
  request,
}) => {
  const name = `accounts/demo/locations/browser/reviews/${Date.now()}`;
  const now = new Date().toISOString();
  const response = await request.post("http://localhost:4101/v1/webhooks/google-business/demo", {
    data: {
      googleReviewName: name,
      locationId: "browser",
      reviewerDisplayName: "Browser Test",
      starRating: 5,
      comment: "Wonderful service",
      createTime: now,
      updateTime: now,
      existingReply: null,
    },
  });
  expect(response.ok()).toBeTruthy();
  const review = await response.json();
  await page.goto(`/inbox/${review.id}`);
  await expect(page.getByRole("heading", { name: "Browser Test" })).toBeVisible();
  if (await page.getByRole("button", { name: "Genera risposta", exact: true }).isVisible())
    await page.getByRole("button", { name: "Genera risposta", exact: true }).click();
  await expect(page.getByLabel("Testo risposta")).toBeVisible();
  await page.getByLabel("Testo risposta").fill("Thank you for your kind review.");
  await expect(page.getByRole("button", { name: "Approva e pubblica" })).toBeDisabled();
  await page.getByRole("button", { name: "Salva modifica" }).click();
  await page.getByRole("button", { name: "Approva e pubblica" }).click();
  await expect(page.getByText("Pubblicata", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pubblicata", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Testo risposta")).toHaveValue("Thank you for your kind review.");
});

test("API failure is visible and retry restores the real inbox, without a demo fallback", async ({
  page,
}) => {
  await page.goto("/inbox");
  await expect(page.locator(".review-row").first()).toBeVisible();
  await page.route("**/api/backend/reviews?**", (route) =>
    route.fulfill({ status: 503, json: { message: "Backend temporarily unavailable" } }),
  );
  await page.getByRole("button", { name: "Aggiorna", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Backend temporarily unavailable" }),
  ).toBeVisible();
  await expect(page.locator(".review-row")).toHaveCount(0);
  await page.unroute("**/api/backend/reviews?**");
  await page.getByRole("button", { name: "Riprova", exact: true }).click();
  await expect(page.locator(".review-row").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
