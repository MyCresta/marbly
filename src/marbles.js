export const MARBLE_RADIUS = 0.0125;

export const MARBLE_TYPES = [
  {
    id: 'catseye',
    name: "Cat's Eye",
    substance: 'Soda-lime glass',
    density: 2500,
    friction: 0.32,
    restitution: 0.55,
    swatch: '#7fc4d8',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    substance: 'Opaque art glass',
    density: 2600,
    friction: 0.34,
    restitution: 0.5,
    swatch: '#e98a5c',
  },
  {
    id: 'acrylic',
    name: 'Acrylic',
    substance: 'Cast PMMA',
    density: 1180,
    friction: 0.4,
    restitution: 0.6,
    swatch: '#f2b8cc',
  },
  {
    id: 'oak',
    name: 'Oak',
    substance: 'Turned white oak',
    density: 750,
    friction: 0.5,
    restitution: 0.38,
    swatch: '#b88a57',
  },
  {
    id: 'rubber',
    name: 'Super Ball',
    substance: 'Polybutadiene rubber',
    density: 1150,
    friction: 0.85,
    restitution: 0.82,
    swatch: '#d24b4b',
  },
  {
    id: 'steel',
    name: 'Chrome Steel',
    substance: 'Bearing steel',
    density: 7850,
    friction: 0.22,
    restitution: 0.62,
    swatch: '#c9ced4',
  },
  {
    id: 'brass',
    name: 'Brass',
    substance: 'C360 brass',
    density: 8500,
    friction: 0.26,
    restitution: 0.55,
    swatch: '#d8ad5b',
  },
  {
    id: 'copper',
    name: 'Copper',
    substance: 'Oxygen-free copper',
    density: 8960,
    friction: 0.28,
    restitution: 0.5,
    swatch: '#c87451',
  },
  {
    id: 'tungsten',
    name: 'Tungsten',
    substance: 'Tungsten carbide',
    density: 19300,
    friction: 0.22,
    restitution: 0.6,
    swatch: '#5c6068',
  },
];

export function densityClass(density) {
  if (density < 1600) return 'light';
  if (density < 5000) return 'medium';
  return 'heavy';
}
