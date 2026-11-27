const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)] ?? digit);
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;

  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];

  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);

  return [...groups, lastThree].join(',');
}

export interface FormatBdtOptions {
  locale?: 'bn' | 'en';
  withSymbol?: boolean;
}

export function formatBdt(amount: number, options: FormatBdtOptions = {}): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError('amount must be a finite number');
  }

  const { locale = 'bn', withSymbol = true } = options;
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = groupIndian(String(Math.abs(rounded)));
  const formatted = locale === 'bn' ? toBanglaDigits(digits) : digits;

  return `${sign}${withSymbol ? '৳' : ''}${formatted}`;
}
