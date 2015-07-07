function appendBuffer(buffer1,buffer2){
	var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
	tmp.set(new Uint8Array(buffer1), 0);
	tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
	return tmp.buffer;
}

//data here are layer object
//var data={type:"FeatureCollection",features:[],fileName:"example"};
function writeToShpFile(data){
	//properties, used for .dbf file
	var properties=[];
	//.shp file
	var filebuffer=new ArrayBuffer(100);
	//.shx file
	var shxbuffer=new ArrayBuffer(100);
	//record start, to be updated
	var recordoffset=[];
	recordoffset.push(50);//50 here because length of header is 50
	//record content length
	var recordlen=[];
	//init
	for(var i=0;i<100;i++){
		filebuffer[i]=0;
	}
	for(var i=0;i<100;i++){
		shxbuffer[i]=0;
	}
	
	var dv=new DataView(filebuffer);
	var shxdv=new DataView(shxbuffer);
	//start with 9994
	dv.setInt32(0,9994);
	shxdv.setInt32(0,9994);
	//file length, to be added
	var filelen=50;
	var shxfilelen=50;
	//version=1000
	dv.setInt32(28,1000,true);
	shxdv.setInt32(28,1000,true);
	//shape type
	dv.setInt32(32,5,true);
	shxdv.setInt32(32,5,true);
	//bounding box
	var Xmin=Number.MAX_VALUE
		,Ymin=Number.MAX_VALUE
		,Xmax=Number.MIN_VALUE
		,Ymax=Number.MIN_VALUE;
	for(var i=0;i<data.features.length;i++){
		var bbox=data.features[i].geometry.bbox;
		Xmin=Math.min(Xmin,bbox[0]);
		Ymin=Math.min(Ymin,bbox[1]);
		Xmax=Math.max(Xmax,bbox[2]);
		Ymax=Math.max(Ymax,bbox[3]);
	}
	//for shp file
	dv.setFloat64(36,Xmin,true);
	dv.setFloat64(44,Ymin,true);
	dv.setFloat64(52,Xmax,true);
	dv.setFloat64(60,Ymax,true);
	//for shx file
	shxdv.setFloat64(36,Xmin,true);
	shxdv.setFloat64(44,Ymin,true);
	shxdv.setFloat64(52,Xmax,true);
	shxdv.setFloat64(60,Ymax,true);
	//add the records of basin
	for(var i=0;i<data.features.length;i++){
		//for each basin
		var obj=data.features[i];
		//length of record
		var contentlen=0;
		//num of parts
		var numparts=0;
		//num of points
		var numpoints=0;
		//points
		var points=[];
		//parts
		var parts=[];
		//parts start points
		var partstart=[];
		//start with zero, to be modified later
		partstart.push(0);
		//get the coords, multi-dimension array of points
		var coord=obj.geometry.coordinates;
		//get properties
		properties.push(obj.properties);
		
		var stack=[];
		var indexstack=[];
		stack.push(coord);
		indexstack.push(0);
		var curObj=coord;
		var nextindex=0;
		while(nextindex<curObj.length){
			while(curObj.constructor===Array){
				var tempind=indexstack[indexstack.length-1];
				curObj=curObj[tempind];
				stack.push(curObj);
				indexstack.push(0);
			}
			stack.pop();
			indexstack.pop();
			//points array
			stack.pop();
			var top=stack.pop();
			indexstack.pop();
			var index=indexstack.pop();
			var templen=0;
			for(var j=0;j<top.length;j++){
				//part start
				templen++;
				//record header
				contentlen+=16;
				//push points
				points.push(top[j][0]);
				points.push(top[j][1]);
				//record content
				numpoints++;
			}
			//record content
			numparts++;
			//push partstart
			partstart.push(partstart[partstart.length-1]+templen);
			//get the next
			
			nextindex=indexstack.pop()+1;
			indexstack.push(nextindex);
			curObj=stack.pop();
			stack.push(curObj);
			
			while(nextindex>=curObj.length){
				indexstack.pop();
				stack.pop();
				if(stack.length==0)
					break;
				nextindex=indexstack.pop()+1;
				indexstack.push(nextindex);
				curObj=stack.pop();
				stack.push(curObj);
			}
		}
		
		//update the content length
		contentlen+=44+4*numparts;
		//push into record len array
		recordlen.push(contentlen/2);
		//push in next record's start
		recordoffset.push(recordoffset[recordoffset.length-1]+contentlen/2+4);
		//record header
		var recordHeader=new ArrayBuffer(8);
		var recordDV=new DataView(recordHeader);
		recordDV.setInt32(0,i+1);
		recordDV.setInt32(4,contentlen/2);
		//append record header to file buffer
		filebuffer=appendBuffer(filebuffer, recordHeader);
		//record content
		var recordContent=new ArrayBuffer(contentlen);
		recordDV=new DataView(recordContent);
		//set shape type
		recordDV.setInt32(0,5,true);
		//set bbox
		recordDV.setFloat64(4, obj.geometry.bbox[0],true);
		recordDV.setFloat64(12, obj.geometry.bbox[1],true);
		recordDV.setFloat64(20, obj.geometry.bbox[2],true);
		recordDV.setFloat64(28, obj.geometry.bbox[3],true);
		//set num of parts
		recordDV.setInt32(36,numparts,true);
		//set num of points
		recordDV.setInt32(40,numpoints,true);
		//set part start
		for(var j=0;j<partstart.length;j++){
			recordDV.setInt32(j*4+44,partstart[j],true);
		}
		//set points
		var pointstart=44+4*numparts;
		for(var j=0;j<points.length;j++){
			recordDV.setFloat64(j*8+pointstart,points[j],true);
		}
		//append record content to file buffer
		filebuffer=appendBuffer(filebuffer, recordContent);
		//update file len
		filelen+=(8+contentlen)/2;
		shxfilelen+=4;
	}
	dv=new DataView(filebuffer);
	shxdv=new DataView(shxbuffer);
	//update filelen in file header
	dv.setInt32(24,filelen);
	//update shx file len in shx file header
	shxdv.setInt32(24,shxfilelen);
	//append record to shx file
	for(var i=0;i<recordlen.length;i++){
		var tempbuffer=new ArrayBuffer(8);
		var tempDV=new DataView(tempbuffer);
		tempDV.setInt32(0,recordoffset[i]);
		tempDV.setInt32(4,recordlen[i]);
		//append
		shxbuffer=appendBuffer(shxbuffer,tempbuffer);
	}

	//iter properties to get value and field name
	var fieldname=[];
	var value=[];
	for(var i=0;i<properties.length;i++){
		if(i==0){
			for(var property in properties[0]){
				if(properties[0].hasOwnProperty(property)){
					fieldname.push(property);
				}
			}
		}
		var temparr=[];
		for(var property in properties[i]){
			if(properties[i].hasOwnProperty(property)){
				temparr.push(properties[i][property]);
			}
		}
//		console.log(temparr);
		value.push(temparr);
	}

	//.dbf file
	var dbfbuffer=new ArrayBuffer(32);
	//first record start
	var firststart=33;
	//length of one record
	var dbfrecordlen=1;
	//init
	for(var i=0;i<32;i++){
		dbfbuffer[i]=0;
	}
	var dbfdv=new DataView(dbfbuffer);
	//file type
	dbfdv.setInt8(0,3,true);
	//last update
	dbfdv.setInt8(1,15,true);	//YY 2015
	dbfdv.setInt8(2,4,true);		//MM 04
	dbfdv.setInt8(3,27,true)		//DD 27
	//number of records in file
	dbfdv.setInt32(4,properties.length,true);
	//code page mark
	dbfdv.setInt8(29,87,true);
	//write field info
	for(var i=0;i<fieldname.length;i++){
		var fieldbuffer=new ArrayBuffer(32);
		var fielddv=new DataView(fieldbuffer);
		for(var j=0;j<fieldname[i].length;j++){
			fielddv.setInt8(j,fieldname[i].charCodeAt(j),true);
		}
		//judge type
		if(value[0][i].constructor===Number){	//if is number
			//set field type and field length
			//if is some id
			if(fieldname[i].indexOf('ID')!=-1||fieldname[i].indexOf('id')!=-1){
				fielddv.setInt8(11,'N'.charCodeAt(0),true);
				fielddv.setInt8(16,9,true);
				//update record len
				dbfrecordlen+=9;
			}
			else{
				fielddv.setInt8(11,'F'.charCodeAt(0),true);
				fielddv.setInt8(16,19,true);
				//set decimal places
				fielddv.setInt8(17,11,true);
				//update record len
				dbfrecordlen+=19;
			}
		}
		else{									//if is string
			fielddv.setInt8(11,'C'.charCodeAt(0),true);
			fielddv.setInt8(16,254,true);
			//update record len
			dbfrecordlen+=254;
		}
		//append
		dbfbuffer=appendBuffer(dbfbuffer,fieldbuffer);

		//update first start
		firststart+=32;
	}
	//header terminator
	var termibuffer=new ArrayBuffer(1);
	var termidv=new DataView(termibuffer);
	termidv.setInt8(0,0x0D,true);
	dbfbuffer=appendBuffer(dbfbuffer,termibuffer);
	//update first start and record len
	dbfdv=new DataView(dbfbuffer);
	dbfdv.setInt16(8,firststart,true);
	dbfdv.setInt16(10,dbfrecordlen,true);
	//insert record
	for(var i=0;i<value.length;i++){
		//for each record insert 0x20 delete flag
		termibuffer=new ArrayBuffer(1);
		termidv=new DataView(termibuffer);
		termidv.setInt8(0,0x20,true);
		dbfbuffer=appendBuffer(dbfbuffer,termibuffer);	
		dbfdv=new DataView(dbfbuffer);
		
		//insert record value
		for(var j=0;j<value[i].length;j++){
			var tempvalue;
			//judge type
			if(value[i][j].constructor===Number){	//if is number
				//set field type and field length
				//if is some id
				if(fieldname[j].indexOf('ID')!=-1||fieldname[j].indexOf('id')!=-1){
					tempvalue=new ArrayBuffer(9);
					var tempdv=new DataView(tempvalue);
					var str=value[i][j].toString();
					var appendstr='';
					var appendnum=9-str.length;
					while(appendnum>0){
						appendstr+=' ';
						appendnum--;
					}
					str=appendstr+str;
					for(var k=0;k<str.length;k++){
						tempdv.setInt8(k,str.charCodeAt(k),true);
					}
				}
				else{
					tempvalue=new ArrayBuffer(19);
					var tempdv=new DataView(tempvalue);
					var str=value[i][j].toString();
					var appendstr='';
					var appendnum=19-str.length;
					while(appendnum>0){
						appendstr+='0';
						appendnum--;
					}
					str+=appendstr;
					if(str.length>=19){
						str=str.slice(0,18);
					}
//					console.log(i,value[i][j],str);
					for(var k=0;k<str.length;k++){
						tempdv.setUint8(k,str.charCodeAt(k),true);
					}
				}
			}
			else{									//if is string
				tempvalue=new ArrayBuffer(254);
				var tempdv=new DataView(tempvalue);
				var str=value[i][j].toString();
				var appendstr='';
				var appendnum=254-str.length;
				while(appendnum>0){
					appendstr+=' ';
					appendnum--;
				}
				str+=appendstr;
				for(var k=0;k<str.length;k++){
					tempdv.setInt8(k,str.charCodeAt(k),true);
				}
			}
			dbfbuffer=appendBuffer(dbfbuffer,tempvalue);
		}
	}
	
	
	//save file
	var saveByteArray = (function () {
	    var a = document.createElement("a");
	    document.body.appendChild(a);
	    a.style = "display: none";
	    return function (data, name) {
	        var blob = new Blob(data, {type: "octet/stream"}),
	            url = window.URL.createObjectURL(blob);
	        a.href = url;
	        a.download = name;
	        a.click();
	        window.URL.revokeObjectURL(url);
	    };
	}());

	saveByteArray([filebuffer], 'example.shp');
	saveByteArray([shxbuffer], 'example.shx');
	saveByteArray([dbfbuffer], 'example.dbf');
	
}