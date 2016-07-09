var Processor = function() {
	var _this = this;
	//These are ENUMS that are used by the processor
	var DECIMAL_MODES = {
		BINARY:  0,
		DECIMAL: 1,
	};
	var BIT_SELECT = {
		BIT_16: 0,
		BIT_8:  1,
	};
	//These are flags, some make more sense than others as boolean, but technically they all could be
	this.isEmulationFlag = true; //The SNES always resets into emulation mode
	this.carry = false;
	this.isZero = false;
	this.IRQDisabled = false;
	this.decimalMode = DECIMAL_MODES.BINARY;
	this.indexRegisterSelect = BIT_SELECT.BIT_16;
	this.memAccSelect = BIT_SELECT.BIT_16;
	this.overflow = false;
	this.negative = false;
	this.pc = 0;
	this.cycleCount = 0;
};

Processor.prototype.init = function(resetPC) {
	this.pc = resetPC;
}

Processor.prototype.CLC = function() {
	this.carry = false;
	this.pc += 1;
	this.cycleCount += 2;
}

Processor.prototype.XCE = function() {
	var temp = this.isEmulationFlag;
	this.isEmulationFlag = this.carry;
	this.carry = temp;
	this.pc += 1;
	this.cycleCount += 2;
}

Processor.prototype.SEI = function() {
	this.IRQDisabled = true;
	this.pc += 1;
	this.cycleCount += 2;
}

Processor.prototype.execute = function(instruction, byte1, byte2, byte3) {
	switch(instruction) {
		case 0x18:
			this.CLC();
			break;
		case 0x78:
			this.SEI();
			break;
		case 0xFB:
			this.XCE();
			break;
		default:
			this.pc += 1;
			this.cycleCount += 1;
			break;
	}
}

module.exports = Processor;