const SPREADSHEET_ID = '1ERfHN5vVorODEPHOnIxyWgq__RltTPQiOa0C5YHX1_k';
const SHEET_NAME = 'Alliances_2026';

export interface AllianceHistoryPoint {
  date: string;
  score: number;
  rank: number;
  members?: number;
}

/**
 * Minimal RFC4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF/LF).
 * Avoids pulling in a CSV dependency for a single small sheet.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/**
 * Fetches alliance score/rank history from the public "Alliances_2026" sheet
 * (https://docs.google.com/spreadsheets/d/1ERfHN5vVorODEPHOnIxyWgq__RltTPQiOa0C5YHX1_k)
 * and returns the time series for a single alliance, sorted oldest -> newest.
 *
 * Requires the sheet to remain shared as "Anyone with the link can view".
 */
export async function getAllianceHistory(allianceId: number): Promise<AllianceHistoryPoint[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to load alliance history data');
  }

  const text = await res.text();
  const rows = parseCsv(text);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf('fetch_date');
  const idIdx = header.indexOf('alliance_id');
  const scoreIdx = header.indexOf('score');
  const rankIdx = header.indexOf('rank');
  const membersIdx = header.indexOf('members');

  if (dateIdx === -1 || idIdx === -1 || scoreIdx === -1 || rankIdx === -1) {
    throw new Error('Unexpected alliance history sheet format');
  }

  const points: AllianceHistoryPoint[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[idIdx]) continue;
    if (Number(r[idIdx]) !== allianceId) continue;

    const score = Number(r[scoreIdx]);
    const rank = Number(r[rankIdx]);
    if (Number.isNaN(score) || Number.isNaN(rank)) continue;

    points.push({
      date: r[dateIdx],
      score,
      rank,
      members: membersIdx !== -1 && r[membersIdx] ? Number(r[membersIdx]) : undefined,
    });
  }

  points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return points;
}
