export type Person = {
  id: string;
  name: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Balance = {
  id: string;
  personId: string;
  label: string; // freeform: تومان، USDT, …
  createdAt: string;
  updatedAt: string;
};

export type Transaction = {
  id: string;
  balanceId: string;
  type: "deposit" | "return";
  amount: number;
  date: string; // YYYY-MM-DD Gregorian
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportDoc = {
  schemaVersion: 1;
  exportedAt: string;
  people: Person[];
  balances: Balance[];
  transactions: Transaction[];
};
