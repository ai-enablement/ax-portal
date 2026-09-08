export type ImportState = {historicalImport?:boolean;historicalImportFinalizedAt?:string;historicalResumeStep?:number;historicalBaselineStep?:number;journeyStep?:number;historicalCompletedThrough?:{step:number;phase:string;source:string;at:string}};
export function isHistoricalDocumentComplete(project:ImportState,stage:number,code?:string):boolean;
export function needsImportCompletionRepair(project:ImportState):boolean;
export function isImportInProgress(project?:ImportState):boolean;
export function canBackfillDocument(project:ImportState,stage:number):boolean;
export function applyImportLifecycle(previous:Record<string,unknown>,changes:Record<string,unknown>,currentStep:number,now?:string):Record<string,unknown>;
export function assertImportTransition(previous:Record<string,unknown>,merged:Record<string,unknown>,currentStep:number):void;
