// Hardware facts for the two kits. Everything the planner, simulator and
// exporter know about a device comes from here, so a correction is one edit.
//
// family: the connector system. LPF2 (Powered Up, used by 51515) and EV3
// (RJ12-style, used by 31313) are physically incompatible: no device from one
// kit plugs into the other kit's hub without third-party adapters.

export const HUBS = {
  inventor: {
    id: 'inventor',
    name: 'Robot Inventor Hub',
    kit: '51515',
    family: 'LPF2',
    // Six ports, each takes a motor or a sensor.
    ports: ['A', 'B', 'C', 'D', 'E', 'F'],
    portKind: { A: 'any', B: 'any', C: 'any', D: 'any', E: 'any', F: 'any' },
    builtIn: ['6-axis IMU (gyro + accelerometer)', '5x5 light matrix', 'Speaker', 'Bluetooth LE', 'Rechargeable battery'],
    pybricksHub: 'InventorHub',
    pybricksDevices: 'pybricks.pupdevices',
  },
  ev3: {
    id: 'ev3',
    name: 'EV3 Intelligent Brick',
    kit: '31313',
    family: 'EV3',
    // Motor ports A-D, sensor ports 1-4. They are not interchangeable.
    ports: ['A', 'B', 'C', 'D', 'S1', 'S2', 'S3', 'S4'],
    portKind: { A: 'motor', B: 'motor', C: 'motor', D: 'motor', S1: 'sensor', S2: 'sensor', S3: 'sensor', S4: 'sensor' },
    builtIn: ['178x128 mono display', 'Speaker', 'Six buttons', 'Bluetooth classic', 'USB host + microSD slot', '6 AA batteries'],
    pybricksHub: 'EV3Brick',
    pybricksDevices: 'pybricks.ev3devices',
  },
};

// kind: motor | sensor. sense: what the simulator reads from it.
export const DEVICES = {
  'medium-angular': {
    name: 'Medium Angular Motor', kit: '51515', family: 'LPF2', kind: 'motor',
    note: 'Absolute position sensing, the drive motor of every 51515 model.',
    pybricks: 'Motor',
  },
  'distance': {
    name: 'Distance Sensor', kit: '51515', family: 'LPF2', kind: 'sensor', sense: 'distance',
    note: 'Ultrasonic, returns millimetres. Pybricks reports 2000 when nothing is in range. The four eye LEDs are programmable.',
    pybricks: 'UltrasonicSensor', rangeMm: 2000,
  },
  'color-lpf2': {
    name: 'Color Sensor', kit: '51515', family: 'LPF2', kind: 'sensor', sense: 'color',
    note: 'Reflected light (0-100), ambient light and colour. Mount it 1-2 studs above the floor for line following.',
    pybricks: 'ColorSensor',
  },
  'large-ev3': {
    name: 'EV3 Large Motor', kit: '31313', family: 'EV3', kind: 'motor',
    note: 'High torque, the usual drive motor on EV3 rovers.',
    pybricks: 'Motor',
  },
  'medium-ev3': {
    name: 'EV3 Medium Motor', kit: '31313', family: 'EV3', kind: 'motor',
    note: 'Faster and lighter. Grippers, turrets and arms.',
    pybricks: 'Motor',
  },
  'touch-ev3': {
    name: 'EV3 Touch Sensor', kit: '31313', family: 'EV3', kind: 'sensor', sense: 'touch',
    note: 'A push button. Good as a bumper or a limit switch.',
    pybricks: 'TouchSensor',
  },
  'color-ev3': {
    name: 'EV3 Color Sensor', kit: '31313', family: 'EV3', kind: 'sensor', sense: 'color',
    note: 'Reflected light (0-100), ambient light and seven colours.',
    pybricks: 'ColorSensor',
  },
  'ir-ev3': {
    name: 'EV3 Infrared Sensor', kit: '31313', family: 'EV3', kind: 'sensor', sense: 'distance',
    note: 'Relative proximity 0-100 (roughly 70 cm at 100), plus beacon heading and remote buttons.',
    pybricks: 'InfraredSensor', rangeMm: 700,
  },
};

// Kit ids look like integers, so object key order would sort 31313 first.
export const KIT_ORDER = ['51515', '31313'];

// What comes in the box. The IR Beacon is a remote, not a hub device, so it
// is listed as an accessory rather than in the device inventory.
export const KITS = {
  '51515': {
    id: '51515', name: 'Robot Inventor', year: 2020, pieces: 949, hub: 'inventor',
    devices: { 'medium-angular': 4, 'distance': 1, 'color-lpf2': 1 },
    accessories: [],
    models: ['Blast', 'Charlie', 'Tricky', 'Gelo', 'M.V.P.'],
  },
  '31313': {
    id: '31313', name: 'EV3 Home Edition', year: 2013, pieces: 601, hub: 'ev3',
    devices: { 'large-ev3': 2, 'medium-ev3': 1, 'touch-ev3': 1, 'color-ev3': 1, 'ir-ev3': 1 },
    accessories: ['IR Beacon (remote control)'],
    models: ['EV3RSTORM', 'GRIPP3R', 'R3PTAR', 'SPIK3R', 'TRACK3R'],
  },
};

// Chassis archetypes: what each needs, so the planner can say which are
// buildable from the devices assigned and which are one part short.
export const ARCHETYPES = [
  { id: 'rover', name: 'Two-wheel rover', needs: { motor: 2 }, sims: true,
    desc: 'Differential drive. The base for almost every project here.' },
  { id: 'line-rover', name: 'Line follower', needs: { motor: 2, color: 1 }, sims: true,
    desc: 'Rover with a colour sensor facing down, just ahead of the wheels.' },
  { id: 'scout', name: 'Obstacle scout', needs: { motor: 2, distance: 1 }, sims: true,
    desc: 'Rover with a distance or IR sensor facing forward.' },
  { id: 'bumper', name: 'Bumper bot', needs: { motor: 2, touch: 1 }, sims: true,
    desc: 'Rover that reverses when the front touch sensor is pressed.' },
  { id: 'explorer', name: 'Full explorer', needs: { motor: 2, color: 1, distance: 1 }, sims: true,
    desc: 'Sees the floor and what is ahead. Needed for mode switching.' },
  { id: 'gripper', name: 'Rover with gripper', needs: { motor: 3 }, sims: false,
    desc: 'A third motor opens and closes a claw or lifts a fork.' },
  { id: 'sorter', name: 'Colour sorter', needs: { motor: 2, color: 1 }, sims: false,
    desc: 'Stationary: one motor feeds, one motor flips, the sensor decides.' },
  { id: 'walker', name: 'Four-leg walker', needs: { motor: 4 }, sims: false,
    desc: 'One motor per leg pair or per leg. Gait timing is the puzzle.' },
];

// Ways to program each hub. "maintained" is the honest state as far as the
// project knows; check the linked docs before flashing anything.
// Checked against the Pybricks firmware changelog, release assets and LEGO's
// help pages on 2026-11-03; the sources themselves disagree in places, so
// the dates are the evidence, not the marketing pages.
export const FIRMWARE = [
  { id: 'pybricks-inventor', hub: 'inventor', name: 'Pybricks 4.x (MicroPython)', maintained: true,
    how: 'Flash from code.pybricks.com in Chrome or Edge over Bluetooth. Reversible: the LEGO firmware can be restored. Python is free; block coding needs a paid licence.',
    url: 'https://pybricks.com/' },
  { id: 'lego-inventor', hub: 'inventor', name: 'LEGO Robot Inventor app', maintained: false,
    how: 'Gone. LEGO\'s help page says the set no longer has its own app and points to the SPIKE app, which gets no new features after June 2026 and support only until June 2031. Not a path to build on.',
    url: 'https://www.lego.com/en-gb/service/help-topics/article/about-mindstorms-robot-inventor' },
  { id: 'pybricks-ev3', hub: 'ev3', name: 'Pybricks 4.x on the EV3 (native firmware)', maintained: true,
    how: 'Since 4.0.0 (June 2026) the Pybricks firmware runs on the brick itself: plug in USB, hold Right and press Centre for update mode, then Install Pybricks Firmware in the Pybricks web app. No microSD card. Programs reach it over USB, and over Bluetooth Classic since 4.1. The LEGO firmware can be restored.',
    url: 'https://pybricks.com/project/saving-lego-mindstorms/' },
  { id: 'ev3-micropython-2', hub: 'ev3', name: 'EV3 MicroPython 2.0 (ev3dev-based, legacy)', maintained: false,
    how: 'The older microSD image from LEGO Education, programmed from VS Code. Pybricks dropped ev3dev support in 4.0; the Pybricks ports of the box models still target this API, so they are the reason to keep it around.',
    url: 'https://education.lego.com/en-us/product-resources/mindstorms-ev3/teacher-resources/python-for-ev3/' },
  { id: 'ev3dev', hub: 'ev3', name: 'ev3dev (Debian Linux, any language)', maintained: false,
    how: 'Full Linux on a microSD card: Python 3, SSH, Wi-Fi with a supported USB dongle. Still the only way to put Wi-Fi on the brick, but its last release is from April 2020 and its news stopped the same year.',
    url: 'https://www.ev3dev.org/' },
  { id: 'lego-ev3', hub: 'ev3', name: 'Stock firmware (EV3 graphical blocks)', maintained: false,
    how: 'What the brick shipped with. LEGO says the home edition software is no longer available; the classroom app was announced as downloadable until July 2026.',
    url: 'https://www.lego.com/en-us/service/help-topics/article/lego-mindstorms-ev3-troubleshooting-help' },
];

// Extra hardware by path. cost is a rough band, not a quote.
export const EXTRAS = [
  { id: 'none', path: 'Simulate and program the Inventor Hub', items: [
    { name: 'A computer with Chrome or Edge and Bluetooth LE', cost: 'have it', why: 'Pybricks Code runs in the browser and flashes over Web Bluetooth; the Link tab here uses the same radio.' },
  ]},
  { id: 'ev3-usb', path: 'Program the EV3 in Python', items: [
    { name: 'Mini-USB cable (in the box)', cost: 'have it', why: 'Pybricks 4 installs and connects over USB. Bluetooth Classic works from 4.1, after pairing.' },
    { name: 'microSD card, 4 to 32 GB (SDHC, not SDXC)', cost: '$5-10', why: 'Only for the legacy paths: EV3 MicroPython 2.0 and ev3dev boot from it; the brick does not read SDXC.' },
    { name: 'USB Wi-Fi dongle on the ev3dev supported list', cost: '$10-15', why: 'Only with ev3dev, to SSH in or let the brick reach the network itself.' },
    { name: 'Rechargeable AA cells or the EV3 battery pack', cost: '$15-60', why: 'Six AA last a short session; a laptop-coordinated robot runs for longer.' },
  ]},
  { id: 'jev', path: 'Add a Jev decision layer', items: [
    { name: 'A laptop or Raspberry Pi running the bridge script', cost: 'have it / $50-80', why: 'Jev has no browser or on-hub client; the API key must live on a machine you control.' },
    { name: 'A TypeSafe API key', cost: 'usage-billed, no free tier', why: 'Billed on input tokens only. One decision per second is a few hundred tokens each.' },
  ]},
  { id: 'pi', path: 'Drive the 51515 parts from a Raspberry Pi', items: [
    { name: 'Raspberry Pi 4 or 5 on Raspberry Pi OS Bookworm', cost: '$50-80', why: 'Runs the bridge and the robot program on one board. The HAT library is not yet on Trixie.' },
    { name: 'Raspberry Pi Build HAT', cost: '$25-30', why: 'Drives the LPF2 motors and sensors from the 51515 box directly: four ports, where the hub has six. Not for EV3 parts.' },
    { name: '8 V barrel power supply (the Build HAT one)', cost: '$15', why: 'Motors draw more than the Pi can supply; the docs say 8 V plus or minus 10 percent, the projects use 7.5 V.' },
  ]},
];
