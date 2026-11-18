export type CsvValue = string | number | boolean | null | undefined;

/**
 * Serializa filas a CSV (RFC 4180). Las celdas que empiezan con = + - @ se prefijan con una
 * comilla para que Excel o Sheets no las ejecuten como fórmulas (inyección de CSV).
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const cell = (value: CsvValue): string => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
}
