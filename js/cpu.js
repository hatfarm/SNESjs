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
/*jshint esversion: 6 */
var utils = require('./utils.js');
var Logger = require('./logger.js');
var Instructions = require('./instructions.js');
var Stack = require('./stack.js');
//These are ENUMS that are used by the CPU

var DECIMAL_MODES = utils.DECIMAL_MODES;
var BIT_SELECT = utils.BIT_SELECT;
var ACCUMULATOR_BUFFER_OFFSET = 0;
var INDEX_X_BUFFER_OFFSET = 2;
var INDEX_Y_BUFFER_OFFSET = 4;
var HELPER_BUFFER_OFFSET = 6;	//A 32 bit buffer that we'll use to make some math easier
var LITTLE_ENDIAN_TYPED_ARRAYS_FLAG = true;

/*Most of the information here is from http://wiki.superfamicom.org/snes/show/65816+Reference*/
/*This is the CPU for the SNES, it mostly just handles PC/cycle count incrementing and also the instructions*/
var CPU = function() {
	"use strict";
	var _this = this;
	
	var buffer = new ArrayBuffer(10);
	var registerDV = new DataView(buffer);
	
	var accumulator = 0;
	
	//These are flags, some make more sense than others as boolean, but technically they all could be
	//These are technically stored in the P (Processor status) register
	this.isEmulationFlag = true; //The SNES always resets into emulation mode
	this.carry = false;
	this.isZero = false;
	this.IRQDisabled = false;
	this.decimalMode = DECIMAL_MODES.BINARY;
	this.indexRegisterSelect = BIT_SELECT.BIT_8;
	this.accumSizeSelect = BIT_SELECT.BIT_8;
	this.overflow = false;
	this.negative = false;
	
	//Registers
	this.pc = 0; //Program Counter, the index of the next instruction
	this.pbr = 0;//Program Bank register, the memory bank address of instruction fetches
	this.dbr = 0; //Data bank register, the default bank for memory transfers
	var dpr = 0; //Direct Page register, holds the memory bank address of the data the CPU is accessing during direct addressing instructions
	
	//Arrays in JS have stack functionality built in.
	var stack = new Stack();
	
	//Used for debug logging
	this.logger = new Logger();
	
	this.init = function(resetPC, memory) {
		if(resetPC === 0 || resetPC) {
			this.setPC(resetPC);
		} else {
			this.logger.log("PC initialized to default of 0xFFFC");
			this.setPC(0xFFFC);
		}
		this.instructionList = new Instructions(this, memory);
		this.memory = memory;
		memory.setLogger(this.logger);
		stack.init(memory);
	};
	
	this.jumpToSubroutine = function(address, bank) {
		if (bank !== null && bank !== undefined) {
			this.pushStack(this.getPBR());
			this.setPBR(bank);
		}
		this.pushStack(utils.getMSBFromWord(this.getPC()));
		this.pushStack(utils.getLSBFromWord(this.getPC()));
		this.setPC(address);
	};
	
	this.returnFromSubroutine = function(isBankPushed) {
		var LSB = this.popStack();
		var MSB = this.popStack();
		this.setPC(utils.get2ByteValue(MSB, LSB));
		if (isBankPushed) {
			this.setPBR(this.popStack());
		}
	};
	
	this.getAccumulatorOrMemorySize = function() {
		return this.getAccumulatorSizeSelect() || this.getEmulationFlag();
	};
	
	this.getStackRelativeLocation = function(operand) {
		return stack.getPointer() + operand;
	};
	
	this.getStackPointer = function() {
		return stack.getPointer();
	};
	
	this.pushStack = function(val) {
		stack.push(val);
	};
	
	this.popStack = function() {
		return stack.pop();
	};
	
	this.setStackPointer = function(val) {
		stack.setPointer(val);
	};
	
	this.getDirectPageValue = function(val, index) {
		return dpr + val + (index ? index : 0);
	};
	
	this.getDPRLowNotZero = function() {
		return dpr & 0x0FF !== 0;
	};
	
	this.getDPR = function() {
		return dpr;
	};
	
	this.setDPR = function(newVal) {
		dpr = newVal;
	};
	
	this.getAccumulatorSizeSelect = function() {
		return this.accumSizeSelect;
	};
	
	this.getIndexRegisterSize = function() {
		return this.getIndexRegisterSelct() || this.getEmulationFlag();
	};
	
	this.getEmulationFlag = function() {
		return this.isEmulationFlag;
	};
	
	this.getIndexRegisterSelct = function() {
		return this.indexRegisterSelect;
	};
	
	this.setEmulationFlag = function(val) {
		this.isEmulationFlag = val;
	};
	
	this.getAccumulatorBufferOffset = function() {
		return ACCUMULATOR_BUFFER_OFFSET;
	};
	
	this.getXIndexBufferOffset = function() {
		return INDEX_X_BUFFER_OFFSET;
	};
	
	this.getYIndexBufferOffset = function() {
		return INDEX_Y_BUFFER_OFFSET;
	};
	
	this.getXIndex = function() {
		return this.getIndexRegisterSelct() ? this.getXIndex8() : this.getXIndex16();
	};
	
	this.getXIndex8 = function() {
		return registerDV.getUint8(this.getXIndexBufferOffset());
	};
	
	this.getXIndex16 = function() {
		return registerDV.getUint16(this.getXIndexBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.setXIndex = function(val) {
		if(this.getIndexRegisterSelct()) {
			this.setRegisterDVValue8(this.getXIndexBufferOffset(), val);
		} else {
			this.setRegisterDVValue16(this.getXIndexBufferOffset(), val);
		}
	};
	
	this.getYIndex = function() {
		return this.getIndexRegisterSelct() ? this.getYIndex8() : this.getYIndex16();
	};
	
	this.getYIndex8 = function() {
		return registerDV.getUint8(this.getYIndexBufferOffset());
	};
	
	this.getYIndex16 = function() {
		return registerDV.getUint16(this.getYIndexBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.setYIndex = function(val) {
		if(this.getIndexRegisterSelct()) {
			this.setRegisterDVValue8(this.getYIndexBufferOffset(), val);
		} else {
			this.setRegisterDVValue16(this.getYIndexBufferOffset(), val);
		}
	};
	
	this.getAccumulator = function() {
		return this.getAccumulatorOrMemorySize() ? this.getAccumulator8() : this.getAccumulator16();
	};
	
	this.getAccumulator8 = function() {
		return registerDV.getUint8(this.getAccumulatorBufferOffset());
	};
	
	this.getAccumulator16 = function() {
		return registerDV.getUint16(this.getAccumulatorBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.setAccumulator = function(val) {
		if(this.getAccumulatorOrMemorySize()) {
			this.setRegisterDVValue8(this.getAccumulatorBufferOffset(), val);
		} else {
			this.setRegisterDVValue16(this.getAccumulatorBufferOffset(), val);
		}
	};

	this.setRegisterDVValue8 = function(bufferOffset, val) {
		if (val < 0) {
			registerDV.setInt8(bufferOffset, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		} else {
			registerDV.setUint8(bufferOffset, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		}
	};
	
	this.setRegisterDVValue16 = function(bufferOffset, val) {
		if (val < 0) {
			registerDV.setInt16(bufferOffset, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		} else {
			registerDV.setUint16(bufferOffset, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		}
	};
	
	this.setHelperBufferValue = function(val) {
		if(val < 0) {
			registerDV.setInt32(HELPER_BUFFER_OFFSET, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		} else {
			registerDV.setUint32(HELPER_BUFFER_OFFSET, val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		}
	};
	
	this.getHelperBufferValue = function() {
		return registerDV.getUint32(HELPER_BUFFER_OFFSET, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.getCarryFlagStatus = function() {
		return this.carry;
	};
	
	this.getCarryVal = function() {
		return this.getAccumulatorOrMemorySize() ? 0x100 : 0x10000;
	};
	
	this.doSubtraction = function(val) {
		this.doAddition(val*-1);
	};
	
	this.doAddition = function(val) {
		var result = this.getAccumulator() + val;
		this.setAccumulator(result);
		this.setHelperBufferValue(result);
		var acc = this.getHelperBufferValue();
		this.updateCarryFlag(acc);
		this.updateNegativeFlag(acc, this.getAccumulatorOrMemorySize());
		this.updateZeroFlag(acc);
		this.updateOverflowFlag(result);
	};
	
	this.updateCarryFlag = function(val) {
		this.setCarryFlag(val & this.getCarryVal() !== 0);
	};
	
	this.doComparison = function(operandVal, registerVal, registerSizeSelect) {
		/*TODO: This needs to be cleaned up to use a typed array, but that'll be just something on the backlog*/
		var result = registerVal - operandVal;
		this.updateZeroFlag(result);
		this.updateNegativeFlag(result, registerSizeSelect);
		this.updateSubtractionCarryFlag(result);
	};
	
	this.loadX = function(val) {
		this.setXIndex(val);
		this.updateZeroFlag(val);
		this.updateNegativeFlag(val, this.indexRegisterSelect);
	};
	
	this.loadY = function(val) {
		this.setYIndex(val);
		this.updateZeroFlag(val);
		this.updateNegativeFlag(val, this.indexRegisterSelect);
	};
	
	this.loadAccumulator = function(val) {
		this.setAccumulator(val);
		this.updateNegativeFlag(this.getAccumulator(), this.getAccumulatorSizeSelect());
		this.updateZeroFlag(this.getAccumulator());
	};
	
	this.getPBR = function() {
		return this.pbr;
	};
	
	this.setPBR = function(val) {
		this.pbr = val;
	};
	
	/*Used for timing our cycles, when we have a number of cycles left to execute, but can't execute the next command in that time, 
		we'll use this value to reclaim that cycle time in the next loop.*/
	this.excessCycleTime = 0;
};

CPU.prototype.getPC = function(){
	return this.pc;
};

CPU.prototype.logInstruction = function(instruction) {
	if (!this.logger.debug) {
		return "";
	}
	
	var instructionString = "$" + utils.zeroFill(this.pbr, 2, 16) + "/" + utils.zeroFill(this.pc, 4, 16);
	var i = 0;
	for (i = 0; i < 4; i++) {
		if (i < instruction.size) {
			instructionString += " " + utils.zeroFill(this.memory.getByteAtLocation(this.pbr, this.pc + i), 2, 16);
		} else {
			instructionString += "   ";
		}
	}
	instructionString += "  ";
	instructionString += "    ";
	instructionString += "    ";
	instructionString += "    ";
	instructionString += "    ";
	instructionString += "      ";
	instructionString += "A:" + utils.zeroFill(this.getAccumulator16(), 4, 16) + " ";
	instructionString += "X:" + utils.zeroFill(this.getXIndex(), 4, 16) + " ";
	instructionString += "Y:" + utils.zeroFill(this.getYIndex(), 4, 16) + " ";
	instructionString += "P:" + `${this.getEmulationFlag() ? "E" : "e"}` + `${this.getNegativeFlag() ? "N" : "n"}` + `${this.getOverflowFlag() ? "V" : "v"}` + `${this.getAccumulatorOrMemorySize() ? "M" : "m"}`;
	instructionString += `${this.getIndexRegisterSize() ? "X" : "x"}` + `${this.getDecimalMode() ? "D" : "d"}` + `${this.getIRQDisabledFlag() ? "I" : "i"}` + `${this.getZeroFlag() ? "Z" : "z"}` + `${this.getCarryFlagStatus() ? "C" : "c"}`;
	return instructionString;
};

CPU.prototype.execute = function(cycles) {
	//We gain back our excess cycles this loop.
	var cyclesLeft = cycles + this.excessCycleTime;
	this.excessCycleTime = 0;
	while(cyclesLeft > 0) {
		var instructionVal = this.memory.getByteAtLocation(this.pbr, this.pc);
		var instruction = this.instructionList[instructionVal]();
		var instructionString = this.logInstruction(instruction);
		if(instruction.CPUCycleCount <= cyclesLeft) {
			this.incPC(instruction.size);
			cyclesLeft -= instruction.CPUCycleCount;
			//This needs to be last, because we have to update the PC in some instructions
			instruction.func();
			this.logger.log(instructionString);
			this.checkBreakpoints();
		} else {
			this.excessCycleTime = cyclesLeft;
			cyclesLeft = 0;
		}
	}
};

CPU.prototype.checkBreakpoints = function() {
	/*if (this.pbr === 0x7E && this.pc === 0x1000) {
		this.logger.printLog();
		debugger;
	}*/
};

CPU.prototype.incPC = function(pc_inc) {
	this.setPC(this.pc + pc_inc);
};

CPU.prototype.setOverflowFlag = function(val) {
	this.overflow = val;
};

CPU.prototype.getOverflowFlag = function() {
	return this.overflow;
};

CPU.prototype.getNegativeFlag = function() {
	return this.negative;
};

CPU.prototype.setNegativeFlag = function(val) {
	this.negative = val;
};

CPU.prototype.updateNegativeFlag = function(val, sizeSelector) {
	var accMask = this.isEmulationFlag || sizeSelector === BIT_SELECT.BIT_8 ? 0x80 : 0x8000;
	this.setNegativeFlag((val < 0) || !!(val & accMask));
	
};

CPU.prototype.getDecimalMode = function() {
	return this.decimalMode;
};

CPU.prototype.setDecimalMode = function(val) {
	this.decimalMode = val;
};

CPU.prototype.setIndexRegisterSelect = function(val) {
	this.indexRegisterSelect = val;
};

CPU.prototype.setMemoryAccumulatorSelect = function(val) {
	this.accumSizeSelect = val;
};

CPU.prototype.setCarryFlag = function(val) {
	this.carry = val;
};

CPU.prototype.updateAdditionCarryFlag = function(val, registerSizeSelect) {
	var maxVal = registerSizeSelect === BIT_SELECT.BIT_16 ? 0xFFFF : 0xFF;
	this.setCarryFlag(val > maxVal);
};

CPU.prototype.updateSubtractionCarryFlag = function(val) {
	this.setCarryFlag(val >= 0);
};

CPU.prototype.setIRQDisabledFlag = function(val) {
	this.IRQDisabled = val;
};

CPU.prototype.getIRQDisabledFlag = function() {
	return this.IRQDisabled;
};

CPU.prototype.setZeroFlag = function(val) {
	this.isZero = val;
};

CPU.prototype.getZeroFlag = function() {
	return this.isZero;
};

CPU.prototype.updateZeroFlag = function(val) {
	this.setZeroFlag(val === 0);
	
};

CPU.prototype.updateOverflowFlag = function(val) {
	var temp = new ArrayBuffer(4);
	var dv = new DataView(temp);
	if (val > 0) {
		dv.setUint32(0, val, true);
	} else {
		dv.setInt32(0, val, true);
	}
	this.setOverflowFlag(dv.getUint32(0, true) > 0xFFFF);
};

CPU.prototype.setPC = function(val) {
	this.pc = val;
};

module.exports = CPU;