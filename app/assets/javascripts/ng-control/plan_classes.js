function PlanClasses($scope,$http,$attrs,$cookies,$sce,$window) {

  // Computed Classes ///////////////////////////////////////////////////////////////////////////

  $scope.op_class = function(op) {
    var c = "op";
    if ( op == $scope.current_op || op.multiselect ) {
      c += " op-selected";
    }
    return c;
  }

  $scope.io_class = function(op,fv) {

    var c = "field-value";

    if ( $scope.current_fv && 
         $scope.current_fv.role == 'input' && 
         fv.role == 'output' && 
         fv.field_type.can_produce($scope.current_fv) ) {

      c += " field-value-compatible";

    } else if ( $scope.current_fv && 
                $scope.current_fv.role == 'output' && 
                fv.role == 'input' && 
                $scope.current_fv.field_type.can_produce(fv) ) {

      c += " field-value-compatible";

    } else if ( fv.valid() ) {
      c += " field-value-valid";
    } else {
      c += " field-value-invalid";
    }

    return c;

  }

  $scope.wire_class = function(wire) {

    var c = wire == $scope.current_wire ? 'wire-selected' : 'wire';

    if ( !wire.consistent() ) {
      c += " wire-inconsistent";
    }

    return c;

  }

  $scope.wire_arrow_class = function(wire) {

    var c = wire == $scope.current_wire ? 'wire-arrowhead-selected' : 'wire-arrowhead';

    if ( !wire.consistent() ) {
      c += " wire-arrowhead-inconsistent";
    }

    return c;

  }

  $scope.parameter_class = function(op, fv) {
    var c = "parameter";
    if ( fv.value != undefined ) {
      c += " parameter-has-value";
    } else {
      c += " parameter-has-no-value";
    };
    return c;
  }

}