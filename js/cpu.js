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
**********************************************************************/
var utils = require('./utils.js');

/*Most of the information here is from http://wiki.superfamicom.org/snes/show/65816+Reference*/
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
	this.dpr = 0; //Direct Page register, used when direct paging is used, it holds memory address
	this.accumulator = 0; //The accumulator, used in math
	//Index registers, general purpose
	this.indexX = 0;
	this.indexY = 0;
	
	
	//This may or may not be useful, but I think it'll be useful when drawing.
	this.cycleCount = 0;
	
	//Arrays in JS have stack functionality built in.
	this.stack = [];
	
	//The memory used by the system
	this.memory;
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

CPU.prototype.execute = function() {
	var instruction = this.memory.getValAtLocation(this.pbr, this.pc);
	var byte1 = this.memory.getValAtLocation(this.pbr, this.pc + 1);
	var byte2 = this.memory.getValAtLocation(this.pbr, this.pc + 2);
	var byte3 = this.memory.getValAtLocation(this.pbr, this.pc + 3);
	var logString = "PC: 0x" + this.pc.toString(16) + " -- Instruction: 0x" + instruction.toString(16) + "...";
	
	if (this.instructionMap.hasOwnProperty(instruction)) {
		this.instructionMap[instruction].bind(this)(byte1, byte2, byte3);
	} else {
		this.incPCandCC(1, 1);
		logString += "FAILED!";
	}
	console.log(logString);
}

CPU.prototype.incPCandCC = function(pc_inc, cc_inc) {
	this.pc += pc_inc;
	this.cycleCount += cc_inc;
}

CPU.prototype.instructionMap = {
	//BRK -- Break
	0x0: function() {
		//There's no extra processing, but this skips the next opcode, and also uses an extra cycle if not in emulation mode
		this.incPCandCC(2, this.isEmulationFlag ? 8 : 7);
	},
	//CLC -- Clear Carry
	0x18: function() {
		this.carry = false;
		this.incPCandCC(1, 2);
	},
	//AND (_dp,_X) - AND accumulator with memory
	0x21: function() {
		
		this.incPCandCC(2, 6);
	},
	//PHK - Push Program Bank Register
	0x4B: function() {
		this.stack.push(this.pc);
		this.incPCandCC(1, 3);
	},
	//SEI - Set Interrupt Disable Flag
	0x78: function() {
		this.IRQDisabled = true;
		this.incPCandCC(1, 2);
	},
	//STZ - Store Zero to Memory
	0x9C: function(lsb, msb) {
		this.memory.setValAtLocation(this.pbr, utils.get2ByteValue(msb,lsb), 0);
		this.incPCandCC(3, 4);
	},
	//PLB - Pull Data Bank Register
	0xAB: function() {
		this.dbr = this.stack.pop();
		this.incPCandCC(1, 4);
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