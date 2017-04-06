var file_reader=require('fs');

var template=file_reader.readFileSync("./test/module.json","utf-8");

var func=require("./index.js");


console.log(func(template));