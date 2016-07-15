/*********************************************************************
The MIT License (MIT)

Copyright (c) 2015 hatfarm

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Super NES and Super Nintendo Entertainment System are trademarks of
  Nintendo Co., Limited and its subsidiary companies.
**********************************************************************/
var utils = require('./utils.js');
var Logger = require('./logger.js');
var Timing = require('./timing.js');
//These are ENUMS that are used by the CPU
var DECIMAL_MODES = {
	BINARY:  false,
	DECIMAL: true,
};
var BIT_SELECT = {
	BIT_16: false,
	BIT_8:  true,
};

/*Most of the information here is from http://wiki.superfamicom.org/snes/show/65816+Reference*/
/*This is the CPU for the SNES, right now, it mostly just handles PC/cycle count incrementing and also the instructions*/
var CPU = function() {
	var _this = this;
	
	//These are flags, some make more sense than others as boolean, but technically they all could be
	//These are technically stored in the P (Processor status) register
	this.isEmulationFlag = true; //The SNES always resets into emulation mode
	this.carry = false;
	this.isZero = false;
	this.IRQDisabled = false;
	this.decimalMode = DECIMAL_MODES.BINARY;
	this.indexRegisterSelect = BIT_SELECT.BIT_16;
	this.memAccSelect = BIT_SELECT.BIT_16;
	this.overflow = false;
	this.negative = false;
	
	//Registers
	this.pc = 0; //Program Counter, the index of the next instruction
	this.pbr = 0;//Program Bank register, the memory bank address of instruction fetches
	this.dbr = 0; //Data bank register, the default bank for memory transfers
	this.dpr = 0; //Direct Page register, holds the memory bank address of the data the CPU is accessing during direct addressing instructions
	this.accumulator = 0; //The accumulator, used in math
	//Index registers, general purpose
	this.indexX = 0;
	this.indexY = 0;
	
	//Arrays in JS have stack functionality built in.
	this.stack = [];
	
	//The memory used by the system
	this.memory;
	
	//Used for debug logginc
	this.logger = new Logger();
	
	/*Used for timing our cycles, when we have a number of cycles left to execute, but can't execute the next command in that time, 
		we'll use this value to reclaim that cycle time in the next loop.*/
	this.excessCycleTime = 0;
};

CPU.prototype.getPC = function(){
	return this.pc;
}

CPU.prototype.getPB = function() {
	return this.pbr;
}

var CARRY_BITMASK = 0x01;
var ZERO_BITMASK = 0x02;
var IRQ_DISABLE_BITMASK = 0x04;
var DECIMAL_MODE_BITMASK = 0x08;
var INDEX_REG_SELECT_BITMASK = 0x10;
var MEM_ACC_SELECT_BITMASK = 0x20;
var OVERFLOW_BITMASK = 0x40;
var NEGATIVE_BITMASK = 0x80;

CPU.prototype.init = function(resetPC, memory) {
	this.pc = resetPC;
	this.memory = memory;
}

CPU.prototype.execute = function(cycles) {
	//We gain back our excess cycles this loop.
	var cyclesLeft = cycles + this.excessCycleTime;
	this.excessCycleTime = 0;
	while(cyclesLeft > 0) {
		var instructionVal = this.memory.getValAtLocation(this.pbr, this.pc);
		var byte1 = this.memory.getValAtLocation(this.pbr, this.pc + 1);
		var byte2 = this.memory.getValAtLocation(this.pbr, this.pc + 2);
		var byte3 = this.memory.getValAtLocation(this.pbr, this.pc + 3);
		var logString = "PC: 0x" + this.pc.toString(16) + " -- Instruction: 0x" + instructionVal.toString(16) + "...";
		
		if (this.instructionMap.hasOwnProperty(instructionVal)) {
			
			var instruction = this.instructionMap[instructionVal];
			if(instruction.CPUCycleCount <= cyclesLeft) {
				this.incPC(instruction.size);
				cyclesLeft -= instruction.CPUCycleCount;
				//This needs to be last, because we have to update the PC in some instructions
				instruction.func.bind(this)(byte1, byte2, byte3);
			} else {
				this.excessCycleTime = cyclesLeft;
				cyclesLeft = 0;
			}
		} else {
			logString += "\tFAILED TO EXECUTE!";
			throw logString;
			
		}
		this.logger.log(logString);
		this.logger.log("============================");
	}
}

CPU.prototype.incPC = function(pc_inc) {
	this.pc += pc_inc;
}

CPU.prototype.setOverflowFlag = function(val) {
	this.overflow = val;
	this.logger.log("Overflow Flag: " + this.overflow);
};

CPU.prototype.setNegativeFlag = function(val) {
	this.negative = val;
	this.logger.log("Negative Flag: " + this.negative);
};

CPU.prototype.updateNegativeFlag = function() {
	var accMask = this.isEmulationFlag || this.memAccSelect === BIT_SELECT.BIT_8 ? 0x80 : 0x8000
	this.setNegativeFlag((this.accumulator < 0) || !!(this.accumulator & accMask));
	
};

CPU.prototype.setDecimalMode = function(val) {
	this.decimalMode = val;
	this.logger.log("Decimal Mode: " + this.decimalMode === DECIMAL_MODES.DECIMAL ? "DECIMAL" : "BINARY");
	this.logger.log(`Decimal Mode: ${this.decimalMode === DECIMAL_MODES.DECIMAL ? "DECIMAL" : "BINARY"}`);
};

CPU.prototype.setIndexRegisterSelect = function(val) {
	this.indexRegisterSelect = val;
	this.logger.log(`Index Register Size: ${this.memAccSelect === BIT_SELECT.BIT_16 ? "16 bits" : "8 bits"}`);
}

CPU.prototype.setMemoryAccumulatorSelect = function(val) {
	this.memAccSelect = val;
	this.logger.log(`Memory/Accumulator Size: ${this.memAccSelect === BIT_SELECT.BIT_16 ? "16 bits" : "8 bits"}`);
};

CPU.prototype.setCarryFlag = function(val) {
	this.carry = val;
	this.logger.log("Carry Flag: " + this.carry);
};

CPU.prototype.setIRQDisabledFlag = function(val) {
	this.IRQDisabled = val;
	this.logger.log("IRQ Disabled Flag: " + this.IRQDisabled);
};

CPU.prototype.setEmulationFlag = function(val) {
	this.isEmulationFlag = val;
	this.logger.log("Emulation Flag: " + this.isEmulationFlag);
}

CPU.prototype.setZeroFlag = function(val) {
	this.isZero = val;
	this.logger.log("Zero Flag: " + this.isZero);
};

CPU.prototype.updateZeroFlag = function() {
	this.setZeroFlag(this.accumulator === 0);
	
};

CPU.prototype.setAccumulator = function(val) {
	this.logger.log("Accumulator: " + val.toString(16));
	this.accumulator = val;
};

/*Direct Indexed Indirect ((_dp,_X)) addressing is often referred to as Indirect X addressing. The second byte
of the instruction is added to the sum of the Direct Register and the X Index Register. The result points
to the X low-order 16 bits of the effective address. The Data Bank Register contains the high-order 8
bits of the effective address. */
CPU.prototype.instructionMap = {
	//BRK -- Break
	0x0: {
			size: 2,
			CPUCycleCount: Timing.FAST_CPU_CYCLE,
			func: function() {
				//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
			},
	},
	//CLC -- Clear Carry
	0x18: {
		size: 1,
		CPUCycleCount: Timing.FAST_CPU_CYCLE,
		func: function() {
			this.setCarryFlag(false);
		}
	},
	//AND (_dp,_X) - AND accumulator with memory (direct indexed)
	0x21: {
			size: 2,
			CPUCycleCount: getMemAccessCycleTime(this.dbr, this.indexX + this.dpr + byte1).cycles,
			func: function(byte1) {
				var memResult = this.memory.getValAtLocation(this.dbr, this.indexX + this.dpr + byte1);
				this.setAccumulator(this.accumulator & memResult.val);
				this.updateNegativeFlag();
				this.updateZeroFlag();
			}
	},
	//PHK - Push Program Bank Register
	0x4B: {
			size: 1,
			CPUCycleCount: Timing.FAST_CPU_CYCLE,
			func: function() {
			this.stack.push(this.pc);
		}
	},
	//JMP addr - Jump to address (immediate)
	0x4c: {
		size: 3,
		CPUCycleCount: 3,
		func: function(lsb, msb) {
			this.pc = utils.get2ByteValue(msb,lsb);
		}
	},
	
	//SEI - Set Interrupt Disable Flag
	0x78: {
		size: 1,
		CPUCycleCount: 2,
		func: function() {
			this.setIRQDisabledFlag(true);
		}
	},
	//STA addr - Store Accumulator to Memory
	0x8D: {
		size: 3,
		CPUCycleCount: 4,
		func: function(lsb, msb) {
			this.memory.setROMProtectedValAtLocation(this.pbr, utils.get2ByteValue(msb,lsb), this.accumulator);
		}
	},
	//STA long - Store Accumulator to Memory, specific address
	0x8F: {
		size: 4,
		CPUCycleCount: 5,
		func: function(bank, lsbAddr, msbAddr) {
			this.memory.setROMProtectedValAtLocation(bank, utils.get2ByteValue(msbAddr,lsbAddr), this.accumulator);
		}
	},
	//STZ - Store Zero to Memory
	0x9C: {
		size: 3,
		CPUCycleCount: 4,
		func: function(lsb, msb) {
			this.memory.setROMProtectedValAtLocation(this.pbr, utils.get2ByteValue(msb,lsb), 0);
		}
	},
	//PLB - Pull Data Bank Register
	0xAB: {
		size: 1,
		CPUCycleCount: 4,
		func: function() {
			this.dbr = this.stack.pop();
		}
	},
	//LDA #const - Load Accumulator with const
	0xA9: {
		size: 2,
		CPUCycleCount: 2,
		func: function(newVal) {
			this.setAccumulator(newVal);
			this.updateNegativeFlag();
			this.updateZeroFlag();
		}
	},
	//REP - Reset Processor Status Bits
	0xC2: {
		size: 2,
		CPUCycleCount: 3,
		func: function(flagMask) {
			if (CARRY_BITMASK & flagMask) { this.setCarryFlag(false); }
			if (ZERO_BITMASK & flagMask) { this.setZeroFlag(false); }
			if (IRQ_DISABLE_BITMASK & flagMask) { this.setIRQDisabledFlag(false); }
			if (DECIMAL_MODE_BITMASK & flagMask) { this.setDecimalMode(DECIMAL_MODES.BINARY); }
			if (INDEX_REG_SELECT_BITMASK & flagMask) { this.setIndexRegisterSelect(BIT_SELECT.BIT_16); }
			if (MEM_ACC_SELECT_BITMASK & flagMask) { this.setMemoryAccumulatorSelect(BIT_SELECT.BIT_16); }
			if (OVERFLOW_BITMASK & flagMask) { this.setOverflowFlag(false); }
			if (NEGATIVE_BITMASK & flagMask) { this.setNegativeFlag(false); }
		}
	},
	//SEP - Set Processor Status Bits
	0xE2: {
		size: 2,
		CPUCycleCount: 3,
		func: function(flagMask) {
			if (CARRY_BITMASK & flagMask) { this.setCarryFlag(true); }
			if (ZERO_BITMASK & flagMask) { this.setZeroFlag(true); }
			if (IRQ_DISABLE_BITMASK & flagMask) { this.setIRQDisabledFlag(true); }
			if (DECIMAL_MODE_BITMASK & flagMask) { this.setDecimalMode(DECIMAL_MODES.DECIMAL); }
			if (INDEX_REG_SELECT_BITMASK & flagMask) { this.setIndexRegisterSelect(BIT_SELECT.BIT_8); }
			if (MEM_ACC_SELECT_BITMASK & flagMask) { this.setMemoryAccumulatorSelect(BIT_SELECT.BIT_8); }
			if (OVERFLOW_BITMASK & flagMask) { this.setOverflowFlag(true); }
			if (NEGATIVE_BITMASK & flagMask) { this.setNegativeFlag(true); }
		}
	},
	//XCE - Exchange Carry and Emulation Flags
	0xFB: {
		size: 1,
		CPUCycleCount: 2,
		func: function() {
			var temp = this.isEmulationFlag;
			this.setEmulationFlag(this.carry);
			this.carry = temp;
		}
	},
};

module.exports = CPU;