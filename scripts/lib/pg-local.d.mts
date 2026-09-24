import type { Sql } from "postgres";

export declare const ROOT: string;
export declare const LOCAL_PORT: number;
export declare const LOCAL_URL: string;

export interface EmbeddedHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export declare function isPortOpen(port: number, host?: string): Promise<boolean>;
export declare function startEmbedded(opts: {
  dataDir: string;
  port: number;
  persistent?: boolean;
  quiet?: boolean;
}): Promise<{ pg: EmbeddedHandle; fresh: boolean; url: string }>;
export declare function connect(url: string): Sql;
export declare function applyShim(sql: Sql): Promise<void>;
export declare function listMigrations(): { version: string; name: string; file: string }[];
export declare function migrate(sql: Sql, log?: (message: string) => void): Promise<number>;
export declare function seed(sql: Sql, opts?: { adminEmail?: string }): Promise<void>;
export declare function reset(sql: Sql, opts?: { adminEmail?: string; log?: (message: string) => void }): Promise<number>;
export declare function loadEnvFiles(): Promise<void>;
