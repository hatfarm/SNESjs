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
	this.isHiRom = false;
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
};

var setVal = function(_this, bank, address, value) {
	if (address === 0x8FD && bank === 0) {
		_this.logger.printLog();
		//debugger;
	}
	if (value < 0) {
		new DataView(_this.banks[bank].buffer).setInt8(address, value);
	} else {
		new DataView(_this.banks[bank].buffer).setUint8(address, value);
	}
}

var writeMirroredLoRom = function(_this, bank, address, value) {
	setVal(_this, bank, address, value);
	if (bank >= 0x00 && bank <= 0x7D) {
		setVal(_this, bank + 0x80, address, value);
		if (bank <= 0x3F && address >= 0 && address <= 0x1FFF) {
			setVal(_this, 0x7E, address, value);
		}
	} else if (bank >= 0x80 && bank <= 0xFD) {
		setVal(_this, bank - 0x80, address, value);
		if (bank <= 0xBF && address >= 0 && address <= 0x1FFF) {
			setVal(_this, 0x7E, address, value);
		}
	} else if (bank === 0x7E && address <= 0x1FFF) {
		var i = 0;
		for (i = 0; i <= 0x3F; i++) {
			setVal(_this, i, address, value);
			setVal(_this, i + 0x80, address, value);
		}
	}
};

var writeMirroredHiRom = function(_this, bank, address, value) {
	_this.banks[bank][address] = value;
};

//After the ROM is loaded, it is copied to memory in certain locations, we're setting that up here
Memory.prototype.initializeMemory = function(romData, isHiRom) {
	this.isHiRom = isHiRom;
	if (isHiRom) {
		this.writeMirroredMemory = function(bank, address, value) { writeMirroredHiRom(this, bank, address, value) };
	} else {
		this.writeMirroredMemory = function(bank, address, value) { writeMirroredLoRom(this, bank, address, value) };
	}
	var curBank = 0;
	var romIndex = 0;
	//We're going to be creating all 256 banks, and putting any data we have in them.
	for(curBank = 0; curBank < 0xFF; curBank++) {
		var newBank = new Uint8ClampedArray(0x10000);
		this.banks.push(newBank);
	}
	for(curBank = 0; curBank < 0xFF; curBank++) {
		var i;
		for(i = 0; i < 0x10000; i++) {
			//We're either copying rom data over, or we're writing a zero to the memory location
			if (isMemoryAddressROM(curBank, i) && romIndex < romData.length) {
				writeMirroredLoRom(this, curBank, i, romData[romIndex]);
				romIndex++;
			} else {
				setVal(this, curBank, i, 0x55);
			}
		}
		
	}
};

//When Register 0x420D bit 1 is set, we have fast read, otherwise, slow read
var isFastOrSlow = function() {
	return !!(this.getByteAtLocation(0, 0x420D) & 0x01);
}

//Different memory locations have different timings, this information is from http://wiki.superfamicom.org/snes/show/Memory+Mapping
Memory.prototype.getMemAccessCycleTime = function(bank, address, val) {
	//From byuu himself, this is the fastest way to look this up.
	var addr = (bank << 16) | address;
	if(addr & 0x408000) return addr & 0x800000 ? romSpeed : 8;
	if(addr + 0x6000 & 0x4000) return 8;
	if(addr - 0x4000 & 0x7e00) return 6;
	//This is a DMA process
	if (addr === 0x00420B) {
		var retVal = 0;
		for (var i = 0; i < 8; i++) {
			//TODO: FILL IN TIME HERE
		}
		return retVal;
	}
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
};

Memory.prototype.setROMProtectedByteAtLocation = function(bank, address, value) {
	if(isMemoryAddressROM(bank, address)) {
		this.logger.printLog();
		throw new Error("Attempted write to ROM Address! Bank:" + bank.toString(16) + " Address:" + address.toString(16));
	} else {
		this.writeMirroredMemory(bank, address, value);
		if (address === 0x420B && bank === 0x00) {
			this.doDMA();
		} else if (address === 0x2180 && bank === 0x00) {
			this.writeToWRAM(value);
		}
	}
};

Memory.prototype.writeToWRAM = function(value){
	var bank = this.getByteAtLocation(0, 0x2183);
	var addr = this.getUInt16AtLocation(0, 0x2181);
	this.setROMProtectedByteAtLocation(bank, addr, value);
	addr++;
	if (addr >= 65536) {
		bank++;
		if (bank > 0xFF) {
			bank = 0x00;
		}
		this.setROMProtectedByteAtLocation(0, 0x2183, bank);
		addr = addr % 65536;
	}
	
	this.setROMProtectedWordAtLocation(0, 0x2181, addr);
};

Memory.prototype.getNumBytesToTransfer = function(channel) {
	return this.getUInt16AtLocation(0, 0x4305 | (channel << 4));
};

Memory.prototype.doDMA = function() {
	var MDMAEN = this.getByteAtLocation(0, 0x420B);
	if (MDMAEN) {
		var enableMask = 1;
		for (var i = 0; i < 8; i++) {
			if (enableMask & MDMAEN) {
				this.doDMAForChannel(i);
			}
			enableMask = enableMask << 1;
		}
	}
};

Memory.prototype.doDMAForChannel = function(channel) {
	var bytesToTransfer = this.getNumBytesToTransfer(channel);
	var controlRegister = this.getByteAtLocation(0, 0x4300 | (channel << 4));
	var isPPUtoCPU = !!(0x80 & controlRegister);
	var isFixedMemoryAddress = !!(0x10 & controlRegister);
	var shouldDecrementAddress = !!(0x08 & controlRegister);
	var srcAddr = isPPUtoCPU ? this.getPPUAddressForChannel(channel) : this.getCPUAddressForChannel(channel);
	var dstAddr = isPPUtoCPU ? this.getCPUAddressForChannel(channel) : this.getPPUAddressForChannel(channel);
	var DMATransferMode = 0x07 & controlRegister;

	switch(DMATransferMode) {
		case 0:
		case 2:
			this.doDMAWork(isFixedMemoryAddress, shouldDecrementAddress, srcAddr, dstAddr, bytesToTransfer, isPPUtoCPU, 1, 1);
			break;
		case 1:
			this.doDMAWork(isFixedMemoryAddress, shouldDecrementAddress, srcAddr, dstAddr, bytesToTransfer, isPPUtoCPU, 2, 1);
			break;
		case 3:
			this.doDMAWork(isFixedMemoryAddress, shouldDecrementAddress, srcAddr, dstAddr, bytesToTransfer, isPPUtoCPU, 2, 2);
			break;
		case 4:
			this.doDMAWork(isFixedMemoryAddress, shouldDecrementAddress, srcAddr, dstAddr, bytesToTransfer, isPPUtoCPU, 4, 1);
			break;
		case 5:
			throw new Error("DMA Mode 5 not yet supported!");
		case 6:
			throw new Error("DMA Mode 6 not yet supported!");
		case 7:
			throw new Error("DMA Mode 7 not yet supported!");
	}
};

Memory.prototype.doDMAWork = function(isFixedMemoryAddress, shouldDecrementAddress, srcAddr, dstAddr, bytesToTransfer, isPPUtoCPU, numRegisters, numWritePerRegister) {
	var registerOffset = 0;
	var writeCount = 0 ;
	var cpuAddr = isPPUtoCPU ? dstAddr : srcAddr;
	var ppuAddr = isPPUtoCPU ? srcAddr : dstAddr;
	var basePPUAddress = ppuAddr.address;
	do {
		this.setROMProtectedByteAtLocation(dstAddr.bank, dstAddr.address, this.getByteAtLocation(srcAddr.bank, srcAddr.address));

		bytesToTransfer = Utils.subtractWithWrapAround16(bytesToTransfer);
		if (bytesToTransfer <= 0) {
			return;
		}

		if (!isFixedMemoryAddress) {
			if (shouldDecrementAddress) {
				cpuAddr.address = Utils.subtractWithWrapAround16(cpuAddr.address);
			} else {
				cpuAddr.address = Utils.addWithWrapAround16(cpuAddr.address);
			}
		}
		
		writeCount = (writeCount + 1) % numWritePerRegister;
		
		if (writeCount === 0) {
			registerOffset = (registerOffset + 1) % numRegisters;
			ppuAddr.address = basePPUAddress + registerOffset;
		}
	} while (bytesToTransfer > 0);
};

Memory.prototype.getCPUAddressForChannel = function(channel) {
	return {
		bank: this.getByteAtLocation(0, 0x4304 | (channel << 4)),
		address: this.getUInt16AtLocation(0, 0x4302 | (channel << 4)),
	}
};

Memory.prototype.getPPUAddressForChannel = function(channel) {
	return {
		bank: 0,
		address: Utils.get2ByteValue(0x21, this.getByteAtLocation(0, 0x4301 | (channel << 4))),
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
		var buf = new ArrayBuffer(2);
		var tempDV = new DataView(buf);
		if(value >= 0x7FFF) {
			tempDV.setUint16(0, value, true); //True is for little endian
		} else {
			tempDV.setInt16(0, value, true); //True is for little endian
		}
		//Moved this to the less efficient double copy to make mirroring easier, this is a place we could improve efficiency later
		this.setROMProtectedByteAtLocation(bank, address, tempDV.getUint8(0));
		this.setROMProtectedByteAtLocation(bank, address + 1, tempDV.getUint8(1));
		
	}
};

module.exports = Memory;