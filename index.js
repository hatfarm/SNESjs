var express = require('express');
var app = express();
var crypto = require('crypto');
var fs = require('fs');

app.set('view engine', 'pug');
app.use('/css', express.static('css'));
app.use('/dist', express.static('dist'));
app.use('/games', express.static('roms'));

var roms = [];
fs.readdir('roms/', function(err, items) {
	for (var i=0; i<items.length; i++) {
		var name = items[i];
		if (name.endsWith(".smc") || name.endsWith(".sfc")) {
			var hash = crypto.createHash('md5').update(name).digest('hex');
			roms.push({
				key: hash,
				romName: name,
			});
		}
	}
});

app.get('/', function (req, res) {
	
	res.render('index', { romList: roms });
});

app.get('/roms/:gameHash', function (req, res) {
	for(var i = 0; i < roms.length; i++) {
		if (roms[i].key === req.params.gameHash) {
			res.render('game', { romName : roms[i].romName });
			break;
		}
	}
});

app.listen(3000, function () {
	console.log('Example app listening on port 3000!');
});