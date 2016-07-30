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

var get2ByteValue = function(MSB, LSB) {
	return (MSB << 8) | LSB;
};

var get3LittleEndianByteValue = function(Byte1, Byte2, Byte3) {
	return (Byte2 << 16)(Byte2 << 8) | Byte1;
};

var getBigEndianWordArray = function(word) {
	var temp = new ArrayBuffer(2);
	var retVal = new DataView(temp);
	if (word < 0) {
		retVal.setUint16(0, word);
	} else {
		retVal.setInt16(0, word);
	}
	return retVal;
};

var getMSBFromWord = function(word) {
	var arr = getBigEndianWordArray(word);
	return arr.getUint8(0);
};

var getLSBFromWord = function(word) {
	var arr = getBigEndianWordArray(word);
	return arr.getUint8(1);
};

var getStringFromBuffer = function(buffer, offset, length) {
	var dataView = new DataView(buffer.buffer.slice(offset, offset+length));
	//This is a lot quicker, and more elegant, if it's supported, but since it's not supported by all modern browsers, I'm going to support not having it.
	if(window.TextDecoder) {
		var decoder = new TextDecoder("utf-8");
		return decoder.decode(dataView);
	}
	//If we have to, we'll iterate over everything.
	var str = "";
	for(var i = 0; i < length; i++){
		var idx = offset + i;
		var character = dataView.getInt8(idx);
		if(!character){break;}
		str += String.fromCharCode(character);
	}
	
	return str;
};

var DECIMAL_MODES = {
	BINARY:  false,
	DECIMAL: true,
};
var BIT_SELECT = {
	BIT_16: false,
	BIT_8:  true,
};

module.exports = {
	get2ByteValue: get2ByteValue,
	getStringFromBuffer: getStringFromBuffer,
	DECIMAL_MODES: DECIMAL_MODES,
	BIT_SELECT: BIT_SELECT,
	getMSBFromWord: getMSBFromWord,
	getLSBFromWord: getLSBFromWord,
}