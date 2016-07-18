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
		var instructionVal = this.memory.getByteAtLocation(this.pbr, this.pc);
		var logString = "PC: 0x" + this.pc.toString(16) + " -- Instruction: 0x" + instructionVal.toString(16) + "...";
		
		if (this.instructionMap.hasOwnProperty(instructionVal)) {
			
			var instruction = this.instructionMap[instructionVal].bind(this)();
			if(instruction.CPUCycleCount <= cyclesLeft) {
				this.incPC(instruction.size);
				cyclesLeft -= instruction.CPUCycleCount;
				//This needs to be last, because we have to update the PC in some instructions
				instruction.func.bind(this)();
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

/*Direct Indexed Indirect ((_dp,_X)) addressing is often referred to as Indirect X addressing. The second byte
of the instruction is added to the sum of the Direct Register and the X Index Register. The result points
to the X low-order 16 bits of the effective address. The Data Bank Register contains the high-order 8
bits of the effective address. */
CPU.prototype.instructionMap = {
	//BRK -- Break
	0x0: function() {
			return {
				size: 2,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 2) + (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc),
				func: function() {
					//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
				},
			}
	},
	//CLC -- Clear Carry
	0x18: function() {
		return {
			size: 1,
			CPUCycleCount: Timing.FAST_CPU_CYCLE + this.memory.getMemAccessCycleTime(this.pbr, this.pc),
			func: function() {
				this.setCarryFlag(false);
			}
		}
	},
	//AND (_dp,_X) - AND accumulator with memory (direct indexed)
	0x21: function() {
			var byte1 = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
			var dpMath = this.indexX + this.dpr + byte1;
			return {
				size: 2,
				CPUCycleCount: (this.memory.getMemAccessCycleTime(this.pbr, this.pc) << 1) + (this.memory.getMemAccessCycleTime(this.dbr, dpMath) << 1) + (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					var memResult = this.memory.getByteAtLocation(this.dbr, dpMath);
					this.setAccumulator(this.accumulator & memResult.val);
					this.updateNegativeFlag(this.accumulator, this.accumSizeSelect);
					this.updateZeroFlag(this.accumulator);
				}
			}
	},
	//PHA - Push Accumulator
	0x48: function() {
			return {
			size: 1,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc), //3 CPU cycles
			func: function() {
				this.stack.push(this.accumulator);
			}
		}
	},
	//PHK - Push Program Bank Register
	0x4B: function() {
			return {
			size: 1,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc), //3 CPU cycles
			func: function() {
				this.stack.push(this.pc);
			}
		}
	},
	//JMP addr - Jump to address (immediate)
	0x4c: function() {
		var addr = this.memory.getUInt16AtLocation(this.pbr, this.pc + 1);
		return {
			size: 3,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc), //3 CPU cycles
			func: function() {
				this.pc = addr;
			}
		}
	},
	
	//SEI - Set Interrupt Disable Flag
	0x78: function() {
		return {
			size: 1,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1),
			func: function() {
				this.setIRQDisabledFlag(true);
			}
		}
	},
	//BRA nearlabel - Branch Always
	0x80: function() {
		var incr = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
		return {
			size: 3,
			CPUCycleCount: Timing.FAST_CPU_CYCLE + (this.memory.getMemAccessCycleTime(this.pbr, this.pc) << 1),
			func: function() {
				this.pc += incr;
			}
		}
	},
	//STA addr - Store Accumulator to Memory
	0x8D: function() {
		var addr = this.memory.getUInt16AtLocation(this.pbr, this.pc + 1);
		return {
			size: 3,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc) + this.memory.getMemAccessCycleTime(this.pbr, addr),
			func: function() {
				if(this.isEmulationFlag  || this.accumSizeSelect === BIT_SELECT.BIT_8) {
					this.memory.setROMProtectedByteAtLocation(this.pbr, addr, this.accumulator);
				} else {
					this.memory.setROMProtectedWordAtLocation(this.pbr, addr, this.accumulator);
				}
			}
		}
	},
	//STA long - Store Accumulator to Memory, specific address
	0x8F: function() {
		var bank = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
		var addr = this.memory.getUInt16AtLocation(this.pbr, this.pc + 2);
		return {
			size: 4,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + (this.memory.getMemAccessCycleTime(this.pbr, this.pc) << 1) + this.memory.getMemAccessCycleTime(this.pbr, addr),
			func: function() {
				if(this.isEmulationFlag  || this.accumSizeSelect === BIT_SELECT.BIT_8) {
					this.memory.setROMProtectedByteAtLocation(bank, addr, this.accumulator);
				} else {
					this.memory.setROMProtectedWordAtLocation(bank, addr, this.accumulator);
				}
			}
		}
	},
	//STZ - Store Zero to Memory
	0x9C: function() {
		var addr = this.memory.getUInt16AtLocation(this.pbr, this.pc + 1);
		return {
			size: 3,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + this.memory.getMemAccessCycleTime(this.pbr, this.pc) + this.memory.getMemAccessCycleTime(this.pbr, addr),
			func: function() {
				if(this.isEmulationFlag  || this.accumSizeSelect === BIT_SELECT.BIT_8) {
					this.memory.setROMProtectedByteAtLocation(this.pbr, addr, 0);
				} else {
					this.memory.setROMProtectedWordAtLocation(this.pbr, addr, 0);
				}
			}
		}
	},
	//PLB - Pull Data Bank Register
	0xAB: function() {
		return {
			size: 1,
			CPUCycleCount: this.memory.getMemAccessCycleTime(this.pbr, this.pc) + Timing.FAST_CPU_CYCLE,
			func: function() {
				this.dbr = (0xFF & this.stack.pop());
			}
		}
	},
	//LDA #const - Load Accumulator with const
	0xA9: function() {
		return {
			size: 2,
			CPUCycleCount: this.memory.getMemAccessCycleTime(this.pbr, this.pc) + Timing.FAST_CPU_CYCLE,
			func: function() {
				var newVal = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
				this.setAccumulator(newVal);
				this.updateNegativeFlag(this.accumulator, this.accumSizeSelect);
				this.updateZeroFlag(this.accumulator);
			}
		}
	},
	//REP - Reset Processor Status Bits
	0xC2: function() {
		var flagMask = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
		return {
			size: 2,
			CPUCycleCount: this.memory.getMemAccessCycleTime(this.pbr, this.pc) + (Timing.FAST_CPU_CYCLE << 1),
			func: function() {
				if (CARRY_BITMASK & flagMask) { this.setCarryFlag(false); }
				if (ZERO_BITMASK & flagMask) { this.setZeroFlag(false); }
				if (IRQ_DISABLE_BITMASK & flagMask) { this.setIRQDisabledFlag(false); }
				if (DECIMAL_MODE_BITMASK & flagMask) { this.setDecimalMode(DECIMAL_MODES.BINARY); }
				if (INDEX_REG_SELECT_BITMASK & flagMask) { this.setIndexRegisterSelect(BIT_SELECT.BIT_16); }
				if (MEM_ACC_SELECT_BITMASK & flagMask) { this.setMemoryAccumulatorSelect(BIT_SELECT.BIT_16); }
				if (OVERFLOW_BITMASK & flagMask) { this.setOverflowFlag(false); }
				if (NEGATIVE_BITMASK & flagMask) { this.setNegativeFlag(false); }
			}
		}
	},
	//CLD - Clear Decimal Mode Flag
	0xD8: function() {
		return {
			size: 1,
			CPUCycleCount: Timing.FAST_CPU_CYCLE + this.memory.getMemAccessCycleTime(this.pbr, this.pc),
			func: function() {
				this.setDecimalMode(false);
			}
		}
	},
	//CPX #const - Compare Index Register X with Memory
	0xE0: function() {
		if(this.indexRegisterSelect === BIT_SELECT.BIT_8) {
			var constVal = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
			var size = 2;
			var cycles = this.memory.getMemAccessCycleTime(this.pbr, this.pc) + Timing.FAST_CPU_CYCLE;
		} else {
			var constVal = this.memory.getUInt16AtLocation(this.pbr, this.pc + 1);
			var size = 3;
			var cycles = this.memory.getMemAccessCycleTime(this.pbr, this.pc) + (Timing.FAST_CPU_CYCLE << 1);
		}
		
		return {
			size: size,
			CPUCycleCount: Timing.FAST_CPU_CYCLE + (Timing.FAST_CPU_CYCLE << 1),
			func: function() {
				this.doComparison(constVal, this.indexX, this.indexRegisterSelect);
			}
		}
	},
	//SEP - Set Processor Status Bits
	0xE2: function() {
		var flagMask = this.memory.getByteAtLocation(this.pbr, this.pc + 1);
		return {
			size: 2,
			CPUCycleCount: Timing.FAST_CPU_CYCLE + (Timing.FAST_CPU_CYCLE << 1),
			func: function() {
				if (CARRY_BITMASK & flagMask) { this.setCarryFlag(true); }
				if (ZERO_BITMASK & flagMask) { this.setZeroFlag(true); }
				if (IRQ_DISABLE_BITMASK & flagMask) { this.setIRQDisabledFlag(true); }
				if (DECIMAL_MODE_BITMASK & flagMask) { this.setDecimalMode(DECIMAL_MODES.DECIMAL); }
				if (INDEX_REG_SELECT_BITMASK & flagMask) { this.setIndexRegisterSelect(BIT_SELECT.BIT_8); }
				if (MEM_ACC_SELECT_BITMASK & flagMask) { this.setMemoryAccumulatorSelect(BIT_SELECT.BIT_8); }
				if (OVERFLOW_BITMASK & flagMask) { this.setOverflowFlag(true); }
				if (NEGATIVE_BITMASK & flagMask) { this.setNegativeFlag(true); }
			}
		}
	},
	//XCE - Exchange Carry and Emulation Flags
	0xFB: function() {
		return {
			size: 1,
			CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1),
			func: function() {
				var temp = this.isEmulationFlag;
				this.setEmulationFlag(this.carry);
				this.carry = temp;
			}
		}
	},
};

module.exports = CPU;