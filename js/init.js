var SNESEmu = require('./SNES.js');

window.onload = function(){
	// Check for the various File API support.
	if (!(window.File && window.FileReader && window.Blob)) {
	  alert('The File APIs are not fully supported in this browser.  These are needed in order to load a ROM.');
	  return;
	}
	
	//This is used to startup our emulator
	function loadRomContent(blob_content){
		var emulator = new SNESEmu(document.getElementById( 'canv' ), blob_content);
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

	document.getElementById('fileinput').addEventListener('change', handleFileSelect, false);
};