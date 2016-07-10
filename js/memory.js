/*The memory in the SNES is byte addressable and is stored in several banks, there are 256 banks (0x00 -> 0xFF)
The way memory is address is 0xBB:AAAA where BB is a bank, and then AAAA is the memory address.
There are 16MB addressable by the system.*/
var Memory = function() {
	
	//We always start in bank 00
	this.currentBank = 0;
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

Memory.prototype.getValAtLocation = function(address) {
	return this.banks[this.currentBank][address];
}

Memory.prototype.getAtLocation = function(address, value) {
	this.banks[this.currentBank][address] = value;
}

module.exports = Memory;