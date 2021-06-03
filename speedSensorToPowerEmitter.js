const Ant = require('ant-plus');
const { clearTimeout } = require('timers');

const LOG_LEVEL = 0; // Libusb debug : 0 Nothing, 4 Debug
const SPEED_SENSOR_ID = 31098; // Find it with scanSpees.js
const POWER_SENSOR_ID = 1337; // Random choosen ID
const HOME_TRAINER_LEVEL = 6; // Se this level according to the level on your home trainer
const HOME_TRAINER_POWER_CURVES = {
  // Set here all the measurement points of speed to power.
  // This script will do a linear interpolation between measurements.
  // level: {speed1: power1, speed2: power2}
  // Speed in km/h, power in watt
  1: { 0:0, 10: 25, 20: 61, 30: 110, 40: 164, 50: 231, 60: 300 },
  2: { 0:0, 10: 33, 20: 84, 30: 145, 40: 206, 50: 290, 60: 368 },
  3: { 0:0, 10: 43, 20: 108, 30: 184, 40: 267, 50: 356, 60: 441 },
  4: { 0:0, 10: 55, 20: 142, 30: 240, 40: 342, 50: 449, 60: 548 },
  5: { 0:0, 10: 66, 20: 176, 30: 300, 40: 417, 50: 536, 60: 662 },
  6: { 0:0, 10: 83, 20: 210, 30: 360, 40: 511, 50: 647, 60: 799 },
  7: { 0:0, 10: 95, 20: 267, 30: 435, 40: 605, 50: 776, 60: 958 },
  8: { 0:0, 10: 110, 20: 300, 30: 499, 40: 690, 50: 890, 60: 1080 },
}
const WHEEL_CIRCUMFERENCE = 2.1; // in meter
const ZERO_TIMEOUT = 2000; // Duration without speed data before sending zero power

// Computed consts
const powerCurve = HOME_TRAINER_POWER_CURVES[HOME_TRAINER_LEVEL];

// Utility functions
/**
 * Get the power from speed and speed curve
 * @param {object} curve Object that contains speed (km/h) to power (W) attributes 
 * @param {Number} speed Measured speed in km/h
 * @return {Number} The estimated power
 */
function powerFromSpeedCurve(curve, speed) {
  const curveSpeeds = Object.keys(powerCurve).sort((a,b) => Number(a) - Number(b));
  let infSpeed = null, supSpeed = null;
  for (const iSpeed of curveSpeeds) {
    if (iSpeed <= speed && (infSpeed === null || iSpeed > infSpeed)) {
      infSpeed = iSpeed;
    }
    if (iSpeed >= speed && (supSpeed === null || iSpeed < supSpeed)) {
      supSpeed = iSpeed;
    }
  }

  // if out of curve
  if (infSpeed === null || supSpeed === null) {
    console.error('Speed value is out of curve range')
    return null;
  }

  // if exact speed match (avoid zero division later)
  if (infSpeed == supSpeed) {
    return curve[infSpeed];
  }

  // Compute linear interpolation straight curve (speed*a+b = power)
  const a = (curve[infSpeed] - curve[supSpeed]) / (infSpeed - supSpeed)
  const b = curve[infSpeed] - infSpeed * a
  return speed * a + b
}

// Init
const stick = new Ant.GarminStick2(LOG_LEVEL);
let powerEmitter = new Ant.BicyclePowerEmitter(stick);
let speedSensor = new Ant.SpeedSensor(stick);
speedSensor.setWheelCircumference(WHEEL_CIRCUMFERENCE);

// Stick events
stick.on('startup', function () {
  console.log('Startup');
  speedSensor.attach(0, SPEED_SENSOR_ID);
  powerEmitter.attach(1, POWER_SENSOR_ID);
});
stick.on('attach', function () {
  console.log('Attach');
});
stick.on('detached', function () {
  console.log('Detached');
});

// Speed sensor events
let zeroTimeout = null;
speedSensor.on('speedData', data => {
  if (zeroTimeout) {
    clearTimeout(zeroTimeout)
  }

  if (data.CalculatedSpeed) {
    const kmphSpeed = data.CalculatedSpeed * 3.6 // Convert m/s to km/h
    const power = powerFromSpeedCurve(powerCurve, kmphSpeed)
    powerEmitter.setPower(power)
    console.log('------------------')
    console.log('Speed (km/h)', Math.round(kmphSpeed*100)/100)
    console.log('Power (W)', Math.round(power))
    console.log('------------------')

    // Avoid sending power when there is no speed data anymore
    zeroTimeout = setTimeout(() => {
      powerEmitter.setPower(0)
      console.log('------------------')
      console.log('No speed timeout!')
      console.log('Speed (km/h)', '?')
      console.log('Power (W)', 0)
      console.log('------------------')
    }, ZERO_TIMEOUT);
  }
  else {
    console.log('Data received but no speed calculated yet..')
  }
});

// Start everything!
if (!stick.open()) {
  console.log('Stick not found!');
}


