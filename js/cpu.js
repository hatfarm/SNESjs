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
var Stack = require('./stack.js');
//These are ENUMS that are used by the CPU

var DECIMAL_MODES = utils.DECIMAL_MODES;
var BIT_SELECT = utils.BIT_SELECT;
var ACCUMULATOR_BUFFER_OFFSET = 0;
var INDEX_X_BUFFER_OFFSET = 4;
var INDEX_Y_BUFFER_OFFSET = 8;
var LITTLE_ENDIAN_TYPED_ARRAYS_FLAG = true;

/*Most of the information here is from http://wiki.superfamicom.org/snes/show/65816+Reference*/
/*This is the CPU for the SNES, it mostly just handles PC/cycle count incrementing and also the instructions*/
var CPU = function() {
	var _this = this;
	
	var buffer = new ArrayBuffer(12);
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

	//Index registers, general purpose
	var indexX = 0;
	var indexY = 0;
	
	//Arrays in JS have stack functionality built in.
	var stack = new Stack();
	
	//The memory used by the system
	this.memory;
	
	//Used for debug logginc
	this.logger = new Logger();
	
	this.init = function(resetPC, memory) {
		this.setPC(resetPC);
		this.instructionList = new Instructions(this);
		this.memory = memory;
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
		return this.getAccumulatorSizeSelect() && this.getEmulationFlag();
	};
	
	this.getStackPointer = function(val) {
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
	
	this.getDPR = function() {
		return dpr;
	}
	
	this.setDPR = function(newVal) {
		dpr = newVal;
	}
	
	this.getAccumulatorSizeSelect = function() {
		return this.accumSizeSelect;
	};
	
	this.getIndexRegisterSize = function() {
		return this.getIndexRegisterSelct() && this.getEmulationFlag();
	};
	
	this.getEmulationFlag = function() {
		return this.isEmulationFlag;
	};
	
	this.getIndexRegisterSelct = function() {
		return this.indexRegisterSelect;
	};
	
	this.setEmulationFlag = function(val) {
		this.isEmulationFlag = val;
		this.logger.log("Emulation Flag: " + this.isEmulationFlag);
	}
	
	this.getAccumulatorBufferOffset = function() {
		return ACCUMULATOR_BUFFER_OFFSET;
	};
	
	this.getXIndexBufferOffset = function() {
		return INDEX_X_BUFFER_OFFSET;
	}
	
	this.getYIndexBufferOffset = function() {
		return INDEX_Y_BUFFER_OFFSET;
	}
	
	this.getXIndex = function() {
		return indexX;
	};
	
	this.setXIndex = function(val) {
		this.logger.log("X Index: " + val.toString(16));
		indexX = val;
	};
	
	this.getYIndex = function() {
		return indexY;
	};
	
	this.setYIndex = function(val) {
		this.logger.log("Y Index: " + val.toString(16));
		indexY = val;
	};
	
	this.getAccumulator = function() {
		return this.getAccumulatorOrMemorySize() ? registerDV.getUint8(this.getAccumulatorBufferOffset()) : 
													registerDV.getUint16(this.getAccumulatorBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.getAccumulator16 = function() {
		return registerDV.getUint16(this.getAccumulatorBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	}
	
	this.getCarryFlagStatus = function() {
		return this.carry;
	};
	
	this.getCarryVal = function() {
		return this.getAccumulatorOrMemorySize() ? 0x100 : 0x10000;
	};
	
	this.getFullAccumulator = function() {
		return registerDV.getUint32(this.getAccumulatorBufferOffset(), LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
	};
	
	this.setAccumulator = function(val) {
		this.logger.log("Accumulator: 0x" + val.toString(16));
		//We're always going to set it with 32 bits, but when we read it, it'll only be the size that we're expecting
		if(val < 0) {
			registerDV.setInt32(this.getAccumulatorBufferOffset(), val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		} else {
			registerDV.setUint32(this.getAccumulatorBufferOffset(), val, LITTLE_ENDIAN_TYPED_ARRAYS_FLAG);
		}
	};
	
	this.doSubtraction = function(val) {
		this.doAddition(val*-1)
	};
	
	this.doAddition = function(val) {
		var result = this.getAccumulator() + val;
		this.setAccumulator(result);
		var acc = this.getFullAccumulator();
		this.updateCarryFlag(acc);
		this.updateNegativeFlag(acc, this.getAccumulatorOrMemorySize());
		this.updateZeroFlag(acc);
		this.updateOverflowFlag(result);
	};
	
	this.updateCarryFlag = function(val) {
		this.setCarryFlag(val & this.getCarryVal !== 0);
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
	
	this.loadAccumulator = function(val) {
		this.setAccumulator(val);
		this.updateNegativeFlag(this.getAccumulator(), this.getAccumulatorSizeSelect());
		this.updateZeroFlag(this.getAccumulator());
	}
	
	this.getPBR = function() {
		return this.pbr;
	};
	
	this.setPBR = function(val) {
		this.logger.log("Program Counter Bank Register: " + val.toString(16));
		this.pbr = val;
	};
	
	/*Used for timing our cycles, when we have a number of cycles left to execute, but can't execute the next command in that time, 
		we'll use this value to reclaim that cycle time in the next loop.*/
	this.excessCycleTime = 0;
};

CPU.prototype.getPC = function(){
	return this.pc;
}



CPU.prototype.execute = function(cycles) {
	//We gain back our excess cycles this loop.
	var cyclesLeft = cycles + this.excessCycleTime;
	this.excessCycleTime = 0;
	while(cyclesLeft > 0) {
		this.logger.log("============================");
		var instructionVal = this.memory.getByteAtLocation(this.pbr, this.pc);
		this.logger.log("PC: 0x" + this.pc.toString(16) + " -- Instruction: 0x" + instructionVal.toString(16));
		var instruction = this.instructionList[instructionVal]();
		if(instruction.CPUCycleCount <= cyclesLeft) {
			this.incPC(instruction.size);
			cyclesLeft -= instruction.CPUCycleCount;
			//This needs to be last, because we have to update the PC in some instructions
			instruction.func();
		} else {
			this.logger.log("Unable to complete in cycles left.");
			this.excessCycleTime = cyclesLeft;
			cyclesLeft = 0;
		}
		this.logger.log("============================");
	}
}

CPU.prototype.incPC = function(pc_inc) {
	this.setPC(this.pc + pc_inc);
}

CPU.prototype.setOverflowFlag = function(val) {
	this.overflow = val;
	this.logger.log("Overflow Flag: " + this.overflow.toString(16));
};

CPU.prototype.setNegativeFlag = function(val) {
	this.negative = val;
	this.logger.log("Negative Flag: " + this.negative.toString(16));
};

CPU.prototype.updateNegativeFlag = function(val, sizeSelector) {
	var accMask = this.isEmulationFlag || sizeSelector === BIT_SELECT.BIT_8 ? 0x80 : 0x8000
	this.setNegativeFlag((val < 0) || !!(val & accMask));
	
};

CPU.prototype.setDecimalMode = function(val) {
	this.decimalMode = val;
	//this.logger.log("Decimal Mode: " + this.decimalMode === DECIMAL_MODES.DECIMAL ? "DECIMAL" : "BINARY");
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
	this.logger.log("Carry Flag: " + this.carry.toString(16));
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

CPU.prototype.setZeroFlag = function(val) {
	this.isZero = val;
	this.logger.log("Zero Flag: " + this.isZero);
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
	this.logger.log("Program Counter: " + this.pc.toString(16));
}

module.exports = CPU;