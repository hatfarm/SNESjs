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
var Logger = require('./logger.js');
var POINTER_INCREMENT_DECREMENT_AMOUNT = 1;

var Stack = function() {
	"use strict";
	var memory;
	var pointer = new Uint16Array(1);
	var logger = Logger;
	
	this.push = function(val) {
		memory.setROMProtectedByteAtLocation(0, pointer[0], val);
		logger.log(val.toString(16) + " pushed to Stack at location " + pointer[0].toString(16) + ".");
		var newPointer = pointer[0] - POINTER_INCREMENT_DECREMENT_AMOUNT;
		if (newPointer < 0) {
			throw new Error("Stack Pointer Decremented beyond 0x0000");
		}
		this.setPointer(newPointer);
	};
	
	this.pop = function() {
		var newPointer = pointer[0] + POINTER_INCREMENT_DECREMENT_AMOUNT;
		if (newPointer > 0xFFFF) {
			throw new Error("Stack Pointer Incremented beyond 0xFFFF");
		}
		this.setPointer(newPointer);
		logger.log("Popping " + memory.getByteAtLocation(0, pointer[0]).toString(16) + " from location " + pointer[0].toString(16));
		return memory.getByteAtLocation(0, pointer[0]);
	};
	
	this.setPointer = function(val) {
		//logger.log("Stack Pointer: " + val.toString(16));
		pointer[0] = val;
	};
	
	this.init = function(mem) {
		memory = mem;
		pointer[0] = 0x01FF;
	};
	
	this.getPointer = function() {
		return pointer[0];
	};
};

module.exports = Stack;