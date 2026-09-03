export const AGENT_TYPES: string[];
export const AUTONOMY_LEVELS: string[];
export type ClassificationInput = {writeExec?:boolean;sensitive?:boolean;damageFinancial?:boolean;scope?:string;autonomy?:string;agentType?:string};
export type OperationsProject = {name?:string;projectOwner?:string;owner?:string;developerNames?:string[];feaDraft?:ClassificationInput;historicalDocuments?:Record<string,import('./standard-documents.mjs').StandardStageRecord>};
export function classifyProject(input?:ClassificationInput): {track:'LOW'|'MEDIUM'|'HIGH';label:string;signals:string[];citation:string};
export function operationsSourceFields(project?:OperationsProject):Record<string,string>;
