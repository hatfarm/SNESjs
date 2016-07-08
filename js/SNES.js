var emulator;

var SNESEmu = function(canvas, romContent) {
	this.canvas = canvas;
	this.ctx = this.canvas.getContext( '2d' );
	this.romData = romContent;
	setSMCOffset(this);
	setHiLoRom(this);
	
	//We want to load the name of the ROM, from the ROM, so we do that here:
	this.romName = "";
	var hi_romName = "";
	var lo_romName = "";
	for(var i = 0; i < 21; i++){
		var idx = this.headerStart + 0x010 + this.smcOffset + i;
		if(!this.romData[idx]){break;}
		this.romName += this.romData[idx];
	}
	console.log(this.romName);
	
	function setHiLoRom(_this) {
		var hiChecksum = (_this.romData[_this.smcOffset + 0xFFDC].charCodeAt(0) * 256) + _this.romData[_this.smcOffset + 0xFFDD].charCodeAt(0) | 
							(_this.romData[_this.smcOffset + 0xFFDE].charCodeAt(0) * 256) + _this.romData[_this.smcOffset + 0xFFDF].charCodeAt(0);
		var loChecksum = (_this.romData[_this.smcOffset + 0x7FDC].charCodeAt(0) * 256) + _this.romData[_this.smcOffset + 0x7FDD].charCodeAt(0) | 
							(_this.romData[_this.smcOffset + 0x7FDE].charCodeAt(0) * 256) + _this.romData[_this.smcOffset + 0x7FDF].charCodeAt(0);
		if (hiChecksum === 0xFFFF) {
			console.log("This is a hiRom game.")
			_this.headerStart = 0xFFB0;
		} else if (loChecksum === 0xFFFF) {
			console.log("This is a loRom game.")
			_this.headerStart = 0x7FB0;
		} else {
			console.log("Cannot locate header start...");
		}
	}
	
	function setSMCOffset(_this) {
		if(_this.romData.length & 0x200){
			console.log("This has an SMC header.");
			_this.smcOffset = 0x200;
		} else {
			console.log("This does not appear to have an SMC header.");
			_this.smcOffset = 0;
		}
	}
}