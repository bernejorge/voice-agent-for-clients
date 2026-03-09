export function estaEnHorarioAtencion(): boolean {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);

  const weekday = parts.find(p => p.type === "weekday")?.value.toLowerCase();
  const hour = Number(parts.find(p => p.type === "hour")?.value);

  if (!weekday || Number.isNaN(hour)) return false;

  // lunes a viernes
  const esDiaHabil: boolean = ["lun", "mar", "mié", "jue", "vie"].includes(weekday);

  // 08:00 ≤ hora < 20:00
  const esHorario: boolean = hour >= 8 && hour < 20;

  return esDiaHabil && esHorario;
}