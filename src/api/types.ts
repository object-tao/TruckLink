export type Role =
  | "CUSTOMER"
  | "CARRIER"
  | "SUPER_ADMIN"
  | "OPERATIONS"
  | "REVIEWER"
  | "FINANCE";
export type User = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  customer_company_id: string | null;
  carrier_id: string | null;
};
export type Env = { DB: D1Database; ASSETS: Fetcher; DEPLOY_COMMIT?: string };
export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; tokenHash: string };
};
export class Problem extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}
