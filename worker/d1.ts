/**
 * Minimal D1 types, written by hand so this Worker needs no
 * @cloudflare/workers-types dependency. They cover only the D1 surface
 * this app actually uses.
 */

export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number; last_row_id?: number | string };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/** Static Assets binding: only Request -> Response is used here. */
export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
}
