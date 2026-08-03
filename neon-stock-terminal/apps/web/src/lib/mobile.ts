export type IndianMobileProfile = {
  canonical: string;
  national: string;
  rawInput: string;
  riskFlags: string[];
  riskScore: number;
};

function computeRiskFlags(digits: string) {
  const flags: string[] = [];

  if (/^(\d)\1{9}$/.test(digits)) {
    flags.push("repeated_digit");
  }

  if (/^(\d{2})\1{4}$/.test(digits)) {
    flags.push("repeated_pair");
  }

  if (digits === "1234567890" || digits === "9876543210") {
    flags.push("straight_sequence");
  }

  return flags;
}

export function normalizeIndianMobile(input: string) {
  let digits = input.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }

  const riskFlags = computeRiskFlags(digits);
  const riskScore = Math.min(100, riskFlags.length * 25);

  return {
    canonical: `+91${digits}`,
    national: digits,
    rawInput: input.trim(),
    riskFlags,
    riskScore
  } satisfies IndianMobileProfile;
}

export function validateIndianMobileInput(input: string) {
  const normalized = normalizeIndianMobile(input);
  if (!normalized) {
    throw new Error("Enter a valid India mobile number.");
  }

  return normalized;
}

export function mobileDirectoryKey(canonical: string) {
  return canonical.replace(/\D/g, "");
}
