export type ImportState = {historicalImport?:boolean;historicalImportFinalizedAt?:string;historicalResumeStep?:number;historicalBaselineStep?:number;journeyStep?:number};
export function isImportInProgress(project?:ImportState):boolean;
export function canBackfillDocument(project:ImportState,stage:number):boolean;
export function applyImportLifecycle(previous:Record<string,unknown>,changes:Record<string,unknown>,currentStep:number,now?:string):Record<string,unknown>;
export function assertImportTransition(previous:Record<string,unknown>,merged:Record<string,unknown>,currentStep:number):void;
