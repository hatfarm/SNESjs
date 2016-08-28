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
var Utils = require('./utils.js');
/*The memory in the SNES is byte addressable and is stored in several banks, there are 256 banks (0x00 -> 0xFF)
The way memory is address is 0xBB:AAAA where BB is a bank, and then AAAA is the memory address.
There are 16MB addressable by the system.*/
var Memory = function() {
	this.banks = [];
};

var IS_LITTLE_ENDIAN = true;

//This is a private function that will tell us if we're trying to write to ROM, which should only be allowed during initialization 
var isMemoryAddressROM = function(bank, address) {
	if(bank === 0x7E || bank === 0x7F) {
		return false;
	} else if ((bank >= 0 && bank < 0x40) || (bank >= 0x80 && bank < 0xBF)) {
		if(address < 0x8000) {
			return false;
		}
	}
	
	return true;
};

Memory.prototype.setLogger = function(Logger) {
	this.logger = Logger;
}

//After the ROM is loaded, it is copied to memory in certain locations, we're setting that up here
Memory.prototype.initializeMemory = function(romData) {
	var curBank = 0;
	var romIndex = 0;
	//We're going to be creating all 256 banks, and putting any data we have in them.
	for(curBank = 0; curBank < 0xFF; curBank++) {
		var newBank = new Uint8ClampedArray(0x10000);
		var i;
		for(i = 0; i < 0x10000; i++) {
			//We're either copying rom data over, or we're writing a zero to the memory location
			if (isMemoryAddressROM(curBank, i) && romIndex < romData.length) {
				newBank[i] = romData[romIndex];
				romIndex++;
			}
		}
		this.banks.push(newBank);
	}
};

//When Register 0x420D bit 1 is set, we have fast read, otherwise, slow read, this is hardcoded to slow for now...
var isFastOrSlow = function() {
	return false;
}

//Different memory locations have different timings, this information is from http://wiki.superfamicom.org/snes/show/Memory+Mapping
Memory.prototype.getMemAccessCycleTime = function(bank, address) {
	//From byuu himself, this is the fastest way to look this up.
	var addr = (bank << 16) | address;
	if(addr & 0x408000) return addr & 0x800000 ? romSpeed : 8;
	if(addr + 0x6000 & 0x4000) return 8;
	if(addr - 0x4000 & 0x7e00) return 6;
	return 12;
};

Memory.prototype.getUnsignedValAtLocation = function(bank, address, isEightBit) {
	if (isEightBit) {
		return this.getByteAtLocation(bank, address);
	}
	
	return this.getUInt16AtLocation(bank, address);
};

Memory.prototype.getByteAtLocation = function(bank, address) {
	return new DataView(this.banks[bank].buffer).getUint8(address);
};

Memory.prototype.getSignedByteAtLocation = function(bank, address) {
	return new DataView(this.banks[bank].buffer).getInt8(address);
};

Memory.prototype.getInt16AtLocation = function(bank, address) {
	return new DataView(this.banks[bank].buffer).getInt16(address, IS_LITTLE_ENDIAN);
};

Memory.prototype.getUInt16AtLocation = function(bank, address) {
	return new DataView(this.banks[bank].buffer).getUint16(address, IS_LITTLE_ENDIAN);
}

Memory.prototype.setROMProtectedByteAtLocation = function(bank, address, value) {
	if(isMemoryAddressROM(bank, address)) {
		this.logger.printLog();
		throw new Error("Attempted write to ROM Address! Bank:" + bank.toString(16) + " Address:" + address.toString(16));
	} else {
		this.banks[bank][address] = value;
	}
};

Memory.prototype.setROMProtectedValAtLocation = function(bank, address, value, isEightBit) {
	if (isEightBit) {
		this.setROMProtectedByteAtLocation(bank, address, value);
	} else {
		this.setROMProtectedWordAtLocation(bank, address, value);
	}
};

Memory.prototype.setROMProtectedWordAtLocation = function(bank, address, value) {
	if(isMemoryAddressROM(bank, address)) {
		this.logger.printLog();
		throw new Error("Attempted write to ROM Address! Bank:" + bank.toString(16) + " Address:" + address.toString(16));
	} else {
		if(value >= 0x7FFF) {
			new DataView(this.banks[bank].buffer).setUint16(address, value, true); //True is for little endian
		} else {
			new DataView(this.banks[bank].buffer).setInt16(address, value, true); //True is for little endian
		}
	}
}

module.exports = Memory;