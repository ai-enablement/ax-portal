import type { FieldValue, ContentBlock } from './standard-documents.mjs';
export const MAX_FILE_BYTES: number;
export function asBlocks(value: FieldValue | undefined): ContentBlock[];
export function contentText(value: FieldValue | undefined): string;
export function validateContent(value: unknown): void;
