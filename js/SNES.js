var Processor = require('./processor.js');
var utils = require('./utils.js');
var HIROM_START_LOC = 0xFFB0;
var LOROM_START_LOC = 0x7FB0;

var SNESEmu = function(canvas, romContent) {
	var _this = this;
	this.canvas = canvas;
	this.ctx = this.canvas.getContext( '2d' );
	this.romData = romContent;
	_this.headerStart = 0;
	setSMCOffset();
	setHiLoRom();
	
	//We want to load the name of the ROM, from the ROM, so we do that here:
	this.romName = "";
	for(var i = 0; i < 21; i++){
		var idx = this.headerStart + 0x010 + this.smcOffset + i;
		if(!this.romData[idx]){break;}
		this.romName += this.romData[idx];
	}
	console.log(this.romName);
	var proc = new Processor();
	proc.init(utils.get2ByteValue(this.romData[this.smcOffset + this.headerStart + 0x4C].charCodeAt(0), _this.romData[_this.smcOffset + this.headerStart + 0x4D].charCodeAt(0)));
	
	function setHiLoRom() {
		var hiChecksum = utils.get2ByteValue(_this.romData[_this.smcOffset + HIROM_START_LOC + 0x2C].charCodeAt(0), _this.romData[_this.smcOffset + HIROM_START_LOC + 0x2D].charCodeAt(0)) | 
							utils.get2ByteValue(_this.romData[_this.smcOffset + HIROM_START_LOC + 0x2E].charCodeAt(0), _this.romData[_this.smcOffset + HIROM_START_LOC + 0x2F].charCodeAt(0));
		var loChecksum = utils.get2ByteValue(_this.romData[_this.smcOffset + LOROM_START_LOC + 0x2C].charCodeAt(0), _this.romData[_this.smcOffset + LOROM_START_LOC + 0x2D].charCodeAt(0)) | 
							utils.get2ByteValue(_this.romData[_this.smcOffset + LOROM_START_LOC + 0x2E].charCodeAt(0), _this.romData[_this.smcOffset + LOROM_START_LOC + 0x2F].charCodeAt(0));
		if (hiChecksum === 0xFFFF && _this.romData[_this.smcOffset + HIROM_START_LOC + 0x25].charCodeAt(0) & 1 === 1) {
			console.log("This is a hiRom game.")
			_this.headerStart = HIROM_START_LOC;
		} 
		//This is a bit loose, but Super Mario World fails to find the correct name if we don't have this be this loose
		if (loChecksum === 0xFFFF) {
			console.log("This is a loRom game.")
			_this.headerStart = LOROM_START_LOC;
		} 

		if (_this.headerStart === 0) {
			console.log("Cannot locate header start...");
		}
	}
	
	function setSMCOffset() {
		if(_this.romData.length & 0x200){
			console.log("This has an SMC header.");
			_this.smcOffset = 0x200;
		} else {
			console.log("This does not appear to have an SMC header.");
			_this.smcOffset = 0;
		}
	}
};

module.exports = SNESEmu;