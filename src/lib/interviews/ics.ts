/** A single-event iCalendar file (RFC 5545) so a session lands in anyone's calendar. */
export function buildIcs(event: {
  uid: string;
  title: string;
  start: Date;
  durationMin: number;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  now?: Date;
}): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(event.start.getTime() + Math.max(1, event.durationMin) * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lyze//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@lyze`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line, indented by one space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}
