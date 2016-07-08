var get2ByteValue = function(MSB, LSB) {
	return (MSB * 256) + LSB;
}

module.exports = {
	get2ByteValue: get2ByteValue,
}