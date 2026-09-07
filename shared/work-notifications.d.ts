export type WorkNotification = {
  projectNo: string;
  projectName: string;
  title: string;
  body: string;
  journeyStep: number;
  deliveryPhase?: "design" | "development";
  view: "intake" | "definition" | "delivery";
  tone: "danger" | "warning" | "info";
};

export function buildWorkNotifications(
  projects: unknown[],
  actor: { id?: string; email?: string; appRole?: string },
): WorkNotification[];
