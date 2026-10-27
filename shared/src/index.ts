// Public surface of @voltify/shared, used by both the API server and the web app.
export * from './platform/types';
export { VoltifyHub, driverViewOf, rangeKm, toReasons, LOW_SOC, WH_PER_KM, type VehicleRegistration, type IngestResult, type IngestError } from './platform/hub';
export { notificationText, statusTip } from './platform/messages';
export { World, assignRoles, DRIVER, DEMO_ENV, type Role, type DriverTask, type WorldVehicle } from './world/world';
export { VoltifyRuntime, SPEEDS, DEFAULT_SPEED, type Command, type CommandResult, type Snapshot, type DriverAppState, type RuntimeOptions } from './runtime/runtime';
export { RISK_LEVELS, RISK_RANK, type RiskLevel } from './lib/riskLevels';
export { normalize, detectBrand, BRANDS, type Brand, type Telemetry } from './adapters';
export { encodeTelemetry, SIM, CITY_BOX, type City } from './sim';
export { stationsFor, nearestStation, type Station } from './stations/stations';
export type { SignalCode } from './ai/types';
