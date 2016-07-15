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
var CPU = require('./cpu.js');
var PPU = require('./ppu.js');
var Memory = require('./memory.js');
var utils = require('./utils.js');
var Logger = require('./logger.js');
var HIROM_START_LOC = 0xFFB0;
var LOROM_START_LOC = 0x7FB0;

var SNESEmu = function(canvas, romContent) {
	var _this = this;
	this.canvas = canvas;
	this.ctx = this.canvas.getContext( '2d' );
	this.romData = romContent;
	this.logger = new Logger();
	this.headerStart = 0;
	this.keepRunning = true;
	setSMCOffset();
	setHiLoRom();
	
	//We want to load the name of the ROM, from the ROM, so we do that here:
	this.romName = "";
	for(var i = 0; i < 21; i++){
		var idx = this.headerStart + 0x010 + this.smcOffset + i;
		if(!this.romData[idx]){break;}
		this.romName += this.romData[idx];
	}
	this.logger.log(this.romName);
	var proc = new CPU();
	var memory = new Memory();
	var ppu = new PPU();
	proc.init(getResetPC(), memory);
	memory.initializeMemory(this.romData);
	ppu.init(memory);
	
	function frame() {
		if (_this.keepRunning) {
			update();
			render();
			renderAudio();
		}
		requestAnimationFrame(frame); // request the next frame
	}

	requestAnimationFrame(frame); // start the first frame
	
	function render() {
		var img = ppu.getImage();
		//This takes the image rendered by the PPU to the ROM's specs, and then scales it to fit the desired display size.
		_this.ctx.drawImage(img, 0, 0, img.width,    img.height,    // source rectangle
						0, 0, _this.canvas.width, _this.canvas.height);  // destination rectangle
	}
	
	function renderAudio() {
		//TODO: Process audio
	}
	
	function update() {
		proc.execute(357955);
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
			_this.logger.log("This is a hiRom game.")
			_this.headerStart = HIROM_START_LOC;
		} 
		//This is a bit loose, but Super Mario World fails to find the correct name if we don't have this be this loose
		if (loChecksum === 0xFFFF && loRomSizeCheck) {
			_this.logger.log("This is a loRom game.")
			_this.headerStart = LOROM_START_LOC;
		} 

		if (_this.headerStart === 0) {
			_this.logger.log("Cannot locate header start...");
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
			_this.logger.log("This has an SMC header.");
			_this.smcOffset = 0x200;
		} else {
			_this.logger.log("This does not appear to have an SMC header.");
			_this.smcOffset = 0;
		}
	}
	
	function getResetPC() {
		//It's little endian, so we use the little endian values
		var msb = _this.romData.charCodeAt(_this.smcOffset + _this.headerStart + 0x4D);
		var lsb = _this.romData.charCodeAt(_this.smcOffset + _this.headerStart + 0x4C);
		var val = utils.get2ByteValue(msb, lsb); 
		return val;
	}
};

module.exports = SNESEmu;