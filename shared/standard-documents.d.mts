export type DocumentFile = { id: string; name: string; type: string; size: number };
export type ContentBlock = { id: string; type: "text"; text: string } | { id: string; type: "table"; rows: string[][] } | { id: string; type: "image" | "file"; file: DocumentFile; caption: string };
export type BlockContent = { kind: "blocks"; blocks: ContentBlock[] };
export type FieldValue = string | boolean[] | Record<string, string>[] | BlockContent;
export type DocumentField = { id: string; label: string; kind: string; options: string[]; optional?: boolean };
export type DocumentSection = { id: string; title: string; description: string; fields: DocumentField[] };
export type StandardDocument = { fields: Record<string, FieldValue>; completedSections: string[]; status: "draft" | "complete"; messages: { role: string; text: string; field?: string }[] };
export type StandardStageRecord = {
  schemaVersion?: number;
  documents?: Record<string, StandardDocument>;
  legacyValues?: string[];
  values: string[];
  status: "draft" | "complete";
  updatedAt: string;
};
export const standardDocuments: Record<string, { title: string; sections: DocumentSection[] }>;
export const stageDocumentCodes: Record<number, string[]>;
export function hydrateStandardDocuments(stage: number, record?: Partial<StandardStageRecord>, project?: import('./project-classification.mjs').OperationsProject): StandardStageRecord & { documents: Record<string, StandardDocument> };
export function sectionHasContent(section: DocumentSection, fields: Record<string, FieldValue>): boolean;
