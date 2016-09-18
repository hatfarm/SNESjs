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

var getIndirectLongIndexedYCyclesAddrBank = function(CPU, MEMORY) {
	"use strict";
	var addressLocation = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
	var bank = MEMORY.getByteAtLocation(0, addressLocation + 2);
	var addr = MEMORY.getUInt16AtLocation(0, addressLocation) + CPU.getYIndex();
	var cycles = (MEMORY.getMemAccessCycleTime(0, addressLocation) << 1) + Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(bank, addr);
	if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
		cycles += MEMORY.getMemAccessCycleTime(bank, addr);
	}
	
	if (CPU.getDPRLowNotZero()) {
		cycles += Timing.FAST_CPU_CYCLE;
	}
	return {
		bank: bank,
		addr: addr, 
		cycles: cycles,
	};
};

var getRelativeBranchInformation = function(CPU, isBranchTaken, isBranchAlways, MEMORY) {
	"use strict";
	var branchOffset = MEMORY.getSignedByteAtLocation(CPU.pbr, CPU.getPC() + 1);
	var addr = branchOffset + CPU.getPC() + 2;
	var crossedPageBoundary = (CPU.getPC() & 0xFF00) != (addr & 0xFF00);
	if (!isBranchAlways) {
		var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.getPC()) << 1) + !isBranchTaken ? 0 : (Timing.FAST_CPU_CYCLE + (CPU.getEmulationFlag() && crossedPageBoundary ? Timing.FAST_CPU_CYCLE : 0));
	} else {
		var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.getPC()) << 1) + (CPU.getEmulationFlag() && crossedPageBoundary ? Timing.FAST_CPU_CYCLE : 0);
	}
	return {
		addr: addr,
		cycles: cycles,
	};
};

var getInstructionMap = function(CPU, MEMORY) {
	"use strict";
	return {
		//BRK -- Break
		0x00: function() {
				return {
					size: 2,
					CPUCycleCount: (Timing.FAST_CPU_CYCLE << 2) + (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
					func: function() {
						//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
					},
				}
		},
		//ORA (_dp, _X) - OR Accumulator with Memory
		0x01: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addressLocation = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
			var orVal = MEMORY.getUnsignedValAtLocation(0, addressLocation, accSize);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addressLocation) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.getAccumulator() | orVal);
				}
			}
		},
		//ORA (dp) - OR Accumulator with Memory
		0x05: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addressLocation = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var orVal = MEMORY.getUnsignedValAtLocation(0, addressLocation, accSize);
			var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addressLocation) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.getAccumulator() | orVal);
				}
			}
		},
		//PHP - Push Processor Status Register
		0x08: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					var pushVal = 0;
					if (CPU.getCarryFlagStatus()) pushVal |= CARRY_BITMASK;
					if (CPU.getZeroFlag()) pushVal |= ZERO_BITMASK;
					if (CPU.getIRQDisabledFlag()) pushVal |= IRQ_DISABLE_BITMASK;
					if (CPU.getDecimalMode()) pushVal |= DECIMAL_MODE_BITMASK;
					if (CPU.getIndexRegisterSize()) pushVal |= INDEX_REG_SELECT_BITMASK;
					if (CPU.getAccumulatorSizeSelect()) pushVal |= MEM_ACC_SELECT_BITMASK;
					if (CPU.getOverflowFlag()) pushVal |= OVERFLOW_BITMASK;
					if (CPU.getNegativeFlag()) pushVal |= NEGATIVE_BITMASK;
					CPU.pushStack(pushVal);
				}
			}
		},
		//ASL - Accumulator Shift Left
		0x0A: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_8) {
						var carryMask =  0x08;
						var LSMask = 0x0F;
					} else {
						var carryMask =  0x80;
						var LSMask = 0x0FF;
					}
					CPU.setCarryFlag(!!(CPU.getAccumulator() & carryMask));
					CPU.loadAccumulator((CPU.getAccumulator() << 1) & LSMask);
					
				}
			}
		},
		//CLC -- Clear Carry
		0x18: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setCarryFlag(false);
				}
			}
		},
		//JSR addr - Jump to Subroutine
		0x20: function() {
				var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				return {
					size: 3,
					CPUCycleCount: (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE,
					func: function() {
						CPU.jumpToSubroutine(addr, null);
					}
				}
		},
		//AND (_dp,_X) - AND accumulator with memory (direct indexed)
		0x21: function() {
				var dpMath = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
				return {
					size: 2,
					CPUCycleCount: (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(CPU.dbr, dpMath) << 1) + (Timing.FAST_CPU_CYCLE << 1),
					func: function() {
						CPU.loadAccumulator(MEMORY.getByteAtLocation(CPU.dbr, dpMath) & CPU.getAccumulator());
					}
				}
		},
		//JSL long - Jump to Subroutine
		0x22: function() {
				var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var bank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 3);
				return {
					size: 4,
					CPUCycleCount: (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2) + (Timing.FAST_CPU_CYCLE << 2),
					func: function() {
						CPU.jumpToSubroutine(addr, bank);
					}
				}
		},
		//AND #const - AND accumulator with constant
		0x29: function() {
			var size = 2;
			var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_8) {
				var constVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			} else {
				size++;
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc)
				var constVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			}
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.getAccumulator() & constVal);
				}
			}
		},
		//EOR sr,S - Exclusive-OR Accumulator with Memory
		0x43: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addr = CPU.getStackRelativeLocation(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var xorVal = MEMORY.getUnsignedValAtLocation(0, addr, accSize);
			var cycles = Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addr) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
			
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.getAccumulator() ^ xorVal);
				}
			}
		},
		//PHA - Push Accumulator
		0x48: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(0, CPU.getStackPointer()) << CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16 ? 1 : 0),
				func: function() {
					if(CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
						var HI = (0xFF00 & CPU.getAccumulator16()) >> 8;
						var LO = 0x00FF & CPU.getAccumulator16();
						CPU.pushStack(HI);
						CPU.pushStack(LO);
					} else {
						CPU.pushStack(CPU.getAccumulator8());
					}
				}
			}
		},
		//PHK - Push Program Bank Register
		0x4B: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.pushStack(CPU.pc);
				}
			}
		},
		//JMP addr - Jump to address (immediate)
		0x4C: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.setPC(addr);
				}
			}
		},
		//EOR (_dp_) - Exclusive-OR Accumulator with Memory
		0x52: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addressLocation = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var xorVal = MEMORY.getUnsignedValAtLocation(0, addressLocation, accSize);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addressLocation) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.getAccumulator() ^ xorVal);
				}
			}
		},
		//MVN - Block Move Next
		0x54: function() {
			var srcBank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			var dstBank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 2);
			var size = CPU.getAccumulator16() + 1;
			return {
				size: 3,
				CPUCycleCount: size * (Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + 
										MEMORY.getMemAccessCycleTime(dstBank, CPU.getYIndex()) + MEMORY.getMemAccessCycleTime(srcBank, CPU.getXIndex())),
				func: function() {
					var accum = CPU.getAccumulator16();
					//You could just do a memcpy here, but I'm not sure that a memcpy with overlapping addresses would work, and so this ensures it works right.
					while (accum != 0xFFFF) {
						MEMORY.setROMProtectedByteAtLocation(dstBank, CPU.getYIndex(), MEMORY.getByteAtLocation(srcBank, CPU.getXIndex()));
						CPU.setXIndex(CPU.getXIndex() + 1);
						CPU.setYIndex(CPU.getYIndex() + 1);
						CPU.setAccumulator(accum ? accum - 1 : 0xFFFF);
						accum = CPU.getAccumulator16();
					}
				}
			};
		},
		//TCD - Transfer 16-bit Accumulator to Direct Page Register
		0x5B: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc), //2 CPU cycles
				func: function() {
					CPU.setDPR(CPU.getAccumulator16());
					CPU.updateZeroFlag(CPU.getAccumulator16());
					CPU.updateNegativeFlag(CPU.getAccumulator16(), BIT_SELECT.BIT_16);
				}
			};
		},
		//RTS - Return from Subroutine
		0x60: function() {
			return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.getStackPointer()) << 1), //6 CPU cycles
				func: function() {
					CPU.returnFromSubroutine(false);
				}
			};
		},
		//STZ dp - Store Zero to Memory
		0x64: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(0, addr);
			if (CPU.getDPR() & 0xFF00 !== 0) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			if (CPU.getAccumulatorOrMemorySize()) {
				cycles += MEMORY.getMemAccessCycleTime(0, addr);
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, 0, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//ADC #const - Add with Carry
		0x69: function() {
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_8) {
				var size = 2;
				var addVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var addVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
			}
			if (CPU.getDecimalMode() === DECIMAL_MODES.DECIMAL) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.doAddition(addVal);
				}
			}
		},
		//JMP addr - Jump to address (absolute indirect)
		0x6C: function() {
			var addrLocation = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addrLocation) << 1),
				func: function() {
					CPU.setPC(MEMORY.getUInt16AtLocation(CPU.pbr, addrLocation));
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
		//ADC long,X - Add with Carry (Absolute Long Indexed,X)
		0x7F: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH,BANK
			var bank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 4,
				CPUCycleCount: cycles,
				func: function() {
					var val = MEMORY.getUInt16AtLocation(bank, CPU.getXIndex() + addr);
					CPU.doAddition(val);
				}
			}
		},
		//BRA nearlabel - Branch Always
		0x80: function() {
			var branchInfo = getRelativeBranchInformation(CPU, true, true, MEMORY);
			return {
				size: 2,
				CPUCycleCount: branchInfo.cycles,
				func: function() {
					CPU.setPC(branchInfo.addr);
				}
			}
		},
		//STA (_dp, _X) - Store Accumulator to Memory
		0x81: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addr) << CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16 ? 1 : 0);
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//BRA nearlabel - Branch Always
		0x82: function() {
			var branchOffset = MEMORY.getInt16AtLocation(CPU.pbr, CPU.getPC() + 1);
			var addr = branchOffset + CPU.getPC() + 3;
			return {
				size: 3,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setPC(addr);
				}
			}
		},
		//STA sr,S - Store Accumulator to Memory
		0x83: function() {
			var addr = CPU.getStackRelativeLocation(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (MEMORY.getMemAccessCycleTime(0, addr) << CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16 ? 1 : 0),
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STY dp - Store Index Register Y to Memory
		0x84: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(0, addr),
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, CPU.getYIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA dp - Store Accumulator to Memory
		0x85: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(0, addr),
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STX dp - Store Index Register X to Memory
		0x86: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(0, addr),
				func: function() {
					MEMORY.setROMProtectedValAtLocation(0, addr, CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//DEY - Decrement Y Register
		0x88: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadY(CPU.getYIndex() - 1);
				}
			}
		},
		//TXA - Transfer X Index to Accumulator
		0x8A: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.loadAccumulator(CPU.getXIndex());
				}
			}
		},
		//STY addr - Store Index Register Y to Memory
		0x8C: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getYIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA addr - Store Accumulator to Memory
		0x8D: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STX addr - Store Index Register X to Memory
		0x8E: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA long - Store Accumulator to Memory, specific address
		0x8F: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH,BANK
			var bank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 4,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					if(CPU.getEmulationFlag()  || CPU.accumSizeSelect === BIT_SELECT.BIT_8) {
						MEMORY.setROMProtectedByteAtLocation(bank, addr, CPU.getAccumulator());
					} else {
						MEMORY.setROMProtectedWordAtLocation(bank, addr, CPU.getAccumulator());
					}
				}
			}
		},
		//STA (dp), Y - Store Accumulator to Memory
		0x97: function() {
			var vals = getIndirectLongIndexedYCyclesAddrBank(CPU, MEMORY);
			return {
				size: 2,
				CPUCycleCount: vals.cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(vals.bank, vals.addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//TXS - Transfer X Index to Stack Pointer
		0x9A: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setStackPointer(CPU.getXIndex());
				}
			}
		},
		//TXY - Transfer X Index to Y Index
		0x9B: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setYIndex(CPU.getXIndex());
					CPU.updateZeroFlag(CPU.getXIndex());
					CPU.updateNegativeFlag(CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STZ addr - Store Zero to Memory
		0x9C: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, 0, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STA addr,X - Store Accumulator to Memory
		0x9D: function() {
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1) + CPU.getXIndex();
			var cycles = Timing.FAST_CPU_CYCLE + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//LDY #const - Load Index Register Y from Memory
		0xA0: function() {
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_8) {
				var size = 2;
				var newVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
			}
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadY(newVal);
				}
			}
		},
		//LDX #const - Load Index Register X from Memory
		0xA2: function() {
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_8) {
				var size = 2;
				var newVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
			}
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadX(newVal);
				}
			}
		},
		//LDA dp - Load Accumulator from Memory
		0xA5: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, addr) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(MEMORY.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()));
				}
			}
		},
		//LDX dp - Load Index Register X from Memory
		0xA6: function() {
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, addr) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadX(MEMORY.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getIndexRegisterSize()));
				}
			}
		},
		//LDA #const - Load Accumulator with const
		0xA9: function() {
			if (CPU.getAccumulatorSizeSelect() === BIT_SELECT.BIT_8) {
				var size = 2;
				var newVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1 + Timing.FAST_CPU_CYCLE;
			}
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(newVal);
				}
			}
		},
		//TAX - Transfer Accumulator to Index Register X
		0xAA: function() {
			var val = CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16 ? CPU.getAccumulator() : 0x00FF & CPU.getAccumulator();
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(val);
				}
			}
		},
		//PLB - Pull Data Bank Register
		0xAB: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.dbr = (CPU.popStack());
				}
			}
		},
		//LDA addr - Load Accumulator from Memory
		0xAD: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE) + MEMORY.getMemAccessCycleTime(CPU.pbr, addr) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += MEMORY.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(MEMORY.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()));
				}
			}
		},
		//BCS - Branch if carry set
		0xB0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, CPU.getCarryFlagStatus(), false, MEMORY);
			return {
				size: 2,
				CPUCycleCount: branchInfo.cycles,
				func: function() {
					if (CPU.getCarryFlagStatus()) {
						CPU.setPC(branchInfo.addr);
					}
				}
			}
		},
		//LDA [_dp_],Y - Load Accumulator from Memory
		0xB7: function() {
			var vals = getIndirectLongIndexedYCyclesAddrBank(CPU, MEMORY);
			return {
				size: 2,
				CPUCycleCount: vals.cycles,
				func: function() {
					CPU.loadAccumulator(MEMORY.getUnsignedValAtLocation(vals.bank, vals.addr, CPU.getAccumulatorOrMemorySize()));
				}
			}
		},
		//LDA long,X - Load Accumulator from Memory
		0xBF: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH,BANK
			var bank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 4,
				CPUCycleCount: cycles,
				func: function() {
					var val = MEMORY.getUInt16AtLocation(bank, CPU.getXIndex() + addr);
					CPU.loadAccumulator(val);
				}
			}
		},
		//REP - Reset Processor Status Bits
		0xC2: function() {
			var flagMask = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 2,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1),
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
		//INY - Increment Y Register
		0xC8: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadY(CPU.getYIndex() + 1);
				}
			}
		},
		//DEX - Decrement X Register
		0xCA: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(CPU.getXIndex() - 1);
				}
			}
		},
		//BNE - Branch if not equal
		0xD0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, !CPU.getZeroFlag(), false, MEMORY);
			return {
				size: 2,
				CPUCycleCount: branchInfo.cycles,
				func: function() {
					if (!CPU.getZeroFlag()) {
						CPU.setPC(branchInfo.addr);
					}
				}
			}
		},
		//CLD - Clear Decimal Mode Flag
		0xD8: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setDecimalMode(false);
				}
			}
		},
		//PHX - Push X Index Register
		0xDA: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(0, CPU.getStackPointer()) << CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16 ? 1 : 0),
				func: function() {
					if(CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
						var HI = (0xFF00 & CPU.getXIndex16()) >> 8;
						var LO = 0x00FF & CPU.getXIndex16();
						CPU.pushStack(HI);
						CPU.pushStack(LO);
					} else {
						CPU.pushStack(CPU.getXIndex8());
					}
				}
			}
		},
		//JMP/JML addr - Jump to address (Absolute Indirect Long)
		0xDC: function() {
			var addrLocation = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + MEMORY.getMemAccessCycleTime(0, addrLocation) + (MEMORY.getMemAccessCycleTime(0, addrLocation) << 1),
				func: function() {
					var addr = MEMORY.getUInt16AtLocation(0, addrLocation);
					var bank = MEMORY.getByteAtLocation(0, addrLocation + 2);
					CPU.setPBR(bank);
					CPU.setPC(addr);
				}
			}
		},
		//CPX #const - Compare Index Register X with Memory
		0xE0: function() {
			if(CPU.indexRegisterSelect === BIT_SELECT.BIT_8) {
				var constVal = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var size = 2;
				var cycles = MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var constVal = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var size = 3;
				var cycles = (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE ;
			}
			
			return {
				size: size,
				CPUCycleCount: cycles,
				func: function() {
					CPU.doComparison(constVal, CPU.getXIndex(), CPU.indexRegisterSelect);
				}
			}
		},
		//SEP - Set Processor Status Bits
		0xE2: function() {
			var flagMask = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1);
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
		//INC dp - Increment value from Memory
		0xE6: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = CPU.getDirectPageValue(MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = (Timing.FAST_CPU_CYCLE) + (MEMORY.getMemAccessCycleTime(0, addr) << 1) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += (MEMORY.getMemAccessCycleTime(0, addr) << 1);
			}
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					var newVal = MEMORY.getUnsignedValAtLocation(0, addr, CPU.getAccumulatorOrMemorySize()) + 1;
					CPU.updateZeroFlag(newVal);
					CPU.updateNegativeFlag(newVal, CPU.getAccumulatorOrMemorySize());
					MEMORY.setROMProtectedValAtLocation(0, addr, newVal, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//INX - Increment X Register
		0xE8: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(CPU.getXIndex() + 1);
				}
			}
		},
		//NOP - No op
		0xEA: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					//DO NOTHING
				}
			}
		},
		//INC addr - Increment value from Memory
		0xEE: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE) + MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					var newVal = MEMORY.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()) + 1;
					CPU.updateZeroFlag(newVal);
					CPU.updateNegativeFlag(newVal, CPU.getAccumulatorOrMemorySize());
					MEMORY.setROMProtectedValAtLocation(CPU.pbr, addr, newVal, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//BEQ - Branch if equal
		0xF0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, CPU.getZeroFlag(), false, MEMORY);
			return {
				size: 2,
				CPUCycleCount: branchInfo.cycles,
				func: function() {
					if (CPU.getZeroFlag()) {
						CPU.setPC(branchInfo.addr);
					}
				}
			}
		},
		//PLX - Pull Index Register X from Stack
		0xFA: function() {
			return {
				size: 1,
				CPUCycleCount: MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1) + (MEMORY.getMemAccessCycleTime(0, CPU.getStackPointer()) << CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16 ? 1 : 0),
				func: function() {
					if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
						var LSB = CPU.popStack();
						var MSB = CPU.popStack();
						var val = utils.get2ByteValue(MSB, LSB);
					} else {
						var val = CPU.popStack();
					}
					CPU.loadX(val);
				}
			}
		},
		//XCE - Exchange Carry and Emulation Flags
		0xFB: function() {
			return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1),
				func: function() {
					var temp = CPU.getEmulationFlag();
					CPU.setEmulationFlag(CPU.carry);
					CPU.setCarryFlag(temp);
				}
			}
		},
		//SBC long,X - Subtract with borrow from Accumulator
		0xFF: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH,BANK
			var bank = MEMORY.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = MEMORY.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 4,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE) + (MEMORY.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2),
				func: function() {
					var val = MEMORY.getUInt16AtLocation(bank, CPU.getXIndex() + addr);
					CPU.doSubtraction(val);
				}
			}
		},
	}
};

//We need to fill in something here, we want it to break when we encounter an unhandled instruction, so this is how we do that.
var unsupportedInstruction = function(instructionNumber, CPU) {
	return function() {
		return {
			size: 0,
			CPUCycleCount: 0,
			func: function() {
				CPU.logger.printLog();
				throw new Error("Invalid function 0x" + instructionNumber.toString(16) + "!");
			}
		}
	}
};

//This conversion may seem kinda silly, especially since arrays aren't really arrays in JS (not always at least) but it's gained me about 30fps in render time, 
//   so an array is a SIGNIFICANTLY quicker datatype than a map.
var getInstructionArray = function(CPU, MEMORY) {
	var instructions = getInstructionMap(CPU, MEMORY);
	var returnArray = [];
	for(var i = 0; i < 256; i++) {
		if (instructions.hasOwnProperty(i)) {
			returnArray.push(instructions[i]);
		} else {
			returnArray.push(new unsupportedInstruction(i, CPU));
		}
	}
	
	return returnArray;
}

module.exports = getInstructionArray;