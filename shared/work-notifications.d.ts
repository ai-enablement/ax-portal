export type WorkNotification = {
  projectNo: string;
  projectName: string;
  title: string;
  body: string;
  recipientRole?: string;
  journeyStep: number;
  deliveryPhase?: "design" | "development";
  view: "intake" | "definition" | "delivery";
  tone: "danger" | "warning" | "info";
};

export function buildWorkNotifications(
  projects: unknown[],
  actor: { id?: string; email?: string; appRole?: string },
): WorkNotification[];

export function isAssignedDeveloper(project: {developerIds?: (string | number)[]}, actorId?: string | number): boolean;
export function filterProjectList<T extends {developerIds?: (string | number)[]; status?: string}>(projects: T[], filter: string, actorId?: string | number): T[];
