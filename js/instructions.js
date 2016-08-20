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

var getIndirectLongIndexedYCyclesAddrBank = function(CPU) {
	var addressLocation = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
	var bank = CPU.memory.getByteAtLocation(0, addressLocation + 2);
	var addr = CPU.memory.getUInt16AtLocation(0, addressLocation) + CPU.getYIndex();
	var cycles = (CPU.memory.getMemAccessCycleTime(0, addressLocation) << 1) + Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(bank, addr);
	if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
		cycles += CPU.memory.getMemAccessCycleTime(bank, addr);
	}
	
	if (CPU.getDPRLowNotZero()) {
		cycles += Timing.FAST_CPU_CYCLE;
	}
	return {
		bank: bank,
		addr: addr, 
		cycles: cycles,
	}
};

var getRelativeBranchInformation = function(CPU, isBranchTaken, isBranchAlways) {
	var branchOffset = CPU.memory.getSignedByteAtLocation(CPU.pbr, CPU.getPC() + 1);
	var addr = branchOffset + CPU.getPC() + 2;
	var crossedPageBoundary = (CPU.getPC() & 0xFF00) != (addr & 0xFF00);
	if (!isBranchAlways) {
		var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.getPC()) << 1) + !isBranchTaken ? 0 : (Timing.FAST_CPU_CYCLE + (CPU.getEmulationFlag() && crossedPageBoundary ? Timing.FAST_CPU_CYCLE : 0));
	} else {
		var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.getPC()) << 1) + (CPU.getEmulationFlag() && crossedPageBoundary ? Timing.FAST_CPU_CYCLE : 0);
	}
	return {
		addr: addr,
		cycles: cycles,
	}
};

var getInstructionMap = function(CPU) {
	return {
		//BRK -- Break
		0x00: function() {
				return {
					size: 2,
					CPUCycleCount: (Timing.FAST_CPU_CYCLE << 2) + (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
					func: function() {
						//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
					},
				}
		},
		//ORA (_dp, _X) - OR Accumulator with Memory
		0x01: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addressLocation = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
			var orVal = CPU.memory.getUnsignedValAtLocation(0, addressLocation, accSize);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(0, addressLocation) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
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
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
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
		//JSR addr - Jump to Subroutine
		0x20: function() {
				var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				return {
					size: 3,
					CPUCycleCount: (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE,
					func: function() {
						CPU.jumpToSubroutine(addr, null);
					}
				}
		},
		//AND (_dp,_X) - AND accumulator with memory (direct indexed)
		0x21: function() {
				var dpMath = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
				return {
					size: 2,
					CPUCycleCount: (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(CPU.dbr, dpMath) << 1) + (Timing.FAST_CPU_CYCLE << 1),
					func: function() {
						var memResult = CPU.memory.getByteAtLocation(CPU.dbr, dpMath);
						CPU.setAccumulator(CPU.getAccumulator() & memResult.val);
						CPU.updateNegativeFlag(CPU.getAccumulator(), CPU.accumSizeSelect);
						CPU.updateZeroFlag(CPU.getAccumulator());
					}
				}
		},
		//JSL long - Jump to Subroutine
		0x22: function() {
				var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var bank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 3);
				return {
					size: 4,
					CPUCycleCount: (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2) + (Timing.FAST_CPU_CYCLE << 2),
					func: function() {
						CPU.jumpToSubroutine(addr, bank);
					}
				}
		},
		//PHA - Push Accumulator
		0x48: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.pushStack(CPU.getAccumulator());
				}
			}
		},
		//PHK - Push Program Bank Register
		0x4B: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.pushStack(CPU.pc);
				}
			}
		},
		//JMP addr - Jump to address (immediate)
		0x4C: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //3 CPU cycles
				func: function() {
					CPU.setPC(addr);
				}
			}
		},
		//EOR (_dp_) - Exclusive-OR Accumulator with Memory
		0x52: function() {
			var accSize = CPU.getAccumulatorOrMemorySize();
			var addressLocation = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var xorVal = CPU.memory.getUnsignedValAtLocation(0, addressLocation, accSize);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(0, addressLocation) << accSize === BIT_SELECT.BIT_8 ? 0 : 1);
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
			var srcBank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
			var dstBank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 2);
			var size = CPU.getAccumulator16() + 1;
			return {
				size: 3,
				CPUCycleCount: size * (Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + 
										CPU.memory.getMemAccessCycleTime(dstBank, CPU.getYIndex()) + CPU.memory.getMemAccessCycleTime(srcBank, CPU.getXIndex())),
				func: function() {
					var accum = CPU.getAccumulator16();
					//You could just do a memcpy here, but I'm not sure that a memcpy with overlapping addresses would work, and so this ensures it works right.
					while (accum != 0xFFFF) {
						CPU.memory.setROMProtectedByteAtLocation(dstBank, CPU.getYIndex(), CPU.memory.getByteAtLocation(srcBank, CPU.getXIndex()));
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
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc), //2 CPU cycles
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
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.getStackPointer()) << 1), //6 CPU cycles
				func: function() {
					CPU.returnFromSubroutine(false);
				}
			};
		},
		//STZ dp - Store Zero to Memory
		0x64: function() {
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(0, addr);
			if (CPU.getDPR() & 0xFF00 !== 0) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			if (CPU.getAccumulatorOrMemorySize()) {
				cycles += CPU.memory.getMemAccessCycleTime(0, addr);
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, 0, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//ADC #const - Add with Carry
		0x69: function() {
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_8) {
				var size = 2;
				var addVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var addVal = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
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
			var branchInfo = getRelativeBranchInformation(CPU, true, true);
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
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1), CPU.getXIndex());
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(0, addr) << CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16 ? 1 : 0);
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 2,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//BRA nearlabel - Branch Always
		0x82: function() {
			var branchOffset = CPU.memory.getInt16AtLocation(CPU.pbr, CPU.getPC() + 1);
			var addr = branchOffset + CPU.getPC() + 2;
			return {
				size: 3,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setPC(addr);
				}
			}
		},
		//STA sr,S - Store Accumulator to Memory
		0x83: function() {
			var addr = CPU.getStackRelativeLocation(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + (CPU.memory.getMemAccessCycleTime(0, addr) << CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16 ? 1 : 0),
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STY dp - Store Index Register Y to Memory
		0x84: function() {
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(0, addr),
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, CPU.getYIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA dp - Store Accumulator to Memory
		0x85: function() {
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(0, addr),
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STX dp - Store Index Register X to Memory
		0x86: function() {
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			return {
				size: 2,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(0, addr),
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(0, addr, CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//DEY - Decrement Y Register
		0x88: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadY(CPU.getYIndex() - 1);
				}
			}
		},
		//TXA - Transfer X Index to Accumulator
		0x8A: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.loadAccumulator(CPU.getXIndex());
				}
			}
		},
		//STY addr - Store Index Register Y to Memory
		0x8C: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getYIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA addr - Store Accumulator to Memory
		0x8D: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STX addr - Store Index Register X to Memory
		0x8E: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STA long - Store Accumulator to Memory, specific address
		0x8F: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH,BANK
			var bank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 4,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					if(CPU.getEmulationFlag()  || CPU.accumSizeSelect === BIT_SELECT.BIT_8) {
						CPU.memory.setROMProtectedByteAtLocation(bank, addr, CPU.getAccumulator());
					} else {
						CPU.memory.setROMProtectedWordAtLocation(bank, addr, CPU.getAccumulator());
					}
				}
			}
		},
		//STA (dp), Y - Store Accumulator to Memory
		0x97: function() {
			var vals = getIndirectLongIndexedYCyclesAddrBank(CPU);
			return {
				size: 2,
				CPUCycleCount: vals.cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(vals.bank, vals.addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//TXS - Transfer X Index to Stack Pointer
		0x9A: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setStackPointer(CPU.getXIndex());
				}
			}
		},
		//TXY - Transfer X Index to Y Index
		0x9B: function() {
			return {
				size: 1,
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setYIndex(CPU.getXIndex());
					CPU.updateZeroFlag(CPU.getXIndex());
					CPU.updateNegativeFlag(CPU.getXIndex(), CPU.getIndexRegisterSize());
				}
			}
		},
		//STZ addr - Store Zero to Memory
		0x9C: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 3,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr),
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, 0, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//STA addr,X - Store Accumulator to Memory
		0x9D: function() {
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1) + CPU.getXIndex();
			var cycles = Timing.FAST_CPU_CYCLE + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, CPU.getAccumulator(), CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//LDY #const - Load Index Register Y from Memory
		0xA0: function() {
			if (CPU.getIndexRegisterSize() === BIT_SELECT.BIT_8) {
				var size = 2;
				var newVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
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
				var newVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE;
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
			var addr = CPU.getDirectPageValue(CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1));
			var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, addr) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			if (CPU.getDPRLowNotZero()) {
				cycles += Timing.FAST_CPU_CYCLE;
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.memory.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()));
				}
			}
		},
		//LDA #const - Load Accumulator with const
		0xA9: function() {
			if (CPU.getAccumulatorSizeSelect() === BIT_SELECT.BIT_8) {
				var size = 2;
				var newVal = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE;
			} else {
				var size = 3;
				var newVal = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
				var cycles = CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1 + Timing.FAST_CPU_CYCLE;
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
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(val);
				}
			}
		},
		//PLB - Pull Data Bank Register
		0xAB: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.dbr = (0xFF & CPU.popStack());
				}
			}
		},
		//LDA addr - Load Accumulator from Memory
		0xAD: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			var cycles = (Timing.FAST_CPU_CYCLE) + CPU.memory.getMemAccessCycleTime(CPU.pbr, addr) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				cycles += CPU.memory.getMemAccessCycleTime(CPU.pbr, addr);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					CPU.loadAccumulator(CPU.memory.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()));
				}
			}
		},
		//BCS - Branch if carry set
		0xB0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, CPU.getCarryFlagStatus(), false);
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
			var vals = getIndirectLongIndexedYCyclesAddrBank(CPU);
			return {
				size: 2,
				CPUCycleCount: vals.cycles,
				func: function() {
					CPU.loadAccumulator(CPU.memory.getUnsignedValAtLocation(vals.bank, vals.addr, CPU.getAccumulatorOrMemorySize()));
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
		//INY - Increment Y Register
		0xC8: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadY(CPU.getYIndex() + 1);
				}
			}
		},
		//DEX - Decrement X Register
		0xCA: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(CPU.getXIndex() - 1);
				}
			}
		},
		//BNE - Branch if not equal
		0xD0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, !CPU.getZeroFlag(), false);
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
				CPUCycleCount: Timing.FAST_CPU_CYCLE + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc),
				func: function() {
					CPU.setDecimalMode(false);
				}
			}
		},
		//PHX - Push X Index Register
		0xDA: function() {
				return {
				size: 1,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE << 1) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + 
									(CPU.getIndexRegisterSize() === BIT_SELECT.BIT_16 ? Timing.FAST_CPU_CYCLE : 0), //3 CPU cycles (+1 w/ 16-bit index registers)
				func: function() {
					CPU.pushStack(CPU.getAccumulator());
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
				var cycles = (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1) + Timing.FAST_CPU_CYCLE ;
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
		//INX - Increment X Register
		0xE8: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					CPU.loadX(CPU.getXIndex() + 1);
				}
			}
		},
		//NOP - No op
		0xEA: function() {
			return {
				size: 1,
				CPUCycleCount: CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + Timing.FAST_CPU_CYCLE,
				func: function() {
					//DO NOTHING
				}
			}
		},
		//INC addr - Increment value from Memory
		0xEE: function() {
			//This is little endian, so the byte structure is ADDRL,ADDRH
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			if (CPU.getAccumulatorOrMemorySize() === BIT_SELECT.BIT_16) {
				var cycles = (Timing.FAST_CPU_CYCLE) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 1);
			} else {
				var cycles = (Timing.FAST_CPU_CYCLE) + CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2);
			}
			return {
				size: 3,
				CPUCycleCount: cycles,
				func: function() {
					var newVal = CPU.memory.getUnsignedValAtLocation(CPU.pbr, addr, CPU.getAccumulatorOrMemorySize()) + 1;
					CPU.updateZeroFlag(newVal);
					CPU.updateNegativeFlag(newVal, CPU.getAccumulatorOrMemorySize());
					CPU.memory.setROMProtectedValAtLocation(CPU.pbr, addr, newVal, CPU.getAccumulatorOrMemorySize());
				}
			}
		},
		//BEQ - Branch if equal
		0xF0: function() {
			var branchInfo = getRelativeBranchInformation(CPU, CPU.getZeroFlag(), false);
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
			var bank = CPU.memory.getByteAtLocation(CPU.pbr, CPU.pc + 3);
			var addr = CPU.memory.getUInt16AtLocation(CPU.pbr, CPU.pc + 1);
			return {
				size: 4,
				CPUCycleCount: (Timing.FAST_CPU_CYCLE) + (CPU.memory.getMemAccessCycleTime(CPU.pbr, CPU.pc) << 2),
				func: function() {
					var val = CPU.getMFlag === CPU.memory.getUInt16AtLocation(bank, CPU.getXIndex() + addr);
					CPU.doSubtraction(val);
				}
			}
		},
	}
};

//We need to fill in something here, we want it to break when we encounter an unhandled instruction, so this is how we do that.
var unsupportedInstruction = function(instructionNumber) {
	return function() {
		return {
			size: 0,
			CPUCycleCount: 0,
			func: function() {
				throw "Invalid function 0x" + instructionNumber.toString(16) + "!";
			}
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