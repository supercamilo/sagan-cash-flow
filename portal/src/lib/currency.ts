export function normalizeCurrencyInput(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, "");
  const [wholePart, ...decimalParts] = sanitized.split(".");
  const decimals = decimalParts.join("").slice(0, 2);

  if (sanitized.includes(".")) {
    return `${wholePart || "0"}.${decimals}`;
  }

  return wholePart;
}

export function formatCurrencyInput(value: string) {
  if (!value) {
    return "";
  }

  const [wholePartRaw, decimals] = value.split(".");
  const wholePart = wholePartRaw || "0";
  const formattedWhole = Number(wholePart).toLocaleString("en-US");

  if (value.endsWith(".") && decimals === undefined) {
    return `${formattedWhole}.`;
  }

  if (decimals !== undefined) {
    return `${formattedWhole}.${decimals}`;
  }

  return formattedWhole;
}

export function parseCurrencyInput(value: string) {
  const normalized = normalizeCurrencyInput(value);
  return normalized ? Number(normalized) : 0;
}

export function normalizePercentInput(value: string) {
  const sanitized = value.replace(/[^0-9.]/g, "");
  const [wholePart, ...decimalParts] = sanitized.split(".");
  const decimals = decimalParts.join("").slice(0, 2);
  const clampedWhole = wholePart.slice(0, 3);

  if (sanitized.includes(".")) {
    return `${clampedWhole || "0"}.${decimals}`;
  }

  return clampedWhole;
}

export function parsePercentInput(value: string) {
  const normalized = normalizePercentInput(value);
  return normalized ? Number(normalized) : 0;
}
