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
	proc.init(getResetPC());
	
	var running = true;
	
	while(running) {
		proc.execute(_this.romData[_this.smcOffset + _this.headerStart + proc.pc].charCodeAt(0), _this.romData[_this.smcOffset + _this.headerStart + proc.pc + 1].charCodeAt(0),
					_this.romData[_this.smcOffset + _this.headerStart + proc.pc + 2].charCodeAt(0), _this.romData[_this.smcOffset + _this.headerStart + proc.pc + 3].charCodeAt(0))
	}
	
	function setHiLoRom() {
		var hiChecksum = getCheckSumValue(HIROM_START_LOC);
		var hiRomSizeCheck = getROMSizeIsValid(HIROM_START_LOC);
		var loChecksum = getCheckSumValue(LOROM_START_LOC);
		var loRomSizeCheck = getROMSizeIsValid(LOROM_START_LOC);
		if (hiChecksum === 0xFFFF 
			&& _this.romData[_this.smcOffset + HIROM_START_LOC + 0x25].charCodeAt(0) & 1 === 1
			&& hiRomSizeCheck) 
		{
			console.log("This is a hiRom game.")
			_this.headerStart = HIROM_START_LOC;
		} 
		//This is a bit loose, but Super Mario World fails to find the correct name if we don't have this be this loose
		if (loChecksum === 0xFFFF && loRomSizeCheck) {
			console.log("This is a loRom game.")
			_this.headerStart = LOROM_START_LOC;
		} 

		if (_this.headerStart === 0) {
			console.log("Cannot locate header start...");
		}
	}
	
	function getCheckSumValue(romStartLoc) {
		return utils.get2ByteValue(_this.romData[_this.smcOffset + romStartLoc + 0x2C].charCodeAt(0), _this.romData[_this.smcOffset + romStartLoc + 0x2D].charCodeAt(0)) | 
							utils.get2ByteValue(_this.romData[_this.smcOffset + romStartLoc + 0x2E].charCodeAt(0), _this.romData[_this.smcOffset + romStartLoc + 0x2F].charCodeAt(0));
	}
	
	function getROMSizeIsValid(romStartLoc) {
		var lshift = _this.romData[_this.smcOffset + romStartLoc + 0x27].charCodeAt(0);
		var minSize = 0x400 << (lshift - 1);
		var maxSize = 0x400 << lshift;
		
		return minSize < _this.romData.length - _this.smcOffset && maxSize >= _this.romData.length - _this.smcOffset;
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
	
	function getResetPC() {
		//It's little endian, so we use the little endian values
		var val = utils.get2ByteValue(_this.romData[_this.smcOffset + _this.headerStart + 0x4D].charCodeAt(0), _this.romData[_this.smcOffset + _this.headerStart + 0x4C].charCodeAt(0));
		val = val + _this.smcOffset - (_this.headerStart + 0x50); 
		return val;
	}
};

module.exports = SNESEmu;