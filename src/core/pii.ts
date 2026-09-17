const PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  { name: "email", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[REDACTED_EMAIL]" },
  {
    name: "phone",
    regex: /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)/g,
    replacement: "[REDACTED_PHONE]",
  },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  { name: "card", regex: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "[REDACTED_CARD]" },
];

export function redactPii(input: string): string {
  return PATTERNS.reduce((text, pattern) => text.replace(pattern.regex, pattern.replacement), input);
}

export function redactUnknown(value: unknown): unknown {
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowered = key.toLowerCase();
      if (["phone", "email", "ssn", "card", "password", "dob", "dateofbirth"].includes(lowered)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactUnknown(val);
      }
    }
    return out;
  }
  return value;
}
