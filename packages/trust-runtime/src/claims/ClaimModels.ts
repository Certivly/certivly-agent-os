export interface Claim {
  id: string;
  statement: string;
  source: string;
  status: "unverified" | "verified" | "rejected";
  payload?: any;
}
