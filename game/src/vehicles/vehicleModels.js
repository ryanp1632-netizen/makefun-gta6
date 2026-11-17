// The vehicles of Halcyon Keys: dimensions, handling and toughness per model, plus the paint
// each one can come in. Driving physics, art, traffic and the garage all read from here.

export const VEHICLE_MODELS = {
  coupe: { name: 'Vespera GT', length: 44, width: 20, maxSpeed: 600, accel: 440, brake: 760, grip: 7.8, steer: 2.9, mass: 1.0, hp: 110, cabin: [0.04, -0.3], price: 18000, level: 2 },
  sedan: { name: 'Marlowe 4', length: 45, width: 21, maxSpeed: 440, accel: 300, brake: 640, grip: 7.0, steer: 2.6, mass: 1.15, hp: 120, cabin: [0.2, -0.28], price: 6000, level: 1 },
  taxi: { name: 'KeyCab Marlowe', length: 45, width: 21, maxSpeed: 440, accel: 300, brake: 640, grip: 7.0, steer: 2.6, mass: 1.15, hp: 120, cabin: [0.2, -0.28], price: 0, level: 99 },
  van: { name: 'Cargo Pelican', length: 54, width: 24, maxSpeed: 350, accel: 230, brake: 560, grip: 6.0, steer: 2.1, mass: 1.7, hp: 170, cabin: [0.42, 0.22], price: 7500, level: 1 },
  pickup: { name: 'Bayou Hauler', length: 51, width: 23, maxSpeed: 410, accel: 290, brake: 600, grip: 6.5, steer: 2.3, mass: 1.45, hp: 155, cabin: [0.22, -0.08], price: 9000, level: 3 },
  bike: { name: 'Zephyr 600', length: 28, width: 10, maxSpeed: 560, accel: 520, brake: 700, grip: 8.6, steer: 3.4, mass: 0.5, hp: 60, cabin: [0, 0], price: 12000, level: 4 },
  muscle: { name: 'Brisa SS', length: 47, width: 22, maxSpeed: 560, accel: 480, brake: 680, grip: 6.4, steer: 2.6, mass: 1.25, hp: 140, cabin: [0.02, -0.3], price: 26000, level: 5 },
  police: { name: 'HKPD Interceptor', length: 47, width: 21, maxSpeed: 560, accel: 430, brake: 760, grip: 7.6, steer: 2.85, mass: 1.35, hp: 190, cabin: [0.18, -0.28], price: 0, level: 99 },
};

/** Factory paints for civilian cars. */
export const CAR_PAINT = ['#e8443a', '#2f6fdf', '#f2f2ee', '#1d1f24', '#f5b82e', '#2fbf9f', '#8a4fd8', '#ff7a3d', '#9aa3ad', '#c9384f', '#3fa1e8', '#e9d8b8'];

/** Model weights for ordinary traffic. */
export const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'van', 'pickup', 'coupe', 'bike', 'muscle', 'sedan', 'pickup'];

/** Units per second to km/h (about nine units to the metre). */
export function toKmh(speed) {
  return Math.round((speed / 9) * 3.6);
}
