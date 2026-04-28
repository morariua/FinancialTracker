export interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
}
export interface Settings {
  monthly_income: number;
  currency: string;
  low_budget_threshold: number;
  bill_reminder_days: number;
}
export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  kind: 'expense' | 'income' | 'savings';
}
export interface Account {
  id: string;
  name: string;
  type: string;
  institution?: string;
  mask?: string;
  balance: number;
  currency: string;
  plaid_account_id?: string;
}
export interface Transaction {
  id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  date: string;
  type: 'expense' | 'income' | 'transfer';
  pending: number;
  source: string;
  notes: string | null;
  category_name: string | null;
  category_color: string | null;
  account_name: string | null;
}
export interface Budget {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  category_kind: string;
  month: string;
  amount: number;
  rollover: number;
  spent: number;
}
export interface Bill {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  account_id: string | null;
  account_name: string | null;
  autopay: number;
  active: number;
  last_paid_month: string | null;
}
export interface Alert {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  meta: Record<string, unknown> | null;
  read_at: number | null;
  dismissed_at: number | null;
  created_at: number;
}
export interface DashboardSummary {
  month: string;
  today: string;
  monthProgress: number;
  income: number;
  spent: number;
  remaining: number;
  txCount: number;
  totalBudget: number;
  totalBalance: number;
  currency: string;
  accounts: Array<{ id: string; name: string; type: string; balance: number; currency: string }>;
  byCategory: Array<{ category_id: string; category_name: string; category_color: string; spent: number }>;
  dailySpending: Array<{ date: string; spent: number }>;
  trend: Array<{ month: string; spent: number; income: number }>;
  upcomingBills: Array<{ id: string; name: string; amount: number; due_day: number }>;
}
