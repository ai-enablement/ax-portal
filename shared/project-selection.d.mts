export function selectedProjectNumber(projects:ReadonlyArray<{no:string}>,selectedNo:string):string;
export function savedProjectView<T extends {no:string}>(previous:T,saved:Partial<T>):T;
export function currentWorkflowTarget<T extends {projectNo:string;journeyStep:number;deliveryPhase?:string}>(project:{no:string;journeyStep:number;deliveryPhase?:string},target:T|null|undefined):T|null;
