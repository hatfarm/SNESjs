var proc = function() {
	//These are ENUMS that are used by the processor
	var DECIMAL_MODES = {
		BINARY:  0,
		DECIMAL: 1,
	};
	var BIT_SELECT = {
		BIT_16: 0,
		BIT_8:  1,
	};
	//These are flags, some make more sense than others as boolean, but technically they all could be
	this.carry = 0;
	this.isZero = false;
	this.IRQDisabled = false;
	this.decimalMode = DECIMAL_MODES.BINARY;
	this.indexRegisterSelect = BIT_SELECT.BIT_16;
	this.memAccSelect = BIT_SELECT.BIT_16;
	this.overflow = false;
	this.negative = false;
};