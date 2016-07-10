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

/*The memory in the SNES is byte addressable and is stored in several banks, there are 256 banks (0x00 -> 0xFF)
The way memory is address is 0xBB:AAAA where BB is a bank, and then AAAA is the memory address.
There are 16MB addressable by the system.*/
var Memory = function() {
	this.banks = [];
}

//After the ROM is loaded, it is copied to memory in certain locations, we're setting that up here
Memory.prototype.initializeMemory = function(romData) {
	var curBank = 0;
	var romIndex = 0;
	//We're going to be creating all 256 banks, and putting any data we have in them.
	for(curBank = 0; curBank < 0xFF; curBank++) {
		var newBank = [];
		var startingByte = 0;
		if ((curBank >= 0 && curBank < 0x40) || (curBank >= 0x80 && curBank < 0xBF)) {
			startingByte = 0x8000;
		} else if(curBank === 0x7E || curBank === 0x7F) {
			//There's no ROM stored in either of these banks, so we set the starting byte out of range
			startingByte = 0x10000;
		}
		var i;
		for(i = 0; i < 0x10000; i++) {
			//We're either copying rom data over, or we're writing a zero to the memory location
			if (i >= startingByte && romIndex < romData.length) {
				newBank.push(romData.charCodeAt(romIndex));
				romIndex++;
			} else {
				newBank.push(0);
			}
		}
		this.banks.push(newBank);
	}
}

Memory.prototype.getValAtLocation = function(bank, address) {
	return this.banks[bank][address];
}

Memory.prototype.setValAtLocation = function(bank, address, value) {
	this.banks[bank][address] = value;
}

module.exports = Memory;