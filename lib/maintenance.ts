export function isMaintenanceModeEnabled() {
  return process.env.MAINTENANCE_MODE === "true";
}

