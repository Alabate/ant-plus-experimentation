'use strict';

const Ant = require('ant-plus');
const stick = new Ant.GarminStick2();

const speedScanner = new Ant.SpeedScanner(stick);
speedScanner.on('speedData', data => {
	console.log(`id: ${data.DeviceID}`);
	console.dir(data);
});
speedScanner.on('attached', () => {
	console.log('Attached')
});
speedScanner.on('detached', () => {
	console.log('detached')
});

stick.on('startup', function() {
	console.log('startup');
	speedScanner.scan();
});

if (!stick.open()) {
	console.log('Stick not found!');
}