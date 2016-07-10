/*This is the CPU for the SNES, right now, it mostly just handles PC/cycle count incrementing and also the instructions*/
var CPU = function() {
	var _this = this;
	//These are ENUMS that are used by the CPU
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

var CARRY_BITMASK = 0x01;
var ZERO_BITMASK = 0x02;
var IRQ_DISABLE_BITMASK = 0x04;
var DECIMAL_MODE_BITMASK = 0x08;
var INDEX_REG_SELECT_BITMASK = 0x10;
var MEM_ACC_SELECT_BITMASK = 0x20;
var OVERFLOW_BITMASK = 0x40;
var NEGATIVE_BITMASK = 0x80;

CPU.prototype.init = function(resetPC) {
	this.pc = resetPC;
}

CPU.prototype.execute = function(instruction, byte1, byte2, byte3) {
	if (this.instructionMap.hasOwnProperty(instruction)) {
		this.instructionMap[instruction].bind(this)(byte1, byte2, byte3);
	} else {
		this.incPCandCC(1, 1);
		console.log("Failed to find an instruction for " + instruction);
	}
}

CPU.prototype.incPCandCC = function(pc_inc, cc_inc) {
	this.pc += 1;
	this.cycleCount += 2;
}

CPU.prototype.instructionMap = {
	//CLC -- Clear Carry
	0x18: function() {
		this.carry = false;
		this.incPCandCC(1, 2);
	},
	//SEI - Set Interrupt Disable Flag
	0x78: function() {
		this.IRQDisabled = true;
		this.incPCandCC(1, 2);
	},
	//REP - Reset Processor Status Bits
	0xC2: function(flagMask) {
		if (CARRY_BITMASK & flagMask) { this.carry = false; }
		if (ZERO_BITMASK & flagMask) { this.isZero = false; }
		if (IRQ_DISABLE_BITMASK & flagMask) { this.IRQDisabled = false; }
		if (DECIMAL_MODE_BITMASK & flagMask) { this.decimalMode = 0; }
		if (INDEX_REG_SELECT_BITMASK & flagMask) { this.indexRegisterSelect = 0; }
		if (MEM_ACC_SELECT_BITMASK & flagMask) { this.memAccSelect = 0; }
		if (OVERFLOW_BITMASK & flagMask) { this.overflow = false; }
		if (NEGATIVE_BITMASK & flagMask) { this.negative = false; }
		this.incPCandCC(2, 3);
	},
	//XCE - Exchange Carry and Emulation Flags
	0xFB: function() {
		var temp = this.isEmulationFlag;
		this.isEmulationFlag = this.carry;
		this.carry = temp;
		this.incPCandCC(1, 2);
	},
};

module.exports = CPU;