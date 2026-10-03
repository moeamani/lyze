export const EXPORT_FORMATS = ["csv", "csv-codes", "xlsx", "sav", "r", "qdpx", "qdpx-maxqda"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
