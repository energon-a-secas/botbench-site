// The project ladder. Each rung names the hardware it needs, so the page can
// mark which ones your kits can build. `sim` is the simulator setup that
// rehearses it ({ arena, brain: preset id | 'modes' }), or null when the
// project needs something the 2D world cannot model (arms, legs, sound).

export const LEVELS = [
  { n: 1, name: 'First moves', lead: 'One motor, one program, no sensors. The point is the edit, upload, run loop.' },
  { n: 2, name: 'Sensing', lead: 'Read a sensor, react to it. One if statement changes everything.' },
  { n: 3, name: 'Control', lead: 'Smooth reactions instead of jerky ones: proportional control, gyro correction.' },
  { n: 4, name: 'Behaviour', lead: 'Several behaviours and a rule for which one runs. A state machine on the hub.' },
  { n: 5, name: 'Decisions', lead: 'A decider above the behaviours: a laptop bridge asks Jev which mode fits the goal.' },
];

export const PROJECTS = [
  { id: 'spin', level: 1, title: 'Spin, stop, spin back', hub: 'either', needs: { motor: 1 }, sim: null,
    teaches: 'Motor.run_angle and the upload loop.',
    steps: ['Flash Pybricks (Inventor) or boot EV3 MicroPython from the microSD card.', 'Plug one motor in, run it 360 degrees and back.', 'Change the speed and watch what holds and what slips.'] },
  { id: 'square', level: 1, title: 'Drive a square', hub: 'either', needs: { motor: 2 }, sim: null,
    teaches: 'DriveBase.straight and DriveBase.turn, and why wheel diameter and axle track matter.',
    steps: ['Build any two-wheel rover.', 'Measure the tyre and the axle track and enter them in the build.', 'Drive 300 mm and turn 90 degrees, four times. If the square does not close, your measurements are off.'] },
  { id: 'matrix', level: 1, title: 'Countdown on the light matrix', hub: 'inventor', needs: {}, sim: null,
    teaches: 'hub.display and hub.speaker: output with no motors at all.',
    steps: ['Show 5, 4, 3, 2, 1 on the 5x5 matrix.', 'Beep on zero.', 'Make the hub tilt-aware: show an arrow pointing down using hub.imu.'] },
  { id: 'face', level: 1, title: 'A face on the EV3 screen', hub: 'ev3', needs: {}, sim: null,
    teaches: 'ev3.screen and ev3.speaker, plus reading the brick buttons.',
    steps: ['Draw two eyes and a mouth with screen.draw_circle and draw_line.', 'Change the expression when a brick button is pressed.'] },

  { id: 'wall-stop', level: 2, title: 'Stop before the wall', hub: 'either', needs: { motor: 2, distance: 1 }, sim: { arena: 'room', brain: 'bounce' },
    teaches: 'Reading the distance (51515) or IR (31313) sensor in a loop.',
    steps: ['Drive forward until the distance drops below 200 mm, then stop.', 'Then turn instead of stopping: you have built the Bounce preset.', 'On EV3 the IR sensor is relative (0-100): calibrate a value against a ruler.'] },
  { id: 'bumper', level: 2, title: 'Bumper bot', hub: 'ev3', needs: { motor: 2, touch: 1 }, sim: { arena: 'room', brain: 'bumper' },
    teaches: 'Touch sensor as an event, and holding an action for a fixed time.',
    steps: ['Mount the touch sensor at the front with a beam as a bumper.', 'Reverse and turn for under a second when it is pressed.'] },
  { id: 'colours', level: 2, title: 'Say the colour', hub: 'either', needs: { color: 1 }, sim: null,
    teaches: 'ColorSensor.color() versus reflection(), and how lighting changes both.',
    steps: ['Hold coloured bricks under the sensor and print the reading.', 'Speak or display the colour name.', 'Try it near a window and under a lamp: note what breaks.'] },
  { id: 'teleop', level: 2, title: 'Drive it from the browser', hub: 'inventor', needs: { motor: 2 }, sim: null,
    teaches: 'Bluetooth LE from a web page: the Link tab sends one byte per key, the hub turns it into motor speeds and reports what it sees.',
    steps: ['Export the modes program and load it with Pybricks Code once.', 'Disconnect Pybricks Code, open the Link tab, pick Bluetooth hub, Connect, Start program.', 'Click the pad and hold an arrow key; watch the facts change as you drive at a wall.', 'Try the virtual hub first if the robot is not built yet: same tab, no hardware.'] },
  { id: 'line-bang', level: 2, title: 'Line follower, on/off', hub: 'either', needs: { motor: 2, color: 1 }, sim: { arena: 'oval', brain: 'line-bang' },
    teaches: 'The simplest controller there is. It works, and it wobbles.',
    steps: ['Mount the colour sensor facing down, 1-2 studs above a dark line on light paper.', 'Dark: turn one way. Light: turn the other.', 'Find the speed at which it falls off the curve.'] },

  { id: 'line-p', level: 3, title: 'Proportional line follower', hub: 'either', needs: { motor: 2, color: 1 }, sim: { arena: 'oval', brain: 'line-p' },
    teaches: 'Error times gain. The step from reacting to controlling.',
    steps: ['Measure reflection on the line and off it; the target is the midpoint.', 'Steer by (reading - target) x Kp.', 'Raise Kp until it oscillates, then back off by a third. Tune it here first.'] },
  { id: 'gyro-straight', level: 3, title: 'Gyro-straight driving', hub: 'inventor', needs: { motor: 2 }, sim: null,
    teaches: 'The built-in IMU: hub.imu.heading() and DriveBase.use_gyro(True).',
    steps: ['Drive 1 m with and without use_gyro and compare where it lands.', 'Push the robot sideways mid-run and watch it correct.'] },
  { id: 'beacon', level: 3, title: 'Follow the IR beacon', hub: 'ev3', needs: { motor: 2, distance: 1 }, sim: null,
    teaches: 'InfraredSensor.beacon(channel): heading and distance to a moving target.',
    steps: ['Set the beacon to channel 1 and turn it on.', 'Turn toward the heading, drive while the distance is large.'] },

  { id: 'explorer', level: 4, title: 'Line, boxes, goal: a state machine', hub: 'either', needs: { motor: 2, color: 1, distance: 1 }, sim: { arena: 'mixed', brain: 'modes' },
    teaches: 'Modes plus a rule for switching between them, all on the hub.',
    steps: ['Write follow_line, explore, avoid and stop as separate functions.', 'Pick a mode from the facts each loop: blocked means avoid, dark floor means follow.', 'Run the Modes brain here and watch where hand rules get stuck.'] },
  { id: 'sorter', level: 4, title: 'Colour sorter', hub: 'either', needs: { motor: 2, color: 1 }, sim: null,
    teaches: 'A stationary machine: a feeder, a sensor and a flipper in sequence.',
    steps: ['One motor pushes a brick under the sensor.', 'The second motor flips it left or right by colour.', 'Count jams: mechanical problems are most of this project.'] },
  { id: 'gripper', level: 4, title: 'Find it, grab it', hub: 'ev3', needs: { motor: 3, distance: 1 }, sim: null,
    teaches: 'A third motor as a tool, and sequencing approach, grab and retreat.',
    steps: ['Build a GRIPP3R-style claw on the medium motor.', 'Approach until the IR reading is small, close the claw, back away.'] },

  { id: 'jev-modes', level: 5, title: 'Jev picks the mode', hub: 'inventor', needs: { motor: 2, color: 1, distance: 1 }, sim: { arena: 'mixed', brain: 'modes' },
    teaches: 'Keep control loops on the hub and let a typed Choice question pick the behaviour, gated by confidence.',
    steps: ['Export the modes program and the bridge from the Export tab.', 'Rehearse the loop on the Link tab with the stand-in decider: same facts, same bytes, no key.', 'Run the bridge with --dry-run first: it prints the exact request.', 'Add TYPESAFE_API_KEY and give it a goal in plain words.', 'Lower the confidence gate and watch it flip-flop; raise it and watch it commit.'] },
  { id: 'jev-commands', level: 5, title: 'Typed commands in plain words', hub: 'inventor', needs: { motor: 2 }, sim: null,
    teaches: 'Intent routing: a sentence becomes one of a fixed set of actions, or "unclear".',
    steps: ['In the bridge, read a line from the keyboard instead of the hub.', 'Ask a Choice with options like forward, turn_left, dance, stop, unclear.', 'Send the mode byte. Unclear asks again rather than guessing.'] },
  { id: 'two-robots', level: 5, title: 'Two robots, one laptop', hub: 'both', needs: { motor: 4, color: 1, distance: 1 }, sim: null,
    teaches: 'Coordination: the Inventor rover scouts colours, the EV3 acts on what it reports.',
    steps: ['The Inventor Hub reports facts over Bluetooth LE as in the Jev bridge.', 'The EV3 runs ev3dev with Wi-Fi and listens on a socket.', 'The laptop decides who moves. Neither robot needs to know the other exists.'] },
];
