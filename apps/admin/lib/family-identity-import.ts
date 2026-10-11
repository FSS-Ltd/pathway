export type FamilyImportRow =
  | {
      target: "GUARDIAN";
      childId: string;
      email: string;
      reviewBasis: "SCHOOL_RECORDS" | "LEGAL_DOCUMENT";
      confirmedLegalAccess: true;
    }
  | {
      target: "STUDENT";
      childId: string;
      email: string;
      confirmedSchoolApproval: true;
    };

export type ParsedFamilyImportRow = { csvRow: number; row: FamilyImportRow };

const headers = [
  "childId",
  "childName",
  "target",
  "email",
  "reviewBasis",
  "confirmed",
];

function readCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field || closedQuote) throw new Error("Invalid CSV quoting.");
      quoted = true;
      continue;
    }
    if (char === "," || char === "\n" || char === "\r") {
      record.push(field);
      field = "";
      closedQuote = false;
      if (char !== ",") {
        records.push(record);
        record = [];
        if (char === "\r" && text[index + 1] === "\n") index += 1;
      }
      continue;
    }
    if (closedQuote) throw new Error("Invalid CSV quoting.");
    field += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (record.length || field) records.push([...record, field]);
  return records;
}

export function parseFamilyIdentityCsv(
  text: string,
  childNames: ReadonlyMap<string, string>,
): { rows: ParsedFamilyImportRow[]; errors: string[] } {
  const records = readCsv(text.replace(/^\uFEFF/, ""));
  if (records[0]?.join(",") !== headers.join(",")) {
    throw new Error(
      `CSV columns must be ${headers.join(", ")}, in that order.`,
    );
  }
  const rows: ParsedFamilyImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const students = new Set<string>();
  for (const [index, record] of records.slice(1).entries()) {
    if (record.length === 1 && !record[0].trim()) continue;
    if (
      record.length === headers.length &&
      record.slice(2).every((value) => !value.trim())
    )
      continue;
    const csvRow = index + 2;
    if (record.length !== headers.length) {
      errors.push(`Row ${csvRow}: expected ${headers.length} columns.`);
      continue;
    }
    const [childId, uploadedName, rawTarget, rawEmail, rawBasis, rawConfirmed] =
      record.map((value) => value.trim());
    const target = rawTarget.toUpperCase();
    const email = rawEmail.toLowerCase();
    const basis = rawBasis.toUpperCase();
    const currentName = childNames.get(childId);
    if (currentName === undefined) {
      errors.push(`Row ${csvRow}: child ID is not in the current site roster.`);
    } else if (uploadedName !== spreadsheetName(currentName)) {
      errors.push(
        `Row ${csvRow}: child name does not match the current site roster.`,
      );
    } else if (target !== "GUARDIAN" && target !== "STUDENT") {
      errors.push(`Row ${csvRow}: target must be GUARDIAN or STUDENT.`);
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      errors.push(`Row ${csvRow}: enter a valid email address.`);
    } else if (rawConfirmed.toLowerCase() !== "yes") {
      errors.push(`Row ${csvRow}: confirmation must be yes for this person.`);
    } else if (
      target === "GUARDIAN" &&
      basis !== "SCHOOL_RECORDS" &&
      basis !== "LEGAL_DOCUMENT"
    ) {
      errors.push(`Row ${csvRow}: choose SCHOOL_RECORDS or LEGAL_DOCUMENT.`);
    } else if (target === "STUDENT" && basis) {
      errors.push(`Row ${csvRow}: leave reviewBasis blank for students.`);
    } else {
      const key = `${childId}:${target}:${email}`;
      if (seen.has(key) || (target === "STUDENT" && students.has(childId))) {
        errors.push(`Row ${csvRow}: duplicate invitation in this file.`);
        continue;
      }
      seen.add(key);
      if (target === "STUDENT") students.add(childId);
      rows.push({
        csvRow,
        row:
          target === "GUARDIAN"
            ? {
                target,
                childId,
                email,
                reviewBasis:
                  basis === "SCHOOL_RECORDS" ? basis : "LEGAL_DOCUMENT",
                confirmedLegalAccess: true,
              }
            : { target, childId, email, confirmedSchoolApproval: true },
      });
    }
  }
  if (rows.length === 0 && errors.length === 0) {
    errors.push("Add at least one completed invitation row.");
  }
  if (rows.length > 500)
    errors.push("Use at most 500 invitation rows per file.");
  return { rows, errors };
}

function spreadsheetName(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  return `"${spreadsheetName(value).replaceAll('"', '""')}"`;
}

export function familyIdentityTemplate(
  children: readonly { id: string; fullName: string }[],
): string {
  return [
    headers.join(","),
    ...children.map((child) =>
      [child.id, csvCell(child.fullName), "", "", "", ""].join(","),
    ),
  ].join("\r\n");
}
