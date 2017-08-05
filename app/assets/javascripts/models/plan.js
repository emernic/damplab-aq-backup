AQ.Plan.record_methods.reload = function() {

  var plan = this;
  plan.recompute_getter('data_associations');

  AQ.PlanAssociation.where({plan_id: plan.id}).then(pas => {
    AQ.Operation.where(
      {id: aq.collect(pas,pa => pa.operation_id)},
      {methods: [ "field_values", "operation_type", "jobs" ] }
    ).then(ops => {
      plan.operations = ops;
      plan.recompute_getter('costs');
      aq.each(plan.operations, op => {
        op.field_values = aq.collect(op.field_values,(fv) => {
          return AQ.FieldValue.record(fv);  
        })
        op.jobs = aq.collect(op.jobs, job => {
          return AQ.Job.record(job);
        });
        op.reload().then(op => {
          op.open = false;
          AQ.update();
        });
      });
      plan.recompute_getter("deletable")
    });
  });

}

AQ.Plan.record_methods.save = function() {

  var plan = this;
  plan.saving = true;  

  var before = plan;

  if ( plan.id ) {

    return new Promise((resolve,reject) => {
      AQ.http.put('/plans/' + plan.id + '.json',plan.serialize()).then(response => {
        delete plan.saving;
        var p = AQ.Plan.record(response.data).marshall();   
        AQ.Test.plan_diff(before,p)             
        resolve(p);
      }).catch(response => { 
        console.log(response);
        plan.errors = [ "PUT error" ]
      });
    });

  } else {

    return new Promise((resolve,reject) => {
      AQ.post('/plans.json',plan.serialize()).then(response => {
        delete plan.saving;
        var p = AQ.Plan.record(response.data).marshall();
        AQ.Test.plan_diff(before,p)
        resolve(p);
      }).catch(response => { 
        console.log(response);
        plan.errors = [ "POST error" ]
      });
    });

  }

}

AQ.Plan.load = function(id) {
  return new Promise((resolve,reject) => {
    AQ.get("/plans/" + id + ".json").then(response => {   
      var up = AQ.Plan.record(response.data).marshall();
      resolve(up);
    })
  });
}

AQ.Plan.record_methods.submit = function(user) {

  var plan = this.serialize(),
      user_query = user ? "?user_id=" + user.id : "";

  return new Promise(function(resolve,reject) {
    AQ.get('/plans/start/'+plan.id+user_query,plan).then(
      (response) => {
        resolve();
      }, (response) => {
        reject(response.data);
      }
    );
  });

}

AQ.Plan.record_methods.cost_to_amount = function(c) {
  c.base = c.materials + c.labor * c.labor_rate;
  c.total = c.base * ( 1.0 + c.markup_rate );
  return c.total;
}

AQ.Plan.record_methods.estimate_cost = function() {

  var plan = this;
  plan.estimating;

  if ( !plan.estimating ) {
  
    plan.estimating = true;
    var serializeed_plan = plan.serialize();

    AQ.post('/launcher/estimate',serializeed_plan).then( response => {

      if ( response.data.errors ) {

        plan.cost = { error: response.data.errors };

      } else {

        var errors = [];

        plan.cost = {
          messages: response.data.messages,
          costs: response.data.costs,
          total: aq.sum(response.data.costs, c => {
            if ( c.error ) {
              errors.push(c.error.replace(/\(eval\)/g, 'cost'));
              return 0;
            } else {
              return plan.cost_to_amount(c);
            }
          })
        };

        if ( errors.length > 0 ) {
          plan.cost.error = errors.join(", ");
        }

      } 

      aq.each(plan.operations, op => {
        aq.each(response.data.costs, cost => {
          if ( op.id == cost.id ) {
            if ( !cost.error ) {
              op.cost = cost.total;  
            } else {
              op.cost = cost.error;
            }
          }
        });
      });

      plan.estimating = false;

    });

  }

}

AQ.Plan.record_getters.cost_total = function() {
  delete this.cost_total;
  this.costs;
}

AQ.Plan.record_getters.costs = function() {

  var plan = this;
  delete plan.costs;
  plan.costs = [];

  AQ.get('/plans/costs/'+plan.id).then(response => {

    plan.costs = response.data;
    plan.cost_total = 0;
    plan.cost_so_far = 0;

    aq.each(plan.costs, cost => {
      aq.each(plan.operations, op => {
        if ( cost.id == op.id ) {
          op.cost = cost;
          plan.cost_total += plan.cost_to_amount(cost);
          if ( op.status == "done" ) {
            plan.cost_so_far += plan.cost_to_amount(cost);
          }
        }
      })
    })

  });

  return plan.costs;

}

AQ.Plan.record_methods.cancel = function(msg) {

  var plan = this;

  return new Promise(function(resolve,reject) {  
    AQ.get('/plans/cancel/' + plan.id + "/" + msg).then(
      (response) => { 
        plan.reload();
        resolve(response.data);
        plan.recompute_getter("deletable");
      },
      (response) => { reject(response.data.errors) }
    );
  });  

}

AQ.Plan.record_methods.link_operation_types = function(operation_types) {

  aq.each(this.operations,(operation) => {
    operation.operation_type = aq.find(operation_types,(ot) => { 
      return ot.id == operation.operation_type.id 
    } );
  });

}

AQ.Plan.list = function(offset,user,plan_id) {

  var user_query = user ? "&user_id=" + user.id : "";

  var plan_query = plan_id ? "&plan_id=" + plan_id : "";

  return new Promise(function(resolve,reject) {
    AQ.get('/launcher/plans?offset='+offset+user_query+plan_query).then(
      (response) => {
        AQ.Plan.num_plans = response.data.num_plans;
        resolve(aq.collect(response.data.plans,(p) => { 
          var plan = AQ.Plan.record(p);
          plan.operations = aq.collect(plan.operations,(op) => {
            var operation = AQ.Operation.record(op);
            operation.mode = 'io'; // This is for the launcher UI.
            operation.field_values = aq.collect(
              aq.where(response.data.field_values, (fv) => {
                return fv.parent_id == operation.id;
              }), (fv) => { return AQ.FieldValue.record(fv); })
            operation.jobs = aq.collect(op.jobs, job => {
              return AQ.Job.record(job);
            });            
            return operation;
          });
          return plan;
        }));
      }, (response) => {
        reject(response.data.errors);
      }
    );
  });

}

AQ.Plan.record_methods.wire = function(from_op, from, to_op, to) {

  var plan = this;

  if ( !plan.wires ) {
    plan.wires = [];
  }

  var wire = AQ.Wire.make({
      from_op: from_op,
      from: from,
      to_op: to_op,
      to: to
    });

  plan.wires.push(wire);

  return wire;

}

AQ.Plan.record_methods.unwire = function(op) {

  var plan = this;

  aq.each(plan.wires, (wire) => {
    if ( wire.from_op == op || wire.to_op == op ) {
      wire.disconnect();    
      aq.remove(plan.wires,wire);
    }
  });

}

AQ.Plan.record_methods.remove_wires_to = function(op,fv) {

  var plan = this;

  aq.each(plan.wires, (wire) => {  
    if ( wire.to_op == op && wire.to == fv ) {
      wire.disconnect();
      aq.remove(plan.wires,wire);
    }
  });

  return plan;

}

AQ.Plan.record_methods.remove_wires_from = function(op,fv) {

  var plan = this;

  aq.each(plan.wires, (wire) => {  
    if ( wire.from_op == op && wire.from == fv ) {
      wire.disconnect();
      aq.remove(plan.wires,wire);
    }
  });

  return plan;

}

AQ.Plan.record_methods.is_wired = function(op,fv) {

  var plan = this,
      found = false;

  aq.each(plan.wires, (wire) => {  
    if ( wire.to_op == op && wire.to == fv ) {
      found = true;
    }
  });

  return found;

}

AQ.Plan.record_methods.propagate_down = function(fv,sid) { // propogate sid to incoming ops

  var plan = this;

  aq.each(plan.wires, wire => {
    if ( wire.to.rid === fv.rid ) {                      // found an incoming wire
      wire.from_op.assign_sample(wire.from,sid);         // assign sample
      if ( wire.from.role == 'output' ) {                // if the incoming wire is from an output to this fv (why wouldn't it be?)
        wire.from_op.instantiate(plan,wire.from,sid)     // call instantiate on the source op's from field_value with sid
      }
      aq.each(wire.from_op.field_values, subfv => {
        if ( wire.from.route_compatible(subfv) ) {
          plan.propagate_down(subfv,sid);
        }
      })
    }
  });

  return plan;

}

AQ.Plan.record_methods.propagate_up = function(fv,sid) { // propogate sid to incoming ops

  var plan = this;

  aq.each(plan.wires, wire => {
    if ( wire.from.rid === fv.rid ) {                    // found an outgoing wire
      wire.to_op.assign_sample(wire.to,sid)              // assign sample
      if ( wire.to.role == 'input' ) {                   // if the outgoing wire is to an output to the other fv (why wouldn't it be?)
        wire.to_op.instantiate(plan,wire.to,sid)         // call instantiate on the destination op's to field_value with sid
      }
      aq.each(wire.to_op.field_values, superfv => {
        if ( wire.from.route_compatible(superfv) ) {
          plan.propagate_up(superfv,sid);
        }
      })
    }
  });

  return plan;

}

AQ.Plan.record_methods.propagate = function(op,fv,sid) { // propagate the choice of sid for fv to connected operations 

  var plan = this;

  if ( ! fv.field_type.array ) {

    aq.each(op.field_values,io => {
      if ( fv.route_compatible(io) ) {
        plan.propagate_down(io,sid)
        plan.propagate_up(io,sid);
      }  
    })

  } else {

    plan.propagate_down(fv,sid)
    plan.propagate_up(fv,sid)

  }

  return this;

}


AQ.Plan.record_methods.add_wire_from = function(fv,op,pred) {

  var plan = this;

  var preop = AQ.Operation.record({
    routing: {},
    form: { input: {}, output: {} }
  }).set_type(pred.operation_type);

  plan.operations.push(preop)

  var preop_output = preop.output(pred.output.name);
  plan.remove_wires_to(op,fv);

  var wire = plan.wire(preop,preop_output,op,fv); 

  if ( fv.field_type.array ) {
    plan.propagate(op,fv,fv.sample_identifier);
  } else {
    plan.propagate(op,fv,op.routing[fv.routing])  
  }

  return preop;

}

AQ.Plan.record_methods.add_wire_to = function(fv,op,suc) {

  var plan = this;

  var postop = AQ.Operation.record({
    routing: {},
    form: { input: {}, output: {} }
  }).set_type(suc.operation_type);

  plan.operations.push(postop);

  var postop_input = postop.input(suc.input.name);
  plan.remove_wires_from(op,fv);

  var wire = plan.wire(op,fv,postop,postop_input);  

  if ( fv.field_type.array ) {
    plan.propagate(op,fv,fv.sample_identifier);
  } else {
    plan.propagate(op,fv,op.routing[fv.routing])  
  }  

  return postop;

}

AQ.Plan.record_methods.remove_wire = function(wire) {

  var plan = this;
  wire.disconnect();
  aq.remove(plan.wires, wire);

}

AQ.Plan.record_methods.debug = function() {

  var plan = this;
  plan.debugging = true;

  return new Promise(function(resolve,reject) {  

    AQ.get("/plans/" + plan.id + "/debug").then(
      response => {
        console.log(response);
        plan.reload();
        plan.debugging = false;
      }
    );

  });
  
}

AQ.Plan.record_methods.relaunch = function() {

  var plan = this;

  return new Promise(function(resolve,reject) {
    AQ.get("/launcher/" + plan.id + "/relaunch").then(
      response => {
        var p = AQ.Plan.record(response.data.plan).marshall();
        resolve(p,response.data.issues)
      },
      response => reject(null,response.data.issues)
    )
  });

}

AQ.Plan.getter(AQ.Budget,"budget");

AQ.Plan.record_methods.wire_aux = function(op, wires, operations) {

  var plan = this;

  aq.each(wires, w => {
    var fv = op.field_value_with_id(w.to_id);
    if ( fv ) {
      aq.each(operations,from_op => {
        var from_fv = from_op.field_value_with_id(w.from_id);
        if ( from_fv ) {
          var new_from_op = from_op.copy(),
              new_from_fv = new_from_op.field_value_like(from_fv);
          plan.wire(new_from_op, new_from_fv, op, fv)
              .wire_aux(new_from_op,wires, operations);
        }
      });
    }
  });

}

AQ.Plan.record_methods.copy = function() {

  var old_plan = this;

  return new Promise(function(resolve, reject) {

    AQ.Plan.where({id: old_plan.id},{methods: ['wires','goals']}).then( plans => {

      var plan = AQ.Plan.record(plans[0]),
          new_plan = AQ.Plan.record({});

      new_plan.operations = aq.collect(plan.goals, g => {
        return AQ.Operation.record(g).copy();
      });

      aq.each(new_plan.operations, op => {
        new_plan.wire_aux(op, plans[0].wires, old_plan.operations);
      });

      resolve(new_plan);

    });
  });

}

AQ.Plan.record_getters.deletable = function() {

  var plan = this;

  delete plan.deletable;
  plan.deletable = true;

  aq.each(plan.operations, op => {
    if ( op.status != 'error' || op.jobs === undefined || op.jobs.length > 0 ) {
      plan.deletable = false;
    }
  });

  return plan.deletable;

}

AQ.Plan.record_methods.valid = function() {

  var plan = this,
      v = plan.operations.length > 0;

  aq.each(plan.operations, op => {
    aq.each(op.field_values, fv => {
      v = v && fv.valid();
    })
  })

  return v;
}

AQ.Plan.record_methods.destroy = function() {

  var plan = this;

  return new Promise(function(resolve,reject) {
    AQ.http.delete("/plans/" + plan.id);
    resolve();
  });

}

