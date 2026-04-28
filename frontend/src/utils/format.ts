export function money(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n || 0);
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function dateLong(d: string | number | Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function nowMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
