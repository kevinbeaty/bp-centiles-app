(function(){
  FhirLoader = {};

  FhirLoader.demographics = function() {
    var dfd = $.Deferred();

    setTimeout(function(){
      var name = 'Allen Vitalis'
      var birthday = new Date('2004-04-07' ).toISOString();
      var gender ='male';
      dfd.resolve({
        name: name,
        gender: gender,
        birthday: birthday
      });
    }, 10)
    /*smart.patient.read().done(function(pt) {
      var name = pt.name[0].given.join(" ") +" "+ pt.name[0].family.join(" ");
      var birthday = new Date(pt.birthDate).toISOString();
      var gender = pt.gender;

      dfd.resolve({
        name: name,
        gender: gender,
        birthday: birthday
      });

    }).fail(function(e) {
      dfd.reject(e.message || e);
    });
    */

    return dfd.promise();
  };

  FhirLoader.vitals = function() {
    var dfd = $.Deferred();
    getEncounters().then(function(encs){
      var encounters = extractEntries(encs)
      getObservations().then(function(obs){
      var observations = extractEntries(obs)
        dfd.resolve(processObservations(observations,encounters));
      })
    })
    /*
    $.when(getObservations(),getEncounters()).done(function(observations,encounters) {
    $.when(getObservations(),getEncounters()).done(function(observations,encounters) {
        dfd.resolve(processObservations(observations,encounters));
    });
    */
    return dfd.promise();
  }


  function cachedLink(items, target) {
    var match = null;
    items.forEach(function(r) {
        var rid = r.resourceType + '/' + r.id;
        if (rid === target.reference) {
            match = r;
        }
    });
    return match;
  }


  function processObservations(observations, encounters){
    var vitals = {heightData: [], bpData: []};

    var vitalsByCode = smart.byCode(observations, 'code');

    (vitalsByCode['8302-2']||[]).forEach(function(v){
      vitals.heightData.push({
        vital_date: v.effectiveDateTime,
        height: smart.units.cm(v.valueQuantity)
      });
    });

    (vitalsByCode['55284-4']||[]).forEach(function(v){

      var components = v.component;

      var diastolicObs = components.find(function(component){
      	return component.code.coding.find(function(coding) {
      		return coding.code === "8462-4";
      	});
      });
      var systolicObs = components.find(function(component){
      	return component.code.coding.find(function(coding) {
      		return coding.code === "8480-6";
      	});
      });

      var systolic = systolicObs.valueQuantity.value;
      var diastolic = diastolicObs.valueQuantity.value;
      var extensions = v.extension;
      var obj = {
        vital_date: v.effectiveDateTime,
        systolic: systolic,
        diastolic: diastolic,
        isCurrent: v.meta && v.meta.isCurrent
      };

      if (extensions) {
         var position = extensions.find(function(extension) {
            return extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/vital-signs#position";
         });
         if (position) {
      	     var coding = position.valueCodeableConcept.coding[0];
             obj["bodyPositionCode"] = coding.system + coding.code;
         }
      }

      if (v.encounter){
           var encounter = cachedLink(encounters, v.encounter);
           var encounter_type = encounter.class;
           if (encounter_type === "outpatient") {
               encounter_type = "ambulatory";
           }
           obj["encounterTypeCode"] = "http://smarthealthit.org/terms/codes/EncounterType#" + encounter_type;
      }

      if (v.bodySite) {
        obj["bodySiteCode"] = v.bodySite.coding[0].system + v.bodySite.coding[0].code;
      }

      if (v.method) {
        obj["methodCode"] = v.method.coding[0].system + v.method.coding[0].code;
      }
      vitals.bpData.push(obj);
    });

    return vitals;
  };

function getObservations(){
    return getFixtureJSON('observations')
        //return smart.patient.api.fetchAll({type: "Observation", query: {code: {$or: ['http://loinc.org|8302-2','http://loinc.org|55284-4']}}});

  };

  function defaultOnFail(promise, defaultValue) {
      var deferred = $.Deferred();
      $.when(promise).then(
          function (data) {
            deferred.resolve(data);
          },
          function () {
            deferred.resolve(defaultValue);
          }
      );
      return deferred.promise();
  };

  function getFixtureJSON(fixture) {
    return $.getJSON('/fixtures/'+fixture+'.json')
  };

  function extractEntries(obs){
    var result = obs.entry.map(function(ob){
      return ob.resource
    })
    return result
  }

  function getEncounters(){
    return getFixtureJSON('encounters')
    //  return defaultOnFail(smart.patient.api.fetchAll({type: "Encounter"}),[]);
  };

  var smart = window.smart || (window.smart = {})
	smart.byCode = function byCode(observations, property){
		var ret = {};
		if (!Array.isArray(observations)){
			observations = [observations];
		}
		observations.forEach(function(o){
			if (o.resourceType === "Observation") {
					o[property].coding.forEach(function(coding){
						ret[coding.code] = ret[coding.code] || [];
						ret[coding.code].push(o);
					});

          // set meta property if present
          if (o.hasOwnProperty('meta') && o.meta.isCurrent){
            ret.isCurrent = o.meta.isCurrent;
          }
			}
		});
		return ret;
	};
  smart.units = {
		cm: function(pq){
			if(pq.code == "cm") return pq.value;
			if(pq.code == "m") return 100*pq.value;
			if(pq.code == "in") return 2.54*pq.value;
			if(pq.code == "[in_us]") return 2.54*pq.value;
			if(pq.code == "[in_i]") return 2.54*pq.value;
			throw "Unrecognized length unit: " + pq.code
		},
		kg: function(pq){
			if(pq.code == "kg") return pq.value;
			if(pq.code == "g") return pq.value / 1000;
			if(pq.code.match(/lb/)) return pq.value / 2.20462;
			if(pq.code.match(/oz/)) return pq.value / 35.274;
			throw "Unrecognized weight unit: " + pq.code
		},
		any: function(pq){
			return pq.value
		}
	}

})();
