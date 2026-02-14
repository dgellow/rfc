export type RfcStatus =
  | "INTERNET STANDARD"
  | "DRAFT STANDARD"
  | "PROPOSED STANDARD"
  | "BEST CURRENT PRACTICE"
  | "INFORMATIONAL"
  | "EXPERIMENTAL"
  | "HISTORIC"
  | "UNKNOWN";

export type RfcStream = "IETF" | "IAB" | "IRTF" | "Independent" | "Legacy";

export interface RfcMeta {
  number: number;
  title: string;
  authors: string[];
  date: { month: string; year: number };
  pageCount: number;
  status: RfcStatus;
  stream: RfcStream;
  keywords: string[];
  abstract?: string;
  obsoletes: number[];
  obsoletedBy: number[];
  updates: number[];
  updatedBy: number[];
  wg?: string;
  area?: string;
  errata?: string;
  doi: string;
  formats: string[];
}

export interface RfcRelation {
  source: number;
  target: number;
  type: "obsoletes" | "updates";
}

export interface SearchResult {
  meta: RfcMeta;
  rank: number;
  snippet?: string;
}
