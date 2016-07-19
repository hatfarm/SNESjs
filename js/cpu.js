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
var Instructions = require('./instructions.js');
//These are ENUMS that are used by the CPU

var DECIMAL_MODES = utils.DECIMAL_MODES;
var BIT_SELECT = utils.BIT_SELECT;

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
	this.accumSizeSelect = BIT_SELECT.BIT_16;
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

CPU.prototype.init = function(resetPC, memory) {
	this.pc = resetPC;
	this.instructionList = new Instructions(this);
	this.memory = memory;
}

CPU.prototype.execute = function(cycles) {
	//We gain back our excess cycles this loop.
	var cyclesLeft = cycles + this.excessCycleTime;
	this.excessCycleTime = 0;
	while(cyclesLeft > 0) {
		var instructionVal = this.memory.getByteAtLocation(this.pbr, this.pc);
		var logString = "PC: 0x" + this.pc.toString(16) + " -- Instruction: 0x" + instructionVal.toString(16) + "...";
		
		//if (this.instructionMap.hasOwnProperty(instructionVal)) {
			
			var instruction = this.instructionList[instructionVal]();
			if(instruction.CPUCycleCount <= cyclesLeft) {
				this.incPC(instruction.size);
				cyclesLeft -= instruction.CPUCycleCount;
				//This needs to be last, because we have to update the PC in some instructions
				instruction.func();
			} else {
				this.excessCycleTime = cyclesLeft;
				cyclesLeft = 0;
			}
		/*} else {
			logString += "\tFAILED TO EXECUTE!";
			throw logString;
			
		}*/
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

CPU.prototype.updateNegativeFlag = function(val, sizeSelector) {
	var accMask = this.isEmulationFlag || sizeSelector === BIT_SELECT.BIT_8 ? 0x80 : 0x8000
	this.setNegativeFlag((val < 0) || !!(val & accMask));
	
};

CPU.prototype.setDecimalMode = function(val) {
	this.decimalMode = val;
	this.logger.log("Decimal Mode: " + this.decimalMode === DECIMAL_MODES.DECIMAL ? "DECIMAL" : "BINARY");
	this.logger.log(`Decimal Mode: ${this.decimalMode === DECIMAL_MODES.DECIMAL ? "DECIMAL" : "BINARY"}`);
};

CPU.prototype.setIndexRegisterSelect = function(val) {
	this.indexRegisterSelect = val;
	this.logger.log(`Index Register Size: ${this.accumSizeSelect === BIT_SELECT.BIT_16 ? "16 bits" : "8 bits"}`);
}

CPU.prototype.setMemoryAccumulatorSelect = function(val) {
	this.accumSizeSelect = val;
	this.logger.log(`Memory/Accumulator Size: ${this.accumSizeSelect === BIT_SELECT.BIT_16 ? "16 bits" : "8 bits"}`);
};

CPU.prototype.setCarryFlag = function(val) {
	this.carry = val;
	this.logger.log("Carry Flag: " + this.carry);
};

CPU.prototype.updateAdditionCarryFlag = function(val, registerSizeSelect) {
	var maxVal = registerSizeSelect === BIT_SELECT.BIT_16 ? 0xFFFF : 0xFF
	this.setCarryFlag(val > maxVal);
};

CPU.prototype.updateSubtractionCarryFlag = function(val) {
	this.setCarryFlag(val >= 0);
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

CPU.prototype.updateZeroFlag = function(val) {
	this.setZeroFlag(val === 0);
	
};

CPU.prototype.setAccumulator = function(val) {
	this.logger.log("Accumulator: " + val.toString(16));
	this.accumulator = val;
};

CPU.prototype.doComparison = function(operandVal, registerVal, registerSizeSelect) {
	var result = registerVal - operandVal;
	this.updateZeroFlag(result);
	this.updateNegativeFlag(result, registerSizeSelect);
	this.updateSubtractionCarryFlag(result);
};

module.exports = CPU;