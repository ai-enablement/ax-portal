export function canOpenCostMonitoring(role) {
  return ['admin','team_leader','team_member','bts','bp_solution'].includes(role);
}
