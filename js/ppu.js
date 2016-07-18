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

var DEFAULT_WIDTH = 256;
var DEFAULT_HEIGHT = 224;
var EXTENDED_HEIGHT = 239;
var MAX_WIDTH = DEFAULT_WIDTH * 2;
var MAX_HEIGHT = EXTENDED_HEIGHT * 2;

var curColorIdx = 0;

/*The Picture Processing Unit (PPU) is used to render the image to a canvas that will 
	then get stretched to fit the desired display port*/
var PPU = function() {
	//This canvas is hidden, it will be written to and then the image will be pasted to the display's canvas, the pasting will be done by the SNES proper.
	this.canvas = document.createElement('canvas');
	this.canvas.width  = DEFAULT_WIDTH;
	this.canvas.height = DEFAULT_HEIGHT;
	this.ctx = this.canvas.getContext( '2d' );
	this.ctx.fillStyle = "rgb(0,0,0)";
	this.ctx.fillRect( 0, 0, this.canvas.width, this.canvas.height );
	this.ctx.fillStyle = "rgb(255,255,255)";
	this.ctx.fillText("SNESjs",114,110);
	
	//This image will be used by the SNES to scale the image created by the ppu
	this.renderedImage = document.createElement('img');
	
	//There are 8 modes for rendering
	this.BGMode = 0;
	
	this.VRAM = new Array(0x10000);
};

PPU.prototype.init = function(mem) {
	this.memory = mem;
};

PPU.prototype.render = function() {
	//TODO: Render the image
}

PPU.prototype.getImage = function() {
	this.render();
	var new_image_url = this.canvas.toDataURL();
	this.renderedImage.src = new_image_url;
	return this.renderedImage;
};

PPU.prototype.setFPS = function(fps) {
	if(curColorIdx >= 200) {
		curColorIdx = 0;
	} else {
		curColorIdx++;
	}
	this.ctx.fillStyle = "rgb("+curColorIdx+","+curColorIdx+","+curColorIdx+")";
	this.ctx.fillRect( 0, 0, this.canvas.width, this.canvas.height );
	this.ctx.fillStyle = "rgb(255,255,255)";
	this.ctx.fillText("SNESjs",114,110);
	this.ctx.fillText("FPS:" + fps.toFixed(1), 20, 20);
};

module.exports = PPU;