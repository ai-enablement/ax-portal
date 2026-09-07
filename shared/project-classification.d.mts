export const AGENT_TYPES: string[];
export const AUTONOMY_LEVELS: string[];
export const TRACKS: string[];
export const TRACK_LABELS: Record<string,string>;
export type ClassificationInput = {writeExec?:boolean;sensitive?:boolean;businessIdentity?:boolean;damageFinancial?:boolean;scope?:string;autonomy?:string;agentType?:string;track?:string;standardVersion?:string};
export type OperationsProject = {name?:string;description?:string;requester?:string;projectOwner?:string;owner?:string;developerNames?:string[];requesterEmail?:string;projectOwnerEmail?:string;requestedDate?:string;intakeAnswers?:string[];intakeDetails?:Record<string,string>;feaDraft?:ClassificationInput&Record<string,unknown>;historicalDocuments?:Record<string,import('./standard-documents.mjs').StandardStageRecord>};
export function classifyProject(input?:ClassificationInput): {track:'LOW'|'MEDIUM'|'HIGH';label:string;signals:string[];citation:string;raised?:boolean};
export function operationsSourceFields(project?:OperationsProject):Record<string,string>;
