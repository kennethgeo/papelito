import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const {
  isCalendarDate,
  costaRicaDate,
  addCalendarDays,
  suggestedEventDates,
  validateExchangeDraft,
} = await import("../src/lib/event-dates.ts");
const { inferThemeFromDate, resolveExchangeTheme } =
  await import("../src/lib/theme.ts");
const { callServerAction } = await import("../src/lib/client-actions.ts");

assert.equal(isCalendarDate("2028-02-29"), true);
for (const date of [
  "2027-02-29",
  "2026-02-30",
  "2026-13-01",
  "2026-2-01",
  "",
  "not-a-date",
])
  assert.equal(isCalendarDate(date), false, date);
assert.equal(costaRicaDate(new Date("2027-01-01T05:59:59Z")), "2026-12-31");
assert.equal(costaRicaDate(new Date("2027-01-01T06:00:00Z")), "2027-01-01");
assert.equal(addCalendarDays("2028-03-01", -1), "2028-02-29");
assert.equal(addCalendarDays("2026-12-31", 14), "2027-01-14");
assert.equal(addCalendarDays("", -7), "");
for (const today of [
  "2026-10-17",
  "2027-02-13",
  "2027-02-14",
  "2027-02-15",
  "2027-12-24",
  "2027-12-25",
  "2027-12-31",
  "2028-02-29",
]) {
  const dates = suggestedEventDates(today);
  assert.ok(dates.registrationDeadline >= today);
  assert.ok(dates.eventDate >= dates.registrationDeadline);
  assert.ok(isCalendarDate(dates.eventDate));
}
assert.equal(suggestedEventDates("2029-10-17").eventDate, "2029-12-24");
assert.equal(suggestedEventDates("2029-12-25").eventDate, "2030-01-08");
assert.equal(inferThemeFromDate("2032-12-01").theme, "navidad");
assert.equal(inferThemeFromDate("2032-02-01").theme, "amistad");
assert.equal(inferThemeFromDate("2032-02-30").theme, "general");
assert.equal(resolveExchangeTheme("2032-12-01", "cumpleanos"), "cumpleanos");
const draft = {
  name: "En familia",
  eventDate: "2027-12-24",
  registrationDeadline: "2027-12-17",
  budgetAmount: 15000,
};
assert.deepEqual(validateExchangeDraft(draft, "2027-10-01"), {});
assert.ok(validateExchangeDraft({ ...draft, name: " " }).name);
assert.ok(validateExchangeDraft({ ...draft, budgetAmount: NaN }).budgetAmount);
assert.ok(
  validateExchangeDraft({ ...draft, registrationDeadline: "2027-12-25" })
    .registrationDeadline,
);
assert.ok(validateExchangeDraft(draft, "2028-01-01").eventDate);
console.log(
  "PASS fechas: calendario real, años futuros, cambio de año, zona horaria CR, tema manual y validación",
);

const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
let calls = 0;
try {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false },
  });
  const offline = await callServerAction(async () => {
    calls++;
    return { success: true };
  });
  assert.equal(offline.success, false);
  assert.equal(calls, 0);
  assert.match(offline.error, /no se envió/);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  const unknown = await callServerAction(async () => {
    calls++;
    throw new Error("Network interrupted");
  });
  assert.equal(unknown.success, false);
  assert.equal(calls, 1);
  assert.match(unknown.error, /antes de repetirlo/);
  assert.deepEqual(
    await callServerAction(async () => ({ success: true, data: 42 })),
    { success: true, data: 42 },
  );
} finally {
  if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
  else delete globalThis.navigator;
}
console.log(
  "PASS conexión: offline no envía, excepción no reintenta una mutación y éxito conserva la respuesta",
);
