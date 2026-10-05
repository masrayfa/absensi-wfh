/**
 * Asia/Jakarta (WIB) is a fixed UTC+7 offset — Indonesia's western zone has
 * observed no DST since 1964. Shift the instant by +7h and read UTC parts.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The WIB business date (`YYYY-MM-DD`) for an instant.
 * 16:30Z -> same WIB day; 17:30Z -> next WIB day.
 */
export function wibDateOf(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
