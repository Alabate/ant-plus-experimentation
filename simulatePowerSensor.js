const Ant = require('ant-plus');

const LOG_LEVEL = 0; // 0 Nothing, 4 Debug
const POWER_SENSOR_ID = 1337

// Init
const stick = new Ant.GarminStick2(LOG_LEVEL);
let powerEmitter = new Ant.BicyclePowerEmitter(stick);

// Stick events
stick.on('startup', function () {
  console.log('Startup');
  powerEmitter.attach(0, POWER_SENSOR_ID);
});
stick.on('attach', function () {
  console.log('Attach');
});
stick.on('detached', function () {
  console.log('Detached');
});

setInterval(() => {
  let power = Math.random()*300;
  console.log('Set power to ', power)
  powerEmitter.setPower(power)
}, 250);


// Start everything!
if (!stick.open()) {
  console.log('Stick not found!');
}


