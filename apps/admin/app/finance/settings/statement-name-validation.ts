export function validateStatementName(value: string): string | null {
  const name = value.trim().normalize("NFC");
  if ([...name].length < 5 || [...name].length > 22)
    return "Use between 5 and 22 characters.";
  if (!/\p{Script=Latin}/u.test(name))
    return "Include at least one Latin letter.";
  if (/[<>\\'"*]/u.test(name))
    return "Remove <, >, \\, apostrophes, quotation marks and *.";
  if (/[^\p{Script=Latin}\p{M}\x20-\x7e]/u.test(name))
    return "Use Latin letters, numbers, spaces or supported punctuation.";
  return null;
}
