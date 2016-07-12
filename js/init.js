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

var SNESEmu = require('./SNES.js');
var emulator;

window.onload = function(){
	// Check for the various File API support.
	if (!(window.File && window.FileReader && window.Blob)) {
	  alert('The File APIs are not fully supported in this browser.  These are needed in order to load a ROM.');
	  return;
	}
	
	//This is used to startup our emulator
	function loadRomContent(blob_content){
		emulator = new SNESEmu(document.getElementById( 'canv' ), blob_content);
	}

	
	function handleFileSelect(evt) {
		var files = evt.target.files; // FileList object
		// Loop through the FileList and startup the emulator
		for (var i = 0, f; f = files[i]; i++) {
			var reader = new FileReader();
			// Closure to capture the file information.
			reader.onload = (function(theFile) {
				return function(e) {
					loadRomContent(e.target.result);
				};
			})(f);
			// Read in the image file as a data URL.
			reader.readAsBinaryString(f);
		}
	}

	function keypressHandler(evt){
		if (emulator && evt.keyCode === 96) {
			
			emulator.keepRunning = !emulator.keepRunning; 
		}
	};
	
	document.addEventListener('keypress', keypressHandler, false);
	document.getElementById('fileinput').addEventListener('change', handleFileSelect, false);
};