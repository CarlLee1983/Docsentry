export interface RepositoryReader {
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  listFiles(): Promise<readonly string[]>;
}
