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
var Timing = require('./timing.js');
var utils = require('./utils.js');

var DECIMAL_MODES = utils.DECIMAL_MODES;
var BIT_SELECT = utils.BIT_SELECT;

var CARRY_BITMASK = 0x01;
var ZERO_BITMASK = 0x02;
var IRQ_DISABLE_BITMASK = 0x04;
var DECIMAL_MODE_BITMASK = 0x08;
var INDEX_REG_SELECT_BITMASK = 0x10;
var MEM_ACC_SELECT_BITMASK = 0x20;
var OVERFLOW_BITMASK = 0x40;
var NEGATIVE_BITMASK = 0x80;

/*Direct Indexed Indirect ((_dp,_X)) addressing is often referred to as Indirect X addressing. The second byte
of the instruction is added to the sum of the Direct Register and the X Index Register. The result points
to the X low-order 16 bits of the effective address. The Data Bank Register contains the high-order 8
bits of the effective address. */
var getInstructionMap = function(CPU) {
	return {
		//BRK -- Break
		0x0: function() {
				return {
					size: 2,
					CPUCycleCount: (Timing.FAST_CPU_CYCLE << 2) + (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
					func: function() {
						//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
					},
				}
		},
		//CLC -- Clear Carry
		0x18: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setCarryFlag(false);
				}
			}
		},
		//AND (_dp,_X) - AND accumulator with memory (direct indexed)
		0x21: function() {
				var byte1 = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var dpMath = CPU.indexX + CPU.dpr + byte1;
				return {
					size: 2,
					CPUCycleCount: (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(CPU.dbr, dpMath) << 1) + (Timing.FAST_CPU_CYCLE << 1),
					func: function() {
						var memResult = CPU.memory.getByteAtLocation(CPU.dbr, dpMath);
						CPU.setAccumulator(CPU.accumulator & memResult.val);
						CPU.updateNegativeFlag(CPU.accumulator, CPU.accumSizeSelect);
						CPU.updateZeroFlag(CPU.accumulator);
					}
				}
		},
		//PHA - Push Accumulator
		0x48: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.stack.push(CPU.accumulator);
				}
			}
		},
		//PHK - Push Program Bank Register
		0x4B: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.stack.push(CPU.pc);
				}
			}
		},
		//JMP addr - Jump to address (immediate)
		0x4c: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.pc = addr;
				}
			}
		},
		
		//SEI - Set Interrupt Disable Flag
		0x78: function() {
			return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					CPU.setIRQDisabledFlag(true);
				}
			}
		},
		//BRA nearlabel - Branch Always
		0x80: function() {
			var incr = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1),
				func: function() {
					CPU.pc += incr;
				}
			}
		},
		//STA addr - Store Accumulator to Memory
		0x8D: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					if(CPU.isEmulationFlag  || CPU.accumSizeSelect === BIT_SELECT.BIT_8) {
						CPU.memory.setROMProtectedByteAtLocation(CPU.pbr, addr, CPU.accumulator);
					} else {
						CPU.memory.setROMProtectedWordAtLocation(CPU.pbr, addr, CPU.accumulator);
					}
				}
			}
		},
		//STA long - Store Accumulator to Memory, specific address
		0x8F: function() {
			var bank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 2);
			return {
				size: 4,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					if(CPU.isEmulationFlag  || CPU.accumSizeSelect === BIT_SELECT.BIT_8) {
						CPU.memory.setROMProtectedByteAtLocation(bank, addr, CPU.accumulator);
					} else {
						CPU.memory.setROMProtectedWordAtLocation(bank, addr, CPU.accumulator);
					}
				}
			}
		},
		//STZ - Store Zero to Memory
		0x9C: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					if(CPU.isEmulationFlag  || CPU.accumSizeSelect === BIT_SELECT.BIT_8) {
						CPU.memory.setROMProtectedByteAtLocation(CPU.pbr, addr, 0);
					} else {
						CPU.memory.setROMProtectedWordAtLocation(CPU.pbr, addr, 0);
					}
				}
			}
		},
		//PLB - Pull Data Bank Register
		0xAB: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.dbr = (0xFF & CPU.stack.pop());
				}
			}
		},
		//LDA #const - Load Accumulator with const
		0xA9: function() {
			return {
				size: 2,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					var newVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
					CPU.setAccumulator(newVal);
					CPU.updateNegativeFlag(CPU.accumulator, CPU.accumSizeSelect);
					CPU.updateZeroFlag(CPU.accumulator);
				}
			}
		},
		//REP - Reset Processor Status Bits
		0xC2: function() {
			var flagMask = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 2,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					if (CARRY_BITMASK & flagMask) { CPU.setCarryFlag(false); }
					if (ZERO_BITMASK & flagMask) { CPU.setZeroFlag(false); }
					if (IRQ_DISABLE_BITMASK & flagMask) { CPU.setIRQDisabledFlag(false); }
					if (DECIMAL_MODE_BITMASK & flagMask) { CPU.setDecimalMode(DECIMAL_MODES.BINARY); }
					if (INDEX_REG_SELECT_BITMASK & flagMask) { CPU.setIndexRegisterSelect(BIT_SELECT.BIT_16); }
					if (MEM_ACC_SELECT_BITMASK & flagMask) { CPU.setMemoryAccumulatorSelect(BIT_SELECT.BIT_16); }
					if (OVERFLOW_BITMASK & flagMask) { CPU.setOverflowFlag(false); }
					if (NEGATIVE_BITMASK & flagMask) { CPU.setNegativeFlag(false); }
				}
			}
		},
		//CLD - Clear Decimal Mode Flag
		0xD8: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setDecimalMode(false);
				}
			}
		},
		//CPX #const - Compare Index Register X with Memory
		0xE0: function() {
			if(CPU.indexRegisterSelect === BIT_SELECT.BIT_8) {
				var constVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var size = 2;
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var constVal = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var size = 3;
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1);
			}
			
			return {
				size: size,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					CPU.doComparison(constVal, CPU.indexX, CPU.indexRegisterSelect);
				}
			}
		},
		//SEP - Set Processor Status Bits
		0xE2: function() {
			var flagMask = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					if (CARRY_BITMASK & flagMask) { CPU.setCarryFlag(true); }
					if (ZERO_BITMASK & flagMask) { CPU.setZeroFlag(true); }
					if (IRQ_DISABLE_BITMASK & flagMask) { CPU.setIRQDisabledFlag(true); }
					if (DECIMAL_MODE_BITMASK & flagMask) { CPU.setDecimalMode(DECIMAL_MODES.DECIMAL); }
					if (INDEX_REG_SELECT_BITMASK & flagMask) { CPU.setIndexRegisterSelect(BIT_SELECT.BIT_8); }
					if (MEM_ACC_SELECT_BITMASK & flagMask) { CPU.setMemoryAccumulatorSelect(BIT_SELECT.BIT_8); }
					if (OVERFLOW_BITMASK & flagMask) { CPU.setOverflowFlag(true); }
					if (NEGATIVE_BITMASK & flagMask) { CPU.setNegativeFlag(true); }
				}
			}
		},
		//XCE - Exchange Carry and Emulation Flags
		0xFB: function() {
			return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					var temp = CPU.isEmulationFlag;
					CPU.setEmulationFlag(CPU.carry);
					CPU.carry = temp;
				}
			}
		},
	}
};

//We need to fill in something here, we want it to break when we encounter an unhandled instruction, so this is how we do that.
var unsupportedInstruction = function(instructionNumber) {
	return {
		size: 0,
		CPUCycleCount: 0,
		func: function() {
			throw "Invalid function " + instructionNumber.toString(16) + "!";
		}
	}
};

//This conversion may seem kinda silly, especially since arrays aren't really arrays in JS (not always at least) but it's gained me about 30fps in render time, 
//   so an array is a SIGNIFICANTLY quicker datatype than a map.
var getInstructionArray = function(CPU) {
	var instructions = getInstructionMap(CPU);
	var returnArray = [];
	for(var i = 0; i < 256; i++) {
		if (instructions.hasOwnProperty(i)) {
			returnArray.push(instructions[i]);
		} else {
			returnArray.push(new unsupportedInstruction(i));
		}
	}
	
	return returnArray;
}

module.exports = getInstructionArray;