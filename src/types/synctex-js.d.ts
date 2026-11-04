declare module 'synctex-js' {
  interface SyncTexFile {
    path: string;
    name: string;
  }

  interface SyncTexElement {
    file?: SyncTexFile;
    fileNumber: number;
    line: number;
    left: number;
    bottom: number;
    width: number | null;
    height: number;
    page: number;
  }

  interface SyncTexDocument {
    files: Record<string, SyncTexFile>;
    blockNumberLine: Record<string, Record<string, Record<string, SyncTexElement[]>>>;
  }

  export const parser: {
    parseSyncTex: (body: string) => SyncTexDocument;
  };
}
