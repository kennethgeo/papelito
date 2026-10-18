export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function costaRicaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(value: string, days: number): string {
  if (!isCalendarDate(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function suggestedEventDates(today: string) {
  if (!isCalendarDate(today))
    return { eventDate: "", registrationDeadline: "" };
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const friendship = `${year}-02-14`;
  const christmas = `${year}-12-24`;
  const eventDate =
    today <= friendship
      ? friendship
      : month >= 10 && today <= christmas
        ? christmas
        : addCalendarDays(today, 14);
  const weekBefore = addCalendarDays(eventDate, -7);
  return {
    eventDate,
    registrationDeadline: weekBefore < today ? today : weekBefore,
  };
}

export function formatEventDate(value: string, short = false): string {
  if (!isCalendarDate(value)) return value || "Por elegir";
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CRC" ? 0 : 2,
  }).format(amount);
}

export function validateExchangeDraft(
  input: {
    name: string;
    eventDate: string;
    registrationDeadline: string;
    budgetAmount: number;
  },
  today = "",
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 2 || input.name.trim().length > 100)
    errors.name = "Poné un nombre de 2 a 100 caracteres.";
  if (!isCalendarDate(input.eventDate))
    errors.eventDate = "Elegí una fecha válida para entregar los regalos.";
  else if (today && input.eventDate < today)
    errors.eventDate = "Elegí hoy o una fecha futura.";
  if (!isCalendarDate(input.registrationDeadline))
    errors.registrationDeadline =
      "Elegí una fecha válida para confirmar la participación.";
  else if (input.registrationDeadline > input.eventDate)
    errors.registrationDeadline =
      "La inscripción debe cerrar antes o el día de la entrega.";
  else if (today && input.registrationDeadline < today)
    errors.registrationDeadline =
      "La inscripción no puede cerrar en una fecha pasada.";
  if (
    !Number.isFinite(input.budgetAmount) ||
    input.budgetAmount <= 0 ||
    input.budgetAmount > 100_000_000
  )
    errors.budgetAmount =
      "Indicá un presupuesto mayor a cero y de hasta 100 millones.";
  return errors;
}
