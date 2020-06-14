/*
* ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
* Spec sheet: https://www.thisisant.com/resources/bicycle-power/
*/

import { AntPlusSensor, AntPlusScanner, Messages } from './ant';

export enum BPConstants {
	// Data page numbers
	DATA_PAGE_CALIBRATION = 0x01,
	DATA_PAGE_GET_SET_PARAMETERS = 0x02,
	DATA_PAGE_MEASUREMENT_OUTPUT = 0x03,
	DATA_PAGE_POWER_ONLY = 0x10,
	DATA_PAGE_WHEEL_TORQUE = 0x11,
	DATA_PAGE_CRANK_TORQUE = 0x12,
	DATA_PAGE_TORQUE_EFFECTIVENESS_PEDAL_SMOOTHNESS = 0x13,
	DATA_PAGE_TORQUE_BARYCENTRE = 0x14,
	DATA_PAGE_CRANK_TORQUE_FREQUENCY = 0x20,
	DATA_PAGE_RIGHT_PEDAL_FORCE_ANGLE = 0xE0,
	DATA_PAGE_LEFT_PEDAL_FORCE_ANGLE = 0xE1,
	DATA_PAGE_PEDAL_POSITION = 0xE2,
}

class BicyclePowerSensorState {
	constructor(deviceID: number) {
		this.DeviceID = deviceID;
	}

	DeviceID: number;
	PedalPower?: number;
	RightPedalPower?: number;
	LeftPedalPower?: number;
	Cadence?: number;
	AccumulatedPower?: number;
	Power?: number;
	offset: number = 0;
	EventCount?: number;
	TimeStamp?: number;
	Slope?: number;
	TorqueTicksStamp?: number;
	CalculatedCadence?: number;
	CalculatedTorque?: number;
	CalculatedPower?: number;
}

class BicyclePowerScanState extends BicyclePowerSensorState {
	Rssi: number;
	Threshold: number;
}

export class BicyclePowerSensor extends AntPlusSensor {
	static deviceType = 0x0B;

	public attach(channel, deviceID): void {
		super.attach(channel, 'receive', deviceID, BicyclePowerSensor.deviceType, 0, 255, 8182);
		this.state = new BicyclePowerSensorState(deviceID);
	}

	private state: BicyclePowerSensorState;

	protected updateState(deviceId, data) {
		this.state.DeviceID = deviceId;
		updateState(this, this.state, data);
	}
}

export class BicyclePowerScanner extends AntPlusScanner {
	protected deviceType() {
		return BicyclePowerSensor.deviceType;
	}

	private states: { [id: number]: BicyclePowerScanState } = {};

	protected createStateIfNew(deviceId) {
		if (!this.states[deviceId]) {
			this.states[deviceId] = new BicyclePowerScanState(deviceId);
		}
	}

	protected updateRssiAndThreshold(deviceId, rssi, threshold) {
		this.states[deviceId].Rssi = rssi;
		this.states[deviceId].Threshold = threshold;
	}

	protected updateState(deviceId, data) {
		updateState(this, this.states[deviceId], data);
	}
}

function updateState(
	sensor: BicyclePowerSensor | BicyclePowerScanner,
	state: BicyclePowerSensorState | BicyclePowerScanState,
	data: Buffer) {

	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	switch (page) {
		case BPConstants.DATA_PAGE_CALIBRATION: {
			const calID = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calID === 0x10) {
				const calParam = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (calParam === 0x01) {
					state.offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case BPConstants.DATA_PAGE_POWER_ONLY: {
			const pedalPower = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			if (pedalPower !== 0xFF) {
				if (pedalPower & 0x80) {
					state.PedalPower = pedalPower & 0x7F;
					state.RightPedalPower = state.PedalPower;
					state.LeftPedalPower = 100 - state.RightPedalPower;
				} else {
					state.PedalPower = pedalPower & 0x7F;
					state.RightPedalPower = undefined;
					state.LeftPedalPower = undefined;
				}
			} else {
				state.PedalPower = undefined;
				state.RightPedalPower = undefined;
				state.LeftPedalPower = undefined;
			}
			const cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (cadence !== 0xFF) {
				state.Cadence = cadence;
			} else {
				state.Cadence = undefined;
			}
			state.AccumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			state.Power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			break;
		}
		case BPConstants.DATA_PAGE_CRANK_TORQUE_FREQUENCY: {
			const oldEventCount = state.EventCount;
			const oldTimeStamp = state.TimeStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state.EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.TimeStamp = timeStamp;
				if (oldTimeStamp > timeStamp) { //Hit rollover value
					timeStamp += 65400;
				}

				state.Slope = slope;
				state.TorqueTicksStamp = torqueTicksStamp;
				if (oldTorqueTicksStamp > torqueTicksStamp) { //Hit rollover value
					torqueTicksStamp += 65535;
				}

				const elapsedTime = (timeStamp - oldTimeStamp) * 0.0005;
				const torqueTicks = torqueTicksStamp - oldTorqueTicksStamp;

				const cadencePeriod = elapsedTime / (eventCount - oldEventCount); // s
				const cadence = Math.round(60 / cadencePeriod); // rpm
				state.CalculatedCadence = cadence;

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.offset; // Hz
				const torque = torqueFrequency / (slope / 10); // Nm
				state.CalculatedTorque = torque;

				state.CalculatedPower = torque * cadence * Math.PI / 30; // Watts
			}
			break;
		}
		default:
			return;
	}
	sensor.emit('powerData', state);
}

// TODO inherit here Messages class to build BicyclePower specific messages
// Expoer des methode de setX, l'utilisateur est censé les appeller le plus souvent possible, dés qu'il a des données
// Les compteurs de donnée seront incrémenté s'il y a changement au moment de l'envoi
// Ils afficheront aussi automatiquement les pages en fonction de ce qui a été configuré

export class BicyclePowerMessages extends Messages {
	
	static powerOnlyDataPage(channel: number, powerEventCount: number, pedalPower: number|null,
		isRightPedal: boolean|null, crankCadence: number|null, accumulatedPower: number,
		power: number): Buffer {
		//console.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>')
		//console.debug('> Message:powerOnlyDataPage')
		let payload: number[] = [];
		payload.push(BPConstants.DATA_PAGE_POWER_ONLY);
		payload.push(powerEventCount);
		if (pedalPower === null) {
			payload.push(0xFF);
		} else {
			if (isRightPedal) {
				payload.push(0x10 | pedalPower);
			} else {
				payload.push(pedalPower);
			}
		}
		if (crankCadence === null) {
			payload.push(0xFF);
		}
		else {
			payload = payload.concat(this.intToLEHexArray(crankCadence))
		}
		payload = payload.concat(this.intToLEHexArray(accumulatedPower, 2));
		payload = payload.concat(this.intToLEHexArray(power, 2));
		return Messages.broadcastData(channel, payload);
	}
}

export class BicyclePowerEmitter extends AntPlusSensor {

	private messageCount: number = 0;
	private powerEventCount: number = 0;
	private power?: number;
	private pedalPower?: number|null;
	private isRightPedal?: boolean|null;
	private crankCadence?: number|null;
	private accumulatedPower: number = 0;

	constructor(stick) {
		super(stick);
		this.txCbk = this.sendData.bind(this);
	}

	public attach(channel, deviceID): void {
		super.attach(channel, 'transmit', deviceID, BicyclePowerSensor.deviceType, 0x05, 255, 8182);
		this.channel = channel;
	}


	/**
	 * Use this setter method if you know the power for each pedal
	 * @param left Power on the left pedal in Watt
	 * @param right Power on the left pedal in Watt
	 * @param crankCadence Optional crank cadence in RPM
	 */
	public setPedalPower(left: number, right: number, crankCadence: (number|null) = null) {
		this.power = Math.round(left+right);
		this.pedalPower = Math.round((right/this.power)*100);
		this.isRightPedal = true;
		this.crankCadence = crankCadence !== null ? Math.round(crankCadence) : crankCadence;

		this.powerEventCount = (this.powerEventCount + 1) % 256;
		this.accumulatedPower = (this.accumulatedPower + this.power) % 65536;
	}

	/**
	 * Use this setter method if you know the power for twi pedals, but don't know their side
	 * @param first Power on the first pedal in Watt
	 * @param second Power on the second pedal in Watt
	 * @param crankCadence Optional crank cadence in RPM
	 */
	public setUnknownPedalPower(first: number, second: number, crankCadence: (number|null) = null) {
		this.power = Math.round(first+second);
		this.pedalPower = Math.round((first/this.power)*100);
		this.isRightPedal = false;
		this.crankCadence = crankCadence !== null ? Math.round(crankCadence) : crankCadence;

		this.powerEventCount = (this.powerEventCount + 1) % 256;
		this.accumulatedPower = (this.accumulatedPower + this.power) % 65536;
	}

	/**
	 * Use this setter method if you have global power
	 * @param power Power measured in Watt
	 * @param cadence Optional crank cadence in RPM
	 */
	public setPower(power: number, crankCadence: (number|null) = null) {
		this.power = Math.round(power);
		this.pedalPower = null;
		this.isRightPedal = null;
		this.crankCadence = crankCadence !== null ? Math.round(crankCadence) : crankCadence;

		this.powerEventCount = (this.powerEventCount + 1) % 256;
		this.accumulatedPower = (this.accumulatedPower + this.power) % 65536;
	}

	/**
	 * Write the next data page to the device and increment counters accordingly
	 */
	private sendData(): void {
		// Don't send anything before the first power set
		if (this.power === undefined) {
			return;
		}

		if (this.messageCount == 60) {
			// Manufacturer’s Information
			// Minimum: Interleave every 121 messages
			this.write(Messages.manufacturersInformationDataPage(this.channel, 0, 0x00FF, 0));
		}
		else if (this.messageCount == 120) {
			// Product Information
			// Minimum: Interleave every 121 messages
			this.write(Messages.productInformationDataPage(this.channel, 1.1, 0))
		}
		else {
			// Standard Power Only
			// Default broadcast message
			this.write(BicyclePowerMessages.powerOnlyDataPage(this.channel, this.powerEventCount, this.pedalPower,
				this.isRightPedal, this.crankCadence, this.accumulatedPower, this.power));
		}
		this.messageCount = (this.messageCount + 1) % 121;
	}

	/** We don't need updateState here but it is abstract */
	protected updateState() {}
}
