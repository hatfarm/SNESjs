window.onload = function(){
	// Check for the various File API support.
	if (!(window.File && window.FileReader && window.Blob)) {
	  alert('The File APIs are not fully supported in this browser.  These are needed in order to load a ROM.');
	  return;
	}
	
  };