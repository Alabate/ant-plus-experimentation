const Ant = require('ant-plus');

const LOG_LEVEL = 0; // 0 Nothing, 4 Debug
const SPEED_SENSOR_ID = 31098

const stick = new Ant.GarminStick2(LOG_LEVEL);
let speedSensor = new Ant.SpeedSensor(stick);


speedSensor.on('speedData', data => {
  console.log(data);
});


stick.on('startup', function () {
	console.log('startup');
	speedSensor.attach(0, 0);
});

stick.on('attach', function () {
	console.log('attach');
});

stick.on('detached', function () {
	console.log('detached');
});

if (!stick.open()) {
	console.log('Stick not found!');
}


